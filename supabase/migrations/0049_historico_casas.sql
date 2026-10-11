-- Ruta de Bares - 0049: cierre de rutas, casa ganadora, temporadas e historico.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0048.
-- Idempotente: se puede re-ejecutar sin romper nada (`if not exists`,
-- disparadores quitados antes de ponerlos y funciones con `or replace`).
--
-- Que hace.
--
--   * CERRAR UNA RUTA (`casas_cerrar_ruta`, solo admins) guarda su resultado
--     final en `casas_resultados`: los puntos de cada casa, su puesto y la
--     ganadora (o ganadoras, si empatan arriba). Es una FOTO: solo totales por
--     casa, ningun dato de nadie, y SIN clave hacia `routes`, para que el
--     historico sobreviva al borrado de la ruta (que la politica obliga a
--     hacer a los pocos dias, 0027). Se puede volver a cerrar (rehace la foto)
--     o reabrir (`casas_reabrir_ruta`).
--   * Si se borra una ruta sin cerrar que tenia puntos, se cierra sola antes
--     (disparador), para no perder su resultado.
--   * TEMPORADAS (`temporadas`): un grupo de rutas (`routes.temporada_id`).
--     El historico se puede ver entero o por temporada.
--   * REINICIAR una ruta = anular todos sus puntos con un motivo
--     (`casas_admin_anular_ruta`); si estaba cerrada, se reabre.
--   * `casas_historico`: victorias, podios, puntos acumulados y rutas de cada
--     casa. `casas_palmares`: las rutas cerradas con su ganadora (el nombre de
--     la ruta solo a quien estuvo en ella o administra).
--   * `casas_resultado` / `casas_resultado_visto`: para que quien estuvo en la
--     ruta vea UNA vez la pantalla de la casa ganadora.

create table if not exists public.temporadas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (char_length(nombre) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table public.temporadas enable row level security;
revoke all on table public.temporadas from anon, authenticated;
grant select, insert, update, delete on table public.temporadas to authenticated;
drop policy if exists temporadas_select on public.temporadas;
create policy temporadas_select on public.temporadas for select to authenticated using (true);
drop policy if exists temporadas_write on public.temporadas;
create policy temporadas_write on public.temporadas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.routes add column if not exists temporada_id uuid references public.temporadas (id) on delete set null;

create table if not exists public.casas_resultados (
  -- Sin `references`: la ruta se borra y su resultado se queda.
  route_id     uuid primary key,
  ruta         text not null,
  fecha        date,
  temporada_id uuid references public.temporadas (id) on delete set null,
  ganadoras    text[] not null default '{}',
  -- [{house, puntos, miembros, puesto}] de la primera a la cuarta.
  resultado    jsonb not null,
  cerrada_at   timestamptz not null default now(),
  cerrada_por  uuid references public.profiles (id) on delete set null,
  automatica   boolean not null default false
);
alter table public.casas_resultados enable row level security;
revoke all on table public.casas_resultados from anon, authenticated;

create table if not exists public.casas_resultado_vistos (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  route_id uuid not null,
  visto_at timestamptz not null default now(),
  primary key (user_id, route_id)
);
alter table public.casas_resultado_vistos enable row level security;
revoke all on table public.casas_resultado_vistos from anon, authenticated;

-- La foto del resultado de una ruta (interna).
create or replace function public.casas_foto(p_route_id uuid, p_automatica boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
  v_ganadoras text[];
begin
  with t as (
    select c.casa as house,
           (coalesce((select sum(m.points) from public.point_movements m
                       where m.route_id = p_route_id and m.house = c.casa and m.annulled_at is null), 0)
            + coalesce((select sum(p.points) from public.casas_podios(p_route_id) p where p.house = c.casa), 0))::integer as puntos,
           (select count(*) from public.route_members rm join public.user_houses h on h.user_id = rm.user_id
             where rm.route_id = p_route_id and h.house = c.casa)::integer as miembros
      from (values ('mahou'), ('cruzcampo'), ('estrella'), ('alhambra')) as c (casa)
  ),
  r as (select t.*, rank() over (order by t.puntos desc)::integer as puesto from t)
  select jsonb_agg(jsonb_build_object('house', r.house, 'puntos', r.puntos, 'miembros', r.miembros, 'puesto', r.puesto)
                   order by r.puesto, r.house),
         coalesce(array_agg(r.house order by r.house) filter (where r.puesto = 1 and r.puntos > 0), '{}')
    into v_resultado, v_ganadoras
    from r;

  insert into public.casas_resultados (route_id, ruta, fecha, temporada_id, ganadoras, resultado, cerrada_at, cerrada_por, automatica)
  select ro.id, ro.name, ro.event_date, ro.temporada_id, v_ganadoras, v_resultado, now(), auth.uid(), p_automatica
    from public.routes ro where ro.id = p_route_id
  on conflict (route_id) do update
    set ruta = excluded.ruta, fecha = excluded.fecha, temporada_id = excluded.temporada_id,
        ganadoras = excluded.ganadoras, resultado = excluded.resultado,
        cerrada_at = excluded.cerrada_at, cerrada_por = excluded.cerrada_por, automatica = excluded.automatica;
end;
$$;

create or replace function public.casas_cerrar_ruta(p_route_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.casas_foto(p_route_id, false);
  -- Al volver a cerrar, todos vuelven a ver el resultado nuevo.
  delete from public.casas_resultado_vistos v where v.route_id = p_route_id;
  update public.casas_marcador c set cambiado_at = now() where c.route_id = p_route_id;
  return (select jsonb_build_object('ganadoras', cr.ganadoras, 'resultado', cr.resultado)
            from public.casas_resultados cr where cr.route_id = p_route_id);
end;
$$;

create or replace function public.casas_reabrir_ruta(p_route_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  delete from public.casas_resultados r where r.route_id = p_route_id;
  delete from public.casas_resultado_vistos v where v.route_id = p_route_id;
  update public.casas_marcador c set cambiado_at = now() where c.route_id = p_route_id;
end;
$$;

-- Reiniciar: anula todos los puntos de la ruta con un motivo y la reabre.
create or replace function public.casas_admin_anular_ruta(p_route_id uuid, p_motivo text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform public.casas_admin_requerir();
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.point_movements m
     set annulled_at = now(), annulled_by = auth.uid(), annul_reason = 'Reinicio de la ruta: ' || trim(p_motivo)
   where m.route_id = p_route_id and m.annulled_at is null;
  get diagnostics v_n = row_count;
  delete from public.casas_resultados r where r.route_id = p_route_id;
  delete from public.casas_resultado_vistos v where v.route_id = p_route_id;
  return v_n;
end;
$$;

-- Borrar una ruta con puntos y sin cerrar: se cierra sola antes.
create or replace function public.casas_al_borrar_ruta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.casas_resultados r where r.route_id = old.id)
     and exists (select 1 from public.point_movements m where m.route_id = old.id and m.annulled_at is null) then
    perform public.casas_foto(old.id, true);
  end if;
  delete from public.casas_resultado_vistos v where v.route_id = old.id;
  return old;
end;
$$;
drop trigger if exists routes_casas_resultado on public.routes;
create trigger routes_casas_resultado before delete on public.routes
  for each row execute function public.casas_al_borrar_ruta();

-- Cambiar la temporada de una ruta la cambia tambien en su resultado.
create or replace function public.casas_al_cambiar_temporada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.casas_resultados r set temporada_id = new.temporada_id where r.route_id = new.id;
  return null;
end;
$$;
drop trigger if exists routes_casas_temporada on public.routes;
create trigger routes_casas_temporada after update of temporada_id on public.routes
  for each row execute function public.casas_al_cambiar_temporada();

-- ---------------------------------------------------------------------------
-- Lo que ve la gente
-- ---------------------------------------------------------------------------
-- El resultado de una ruta cerrada (null si no lo esta) y si ya lo viste.
create or replace function public.casas_resultado(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not (public.is_route_participant(p_route_id, v_uid) or public.is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
             'ruta', r.ruta, 'ganadoras', r.ganadoras, 'resultado', r.resultado, 'cerrada_at', r.cerrada_at,
             'visto', exists (select 1 from public.casas_resultado_vistos v
                               where v.user_id = v_uid and v.route_id = p_route_id))
      from public.casas_resultados r where r.route_id = p_route_id
  );
end;
$$;

create or replace function public.casas_resultado_visto(p_route_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  insert into public.casas_resultado_vistos (user_id, route_id) values (auth.uid(), p_route_id)
  on conflict do nothing;
end;
$$;

-- Victorias, podios, puntos y rutas de cada casa (todas o de una temporada).
create or replace function public.casas_historico(p_temporada_id uuid default null)
returns table (house text, victorias integer, segundos integer, terceros integer, puntos integer, rutas integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return query
  with filas as (
    select (x ->> 'house') as casa, (x ->> 'puntos')::integer as pts, (x ->> 'puesto')::integer as puesto, r.ganadoras
      from public.casas_resultados r, jsonb_array_elements(r.resultado) x
     where p_temporada_id is null or r.temporada_id = p_temporada_id
  )
  select c.casa,
         (select count(*)::integer from filas f where f.casa = c.casa and f.casa = any (f.ganadoras)),
         (select count(*)::integer from filas f where f.casa = c.casa and f.puesto = 2 and f.pts > 0),
         (select count(*)::integer from filas f where f.casa = c.casa and f.puesto = 3 and f.pts > 0),
         coalesce((select sum(f.pts)::integer from filas f where f.casa = c.casa), 0),
         (select count(*)::integer from filas f where f.casa = c.casa)
    from (values ('mahou'), ('cruzcampo'), ('estrella'), ('alhambra')) as c (casa);
end;
$$;

-- Las rutas cerradas, de la mas reciente a la mas antigua.
create or replace function public.casas_palmares(p_temporada_id uuid default null)
returns table (route_id uuid, ruta text, fecha date, temporada text, ganadoras text[], resultado jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return query
  select r.route_id,
         case when public.is_admin() or public.is_route_participant(r.route_id, v_uid) then r.ruta end,
         r.fecha, t.nombre, r.ganadoras, r.resultado
    from public.casas_resultados r
    left join public.temporadas t on t.id = r.temporada_id
   where p_temporada_id is null or r.temporada_id = p_temporada_id
   order by coalesce(r.fecha, r.cerrada_at::date) desc, r.cerrada_at desc
   limit 200;
end;
$$;

revoke all on function public.casas_foto(uuid, boolean) from public, anon, authenticated;
revoke all on function public.casas_al_borrar_ruta() from public, anon, authenticated;
revoke all on function public.casas_al_cambiar_temporada() from public, anon, authenticated;
revoke all on function public.casas_cerrar_ruta(uuid) from public, anon;
revoke all on function public.casas_reabrir_ruta(uuid) from public, anon;
revoke all on function public.casas_admin_anular_ruta(uuid, text) from public, anon;
revoke all on function public.casas_resultado(uuid) from public, anon;
revoke all on function public.casas_resultado_visto(uuid) from public, anon;
revoke all on function public.casas_historico(uuid) from public, anon;
revoke all on function public.casas_palmares(uuid) from public, anon;
grant execute on function public.casas_cerrar_ruta(uuid) to authenticated;
grant execute on function public.casas_reabrir_ruta(uuid) to authenticated;
grant execute on function public.casas_admin_anular_ruta(uuid, text) to authenticated;
grant execute on function public.casas_resultado(uuid) to authenticated;
grant execute on function public.casas_resultado_visto(uuid) to authenticated;
grant execute on function public.casas_historico(uuid) to authenticated;
grant execute on function public.casas_palmares(uuid) to authenticated;

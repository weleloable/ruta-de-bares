-- Ruta de Bares - 0047: retos de cada ruta.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0046.
-- Idempotente: se puede re-ejecutar sin romper nada (`if not exists`,
-- disparadores y politicas quitados antes de ponerlos y funciones con
-- `or replace`).
--
-- Que hace.
--
--   * `retos`: los crea quien administra, por ruta, sin tocar codigo. Cada uno
--     tiene nombre, descripcion, una condicion de un catalogo cerrado, puntos,
--     un limite de personas que pueden conseguirlo (los primeros N; nulo = sin
--     limite) y si esta activo. Condiciones:
--       - categorias            X categorias distintas de consumicion;
--       - consumiciones_categoria  X consumiciones de una categoria;
--       - bares                 sellar X bares;
--       - encuentros_qr         X encuentros por QR;
--       - ruta_antes_de         completar la ruta antes de una hora.
--   * Para no premiar beber mas: un reto de consumiciones de una categoria con
--     alcohol pide como mucho 3, y todas van con la espera entre registros de
--     la 0045. "Sin alcohol" no tiene ese tope.
--   * Se comprueban solos al sellar, al apuntar una consumicion y al
--     registrar un encuentro (disparadores), y tambien al mirarlos
--     (`retos_mios`), por si el reto se creo despues. Cada reto puntua una vez
--     por persona: ref 'reto:<reto>:<persona>' en `point_movements`, con
--     `detail.reto`. Desactivar un reto no quita los puntos ya dados.

create table if not exists public.retos (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references public.routes (id) on delete cascade,
  nombre       text not null check (char_length(nombre) between 1 and 60),
  descripcion  text not null default '' check (char_length(descripcion) <= 200),
  tipo         text not null check (tipo in ('categorias', 'consumiciones_categoria', 'bares', 'encuentros_qr', 'ruta_antes_de')),
  objetivo     smallint not null default 1 check (objetivo between 1 and 20),
  categoria    text check (categoria in ('tercio', 'jarra', 'vino', 'sidra', 'chupito', 'sin_alcohol')),
  hora_limite  timestamptz,
  puntos       smallint not null check (puntos between 1 and 100),
  max_personas smallint check (max_personas between 1 and 500),
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint retos_condicion_check check (
    case tipo
      when 'categorias' then objetivo between 2 and 6
      when 'consumiciones_categoria' then categoria is not null
        and (categoria = 'sin_alcohol' or objetivo <= 3)
      when 'ruta_antes_de' then hora_limite is not null
      else true
    end
  )
);
create index if not exists retos_ruta_idx on public.retos (route_id);

alter table public.retos enable row level security;
revoke all on table public.retos from anon, authenticated;
grant select, insert, update, delete on table public.retos to authenticated;
drop policy if exists retos_select on public.retos;
create policy retos_select on public.retos
  for select to authenticated
  using (public.is_admin() or public.is_route_participant(route_id, auth.uid()));
drop policy if exists retos_write on public.retos;
create policy retos_write on public.retos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Cuanto lleva una persona en un reto.
create or replace function public.reto_progreso(p_reto public.retos, p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bares integer;
  v_mios  integer;
  v_ultimo timestamptz;
begin
  case p_reto.tipo
    when 'categorias' then
      return (select count(distinct c.categoria) from public.consumiciones c
               where c.user_id = p_user_id and c.route_id = p_reto.route_id);
    when 'consumiciones_categoria' then
      return (select count(*) from public.consumiciones c
               where c.user_id = p_user_id and c.route_id = p_reto.route_id and c.categoria = p_reto.categoria);
    when 'bares' then
      return (select count(distinct s.route_bar_id)
                from public.stamps s join public.route_bars b on b.id = s.route_bar_id
               where s.user_id = p_user_id and b.route_id = p_reto.route_id);
    when 'encuentros_qr' then
      return (select count(*) from public.encuentros e
               where e.route_id = p_reto.route_id and e.tipo = 'qr' and p_user_id = any (e.usuarios));
    when 'ruta_antes_de' then
      select count(*) into v_bares from public.route_bars b where b.route_id = p_reto.route_id;
      select count(distinct s.route_bar_id), max(s.stamped_at) into v_mios, v_ultimo
        from public.stamps s join public.route_bars b on b.id = s.route_bar_id
       where s.user_id = p_user_id and b.route_id = p_reto.route_id;
      return case when v_bares > 0 and v_mios >= v_bares and v_ultimo <= p_reto.hora_limite then 1 else 0 end;
    else
      return 0;
  end case;
end;
$$;

-- Lo que hay que llegar a tener.
create or replace function public.reto_meta(p_reto public.retos)
returns integer
language sql
immutable
set search_path = public
as $$
  select case when p_reto.tipo = 'ruta_antes_de' then 1 else p_reto.objetivo::integer end;
$$;

-- Da los retos activos que una persona ya cumple y aun no tenia.
create or replace function public.retos_evaluar(p_route_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_reto public.retos;
  v_casa text;
  v_ref  text;
begin
  if p_route_id is null or p_user_id is null then
    return;
  end if;
  for v_reto in
    select * from public.retos r where r.route_id = p_route_id and r.activo
  loop
    v_ref := 'reto:' || v_reto.id || ':' || p_user_id;
    continue when exists (select 1 from public.point_movements m where m.route_id = p_route_id and m.ref = v_ref);
    continue when public.reto_progreso(v_reto, p_user_id) < public.reto_meta(v_reto);
    -- Los primeros N: de uno en uno por reto, para no pasarse del limite.
    perform pg_advisory_xact_lock(hashtext('reto:' || v_reto.id));
    continue when v_reto.max_personas is not null and (
      select count(*) from public.point_movements m
       where m.route_id = p_route_id and m.action = 'reto' and m.annulled_at is null
         and m.detail ->> 'reto' = v_reto.id::text
    ) >= v_reto.max_personas;
    v_casa := public.asignar_casa(p_user_id, p_route_id);
    continue when v_casa is null;
    insert into public.point_movements (route_id, user_id, house, action, points, ref, detail)
    values (p_route_id, p_user_id, v_casa, 'reto', v_reto.puntos, v_ref,
            jsonb_build_object('reto', v_reto.id, 'nombre', v_reto.nombre))
    on conflict (route_id, ref) do nothing;
  end loop;
end;
$$;

-- Disparadores: lo que puede hacer avanzar un reto.
create or replace function public.retos_al_sellar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.retos_evaluar((select b.route_id from public.route_bars b where b.id = new.route_bar_id), new.user_id);
  return null;
end;
$$;

create or replace function public.retos_al_consumir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.retos_evaluar(new.route_id, new.user_id);
  return null;
end;
$$;

create or replace function public.retos_al_encontrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  foreach v_uid in array new.usuarios loop
    perform public.retos_evaluar(new.route_id, v_uid);
  end loop;
  return null;
end;
$$;

drop trigger if exists stamps_retos on public.stamps;
create trigger stamps_retos after insert on public.stamps
  for each row execute function public.retos_al_sellar();
drop trigger if exists consumiciones_retos on public.consumiciones;
create trigger consumiciones_retos after insert on public.consumiciones
  for each row execute function public.retos_al_consumir();
drop trigger if exists encuentros_retos on public.encuentros;
create trigger encuentros_retos after insert on public.encuentros
  for each row execute function public.retos_al_encontrarse();

-- Los retos de una ruta con tu progreso (los activos y los que ya tienes).
create or replace function public.retos_mios(p_route_id uuid)
returns table (
  id uuid,
  nombre text,
  descripcion text,
  tipo text,
  objetivo integer,
  categoria text,
  hora_limite timestamptz,
  puntos integer,
  max_personas integer,
  activo boolean,
  progreso integer,
  meta integer,
  conseguido boolean,
  conseguidos integer
)
language plpgsql
volatile
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
  -- Por si el reto se creo cuando ya lo cumplias.
  if public.is_route_participant(p_route_id, v_uid) then
    perform public.retos_evaluar(p_route_id, v_uid);
  end if;

  return query
  select r.id, r.nombre, r.descripcion, r.tipo, r.objetivo::integer, r.categoria, r.hora_limite,
         r.puntos::integer, r.max_personas::integer, r.activo,
         least(public.reto_progreso(r, v_uid), public.reto_meta(r)),
         public.reto_meta(r),
         exists (select 1 from public.point_movements m
                  where m.route_id = p_route_id and m.ref = 'reto:' || r.id || ':' || v_uid and m.annulled_at is null),
         (select count(*)::integer from public.point_movements m
           where m.route_id = p_route_id and m.action = 'reto' and m.annulled_at is null
             and m.detail ->> 'reto' = r.id::text)
    from public.retos r
   where r.route_id = p_route_id
     and (r.activo or exists (select 1 from public.point_movements m
                               where m.route_id = p_route_id and m.ref = 'reto:' || r.id || ':' || v_uid
                                 and m.annulled_at is null))
   order by r.created_at;
end;
$$;

revoke all on function public.reto_progreso(public.retos, uuid) from public, anon, authenticated;
revoke all on function public.reto_meta(public.retos) from public, anon, authenticated;
revoke all on function public.retos_evaluar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.retos_al_sellar() from public, anon, authenticated;
revoke all on function public.retos_al_consumir() from public, anon, authenticated;
revoke all on function public.retos_al_encontrarse() from public, anon, authenticated;
revoke all on function public.retos_mios(uuid) from public, anon;
grant execute on function public.retos_mios(uuid) to authenticated;

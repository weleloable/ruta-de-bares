-- Ruta de Bares - 0046: QR social (encuentros entre gente de la misma casa).
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0045.
-- Idempotente: se puede re-ejecutar sin romper nada (`if not exists`,
-- restricciones quitadas antes de ponerlas y funciones con `or replace`).
--
-- Que hace.
--
--   * Cada persona tiene en su perfil un QR TEMPORAL (`qr_mi_codigo`): un
--     codigo al azar que caduca al minuto y se renueva solo, asi que una
--     captura de pantalla no sirve para mas tarde.
--   * Si otra persona de la MISMA casa lo escanea durante una ruta en la que
--     estan los dos (`qr_escanear`), la casa gana los puntos de `qr`.
--       - no vale escanearse a uno mismo;
--       - la misma pareja solo cuenta una vez por ruta;
--       - cada persona tiene un tope de encuentros que puntuan por ruta
--         (`routes.qr_max`, 5 por defecto);
--       - solo durante la ruta: desde 1 h antes de abrir el primer bar hasta
--         2 h despues de cerrar el ultimo (quien administra, siempre: para
--         probar).
--   * `encuentros` guarda quien se encontro con quien. Es de un grupo
--     (`usuarios uuid[]`) y tiene `tipo`, para que las fotos de grupo de mas
--     adelante entren aqui sin cambiar nada (`foto_grupal`, aun sin uso).
--   * Los puntos son de la casa (user_id nulo) y guardan quienes fueron
--     (`detail.usuarios`), como la racha: si alguno cambia de casa se anulan.
--
-- Errores nuevos: QR_INVALID, QR_SELF, QR_OTHER_HOUSE, QR_NOT_IN_ROUTE,
-- QR_REPEATED, QR_OUT_OF_TIME.

alter table public.routes add column if not exists qr_max smallint not null default 5;
alter table public.routes drop constraint if exists routes_qr_max_check;
alter table public.routes add constraint routes_qr_max_check check (qr_max between 0 and 50);

-- Los codigos vivos. Nadie los lee desde la app: solo las funciones.
create table if not exists public.qr_codigos (
  codigo     text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists qr_codigos_usuario_idx on public.qr_codigos (user_id);
alter table public.qr_codigos enable row level security;
revoke all on table public.qr_codigos from anon, authenticated;

create table if not exists public.encuentros (
  id         uuid primary key default gen_random_uuid(),
  route_id   uuid not null references public.routes (id) on delete cascade,
  tipo       text not null default 'qr' check (tipo in ('qr', 'foto_grupal')),
  usuarios   uuid[] not null,
  house      text not null check (house in ('mahou', 'cruzcampo', 'estrella', 'alhambra')),
  puntua     boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists encuentros_ruta_idx on public.encuentros (route_id);
alter table public.encuentros enable row level security;
revoke all on table public.encuentros from anon, authenticated;
grant select on table public.encuentros to authenticated;
-- Cada uno ve los suyos.
drop policy if exists encuentros_select on public.encuentros;
create policy encuentros_select on public.encuentros
  for select to authenticated using (auth.uid() = any (usuarios));

-- Tu QR: el que tengas si le queda mas de 20 s, si no uno nuevo de 60 s.
-- Devuelve tambien tu ultimo encuentro de los 2 ultimos minutos, para que
-- quien ensena el QR vea la celebracion cuando se lo escanean.
create or replace function public.qr_mi_codigo()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_codigo text;
  v_caduca timestamptz;
  v_ultimo jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select q.codigo, q.expires_at into v_codigo, v_caduca
    from public.qr_codigos q
   where q.user_id = v_uid and q.expires_at > now() + interval '20 seconds'
   order by q.expires_at desc limit 1;
  if v_codigo is null then
    delete from public.qr_codigos q where q.user_id = v_uid and q.expires_at <= now();
    v_codigo := replace(gen_random_uuid()::text, '-', '');
    v_caduca := now() + interval '60 seconds';
    insert into public.qr_codigos (codigo, user_id, expires_at) values (v_codigo, v_uid, v_caduca);
  end if;

  select jsonb_build_object(
           'id', e.id,
           'at', e.created_at,
           'casa', e.house,
           'puntua', e.puntua,
           'puntos', case when e.puntua then (select r.points from public.point_rules r where r.action = 'qr') else 0 end,
           'con', (select p.display_name from public.profiles p
                    where p.id = any (e.usuarios) and p.id <> v_uid limit 1))
    into v_ultimo
    from public.encuentros e
   where v_uid = any (e.usuarios) and e.created_at > now() - interval '2 minutes'
   order by e.created_at desc limit 1;

  return jsonb_build_object('codigo', v_codigo, 'caduca', v_caduca, 'ultimo', v_ultimo);
end;
$$;

revoke all on function public.qr_mi_codigo() from public, anon;
grant execute on function public.qr_mi_codigo() to authenticated;

create or replace function public.qr_escanear(p_route_id uuid, p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_otro    uuid;
  v_ruta    public.routes%rowtype;
  v_desde   timestamptz;
  v_hasta   timestamptz;
  v_mia     text;
  v_suya    text;
  v_a       uuid;
  v_b       uuid;
  v_puntua  boolean;
  v_puntos  integer := 0;
  v_ref     text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_route_participant(p_route_id, v_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if public.esta_suspendida(v_uid) then
    raise exception 'SUSPENDED' using errcode = '42501';
  end if;

  select q.user_id into v_otro
    from public.qr_codigos q
   where q.codigo = trim(coalesce(p_codigo, '')) and q.expires_at > now();
  if v_otro is null then
    raise exception 'QR_INVALID' using errcode = 'P0001';
  end if;
  if v_otro = v_uid then
    raise exception 'QR_SELF' using errcode = 'P0001';
  end if;
  if not public.is_route_participant(p_route_id, v_otro) then
    raise exception 'QR_NOT_IN_ROUTE' using errcode = 'P0001';
  end if;

  if not public.is_admin() then
    select min(b.opens_at) - interval '1 hour', max(b.closes_at) + interval '2 hours'
      into v_desde, v_hasta
      from public.route_bars b where b.route_id = p_route_id;
    if v_desde is null or now() < v_desde or now() > v_hasta then
      raise exception 'QR_OUT_OF_TIME' using errcode = 'P0001';
    end if;
  end if;

  v_mia := public.asignar_casa(v_uid, p_route_id);
  v_suya := public.asignar_casa(v_otro, p_route_id);
  if v_mia is distinct from v_suya then
    raise exception 'QR_OTHER_HOUSE' using errcode = 'P0001';
  end if;

  -- La pareja, siempre en el mismo orden: una sola fila y una sola ref.
  v_a := least(v_uid, v_otro);
  v_b := greatest(v_uid, v_otro);
  perform pg_advisory_xact_lock(hashtext('qr:' || p_route_id || ':' || v_a || ':' || v_b));
  if exists (select 1 from public.encuentros e
              where e.route_id = p_route_id and e.tipo = 'qr' and e.usuarios @> array[v_a, v_b]) then
    raise exception 'QR_REPEATED' using errcode = 'P0001';
  end if;

  select * into v_ruta from public.routes r where r.id = p_route_id;
  v_puntua := (select count(*) from public.encuentros e
                where e.route_id = p_route_id and e.puntua and v_uid = any (e.usuarios)) < v_ruta.qr_max
          and (select count(*) from public.encuentros e
                where e.route_id = p_route_id and e.puntua and v_otro = any (e.usuarios)) < v_ruta.qr_max;

  insert into public.encuentros (route_id, tipo, usuarios, house, puntua)
  values (p_route_id, 'qr', array[v_a, v_b], v_mia, v_puntua);

  if v_puntua then
    v_ref := 'qr:' || v_a || ':' || v_b;
    if public.puntos_otorgar(p_route_id, null, v_mia, 'qr', v_ref) then
      update public.point_movements m
         set detail = jsonb_build_object('usuarios', to_jsonb(array[v_a, v_b]))
       where m.route_id = p_route_id and m.ref = v_ref;
      v_puntos := (select r.points from public.point_rules r where r.action = 'qr');
    end if;
  end if;

  return jsonb_build_object(
    'puntos', v_puntos,
    'casa', v_mia,
    'puntua', v_puntua,
    'con', (select p.display_name from public.profiles p where p.id = v_otro)
  );
end;
$$;

revoke all on function public.qr_escanear(uuid, text) from public, anon;
grant execute on function public.qr_escanear(uuid, text) to authenticated;

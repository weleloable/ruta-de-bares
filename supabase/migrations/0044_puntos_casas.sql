-- Ruta de Bares - 0044: puntos de las casas y ranking de la ruta en directo.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0043.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar. Aqui queda obsoleta:
--   * puntos_por_sello() la rehace la 0045
--   * export_my_data() la rehace la 0048
-- (Ademas, esta rehace export_my_data() a partir de la 0041, asi que la 0041
-- tampoco se puede volver a pegar despues.)
--
-- Que hace. Lo que consigue cada persona suma para su casa en la ruta. Los
-- puntos de una ruta no se mezclan con los de otra.
--
--   * `point_rules`: cuanto vale cada accion. Editable por admins (el panel
--     llega en otra fase); empieza con: sello 10, consumicion 2, categoria nueva
--     5, completar la ruta 20, podio 10/7/5, racha 6, encuentro QR 5.
--   * `point_movements`: el HISTORIAL. Cada punto es una fila: ruta, casa,
--     quien (si es de una persona), que accion, cuantos y una clave `ref` UNICA
--     por ruta ("sello:<id>", "ruta_completa:<persona>"...). Esa clave es lo que
--     impide que algo puntue dos veces, aunque se reintente o se pegue esto otra
--     vez. Se anula (con quien y por que), no se borra.
--   * Los PODIOS de los minijuegos no se guardan: se calculan en vivo del
--     ranking de la ruta (`casas_podios`). Si alguien bate un record, el podio
--     cambia solo y no hay nada que duplicar ni que quitar. Solo puntua el top 3.
--       - La Cana Perfecta y La Conga: su ranking de la ruta (0034, 0039).
--       - Maestro Cervecero: la mejor cerveza de cada persona (0034).
--       - ¿Conduces tu?: el nivel de cañas MAS ALTO que tenga partidas (0041).
--     Solo cuentan quienes siguen en la ruta.
--   * Ahora puntuan: cada sello (al sellar, por disparador) y completar la ruta
--     (al sellar el ultimo bar que faltaba). Lo demas llega en otras fases.
--     Los sellos que ya habia se puntuan al pegar esto.
--   * `casas_ranking(ruta)`: los puntos de las cuatro casas en la ruta. Lo ve
--     quien esta dentro de la ruta (y los admins).
--   * Tiempo real: `casas_marcador` tiene una fila por ruta que se toca cada vez
--     que algo puede cambiar el ranking. La app se suscribe a ella con Realtime
--     (se anade aqui a la publicacion `supabase_realtime`) y vuelve a pedir el
--     ranking. Asi el historial no tiene que ser legible por nadie.
--   * Si se borra un sello (se quita un bar de la ruta), su movimiento se anula.
--     Si alguien borra su cuenta, sus puntos se quedan en su casa, sin nombre.
--   * "Descargar mis datos" incluye tu casa y tus puntos.

-- ---------------------------------------------------------------------------
-- Reglas y movimientos
-- ---------------------------------------------------------------------------
create table if not exists public.point_rules (
  action     text primary key,
  points     integer not null check (points between -1000 and 1000),
  label      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.point_rules (action, points, label) values
  ('sello', 10, 'Conseguir un sello'),
  ('consumicion', 2, 'Consumición registrada'),
  ('categoria_nueva', 5, 'Nueva categoría de bebida'),
  ('ruta_completa', 20, 'Completar la ruta'),
  ('podio_1', 10, '1.º en un minijuego'),
  ('podio_2', 7, '2.º en un minijuego'),
  ('podio_3', 5, '3.º en un minijuego'),
  ('racha', 6, 'Racha de 3 de la misma casa'),
  ('qr', 5, 'Encuentro por QR')
on conflict (action) do nothing;

create table if not exists public.point_movements (
  id           bigint generated always as identity primary key,
  route_id     uuid not null references public.routes (id) on delete cascade,
  -- Null en lo que es de la casa entera (racha, QR) o si la cuenta se borro.
  user_id      uuid references public.profiles (id) on delete set null,
  house        text not null check (house in ('mahou', 'cruzcampo', 'estrella', 'alhambra')),
  action       text not null,
  points       integer not null,
  ref          text not null,
  created_at   timestamptz not null default now(),
  annulled_at  timestamptz,
  annulled_by  uuid references public.profiles (id) on delete set null,
  annul_reason text,
  unique (route_id, ref)
);

create index if not exists point_movements_ruta_idx on public.point_movements (route_id, house) where annulled_at is null;
create index if not exists point_movements_usuario_idx on public.point_movements (user_id);

alter table public.point_rules enable row level security;
alter table public.point_movements enable row level security;
revoke all on table public.point_rules from anon, authenticated;
revoke all on table public.point_movements from anon, authenticated;

-- Apunta unos puntos (interna). Sin regla, o con la accion ya puntuada (misma
-- `ref` en la ruta), no hace nada. Devuelve si ha apuntado algo.
create or replace function public.puntos_otorgar(
  p_route_id uuid, p_user_id uuid, p_house text, p_action text, p_ref text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_puntos integer;
  v_filas  integer;
begin
  select r.points into v_puntos from public.point_rules r where r.action = p_action;
  if v_puntos is null or p_house is null then
    return false;
  end if;
  insert into public.point_movements (route_id, user_id, house, action, points, ref)
  values (p_route_id, p_user_id, p_house, p_action, v_puntos, p_ref)
  on conflict (route_id, ref) do nothing;
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Marcador para el tiempo real
-- ---------------------------------------------------------------------------
create table if not exists public.casas_marcador (
  route_id   uuid primary key references public.routes (id) on delete cascade,
  cambiado_at timestamptz not null default now()
);
alter table public.casas_marcador enable row level security;
revoke all on table public.casas_marcador from anon, authenticated;
grant select on table public.casas_marcador to authenticated;
drop policy if exists casas_marcador_select on public.casas_marcador;
create policy casas_marcador_select on public.casas_marcador
  for select to authenticated
  using (public.is_route_participant(route_id, auth.uid()) or public.is_admin());

create or replace function public.casas_tocar_marcador(p_route_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.casas_marcador (route_id, cambiado_at)
  select p_route_id, clock_timestamp()
   where exists (select 1 from public.routes r where r.id = p_route_id)
  on conflict (route_id) do update set cambiado_at = excluded.cambiado_at;
$$;

-- Un disparador generico: toca el marcador de la ruta de la fila (nueva o vieja).
create or replace function public.casas_al_cambiar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.casas_tocar_marcador(new.route_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.casas_tocar_marcador(old.route_id);
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['point_movements', 'minigame_scores', 'maestro_beers', 'conduces_scores', 'route_members'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_marcador', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.casas_al_cambiar()',
      t || '_marcador', t
    );
  end loop;
  -- Realtime: en Supabase existe la publicacion; en una base sin ella (tests), nada.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'casas_marcador'
     ) then
    alter publication supabase_realtime add table public.casas_marcador;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Puntos por sellar y por completar la ruta
-- ---------------------------------------------------------------------------
create or replace function public.puntos_por_sello(p_stamp_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sello public.stamps%rowtype;
  v_ruta  uuid;
  v_casa  text;
  v_bares integer;
  v_mios  integer;
begin
  select * into v_sello from public.stamps s where s.id = p_stamp_id;
  if not found then
    return;
  end if;
  select b.route_id into v_ruta from public.route_bars b where b.id = v_sello.route_bar_id;
  v_casa := public.asignar_casa(v_sello.user_id, v_ruta);
  perform public.puntos_otorgar(v_ruta, v_sello.user_id, v_casa, 'sello', 'sello:' || v_sello.id);

  select count(*) into v_bares from public.route_bars b where b.route_id = v_ruta;
  select count(distinct s.route_bar_id) into v_mios
    from public.stamps s join public.route_bars b on b.id = s.route_bar_id
   where b.route_id = v_ruta and s.user_id = v_sello.user_id;
  if v_bares > 0 and v_mios >= v_bares then
    perform public.puntos_otorgar(v_ruta, v_sello.user_id, v_casa, 'ruta_completa', 'ruta_completa:' || v_sello.user_id);
  end if;
end;
$$;

create or replace function public.puntos_al_sellar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.puntos_por_sello(new.id);
  return new;
end;
$$;

drop trigger if exists stamps_puntos on public.stamps;
create trigger stamps_puntos
  after insert on public.stamps
  for each row execute function public.puntos_al_sellar();

-- Un sello que desaparece porque se quita su BAR de la ruta deja de puntuar.
-- Si desaparece porque la persona borra su cuenta, no: sus puntos se quedan en
-- la casa (el movimiento se queda sin nombre por el `on delete set null`).
create or replace function public.puntos_al_borrar_sello()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.route_bars b where b.id = old.route_bar_id) then
    return old;
  end if;
  update public.point_movements m
     set annulled_at = now(), annul_reason = 'El sello se borró (se quitó el bar de la ruta)'
   where m.ref = 'sello:' || old.id and m.annulled_at is null;
  return old;
end;
$$;

drop trigger if exists stamps_puntos_borrar on public.stamps;
create trigger stamps_puntos_borrar
  after delete on public.stamps
  for each row execute function public.puntos_al_borrar_sello();

-- Los sellos que ya habia, puntuados ahora (la `ref` unica evita duplicar).
do $$
declare
  s record;
begin
  for s in select id from public.stamps order by stamped_at loop
    perform public.puntos_por_sello(s.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Podios de los minijuegos (en vivo) y ranking de las casas
-- ---------------------------------------------------------------------------
create or replace function public.casas_podios(p_route_id uuid)
returns table (juego text, puesto integer, user_id uuid, house text, points integer)
language sql
stable
security definer
set search_path = public
as $$
  with marcas as (
    -- La Cana Perfecta y La Conga: su ranking de la ruta.
    select s.game as juego, s.user_id, s.best_score::numeric as valor, s.best_at as cuando
      from public.minigame_scores s
     where s.route_id = p_route_id
    union all
    -- Maestro Cervecero: la mejor cerveza de cada persona (la primera, si empata).
    select 'maestro-cervecero', x.user_id, x.score, x.created_at
      from (
        select b.user_id, b.score, b.created_at,
               row_number() over (partition by b.user_id order by b.score desc, b.created_at asc) as n
          from public.maestro_beers b where b.route_id = p_route_id
      ) x where x.n = 1
    union all
    -- ¿Conduces tu?: solo el nivel mas alto con partidas.
    select 'conduces-tu', c.user_id, c.best_distance, c.best_at
      from public.conduces_scores c
     where c.route_id = p_route_id
       and c.level = (select max(c2.level) from public.conduces_scores c2 where c2.route_id = p_route_id)
  ),
  ordenadas as (
    select m.juego, m.user_id,
           row_number() over (partition by m.juego order by m.valor desc, m.cuando asc) as puesto
      from marcas m
     where exists (select 1 from public.route_members rm where rm.route_id = p_route_id and rm.user_id = m.user_id)
  )
  select o.juego, o.puesto::integer, o.user_id, h.house, r.points
    from ordenadas o
    join public.user_houses h on h.user_id = o.user_id
    join public.point_rules r on r.action = 'podio_' || o.puesto
   where o.puesto <= 3;
$$;

create or replace function public.casas_ranking(p_route_id uuid)
returns table (house text, puntos integer, miembros integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not (public.is_route_participant(p_route_id, v_uid) or public.is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select c.casa,
         (coalesce((select sum(m.points) from public.point_movements m
                     where m.route_id = p_route_id and m.house = c.casa and m.annulled_at is null), 0)
          + coalesce((select sum(p.points) from public.casas_podios(p_route_id) p where p.house = c.casa), 0))::integer,
         (select count(*) from public.route_members rm join public.user_houses h on h.user_id = rm.user_id
           where rm.route_id = p_route_id and h.house = c.casa)::integer
    from (values ('mahou'), ('cruzcampo'), ('estrella'), ('alhambra')) as c (casa);
end;
$$;

revoke all on function public.puntos_otorgar(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.casas_tocar_marcador(uuid) from public, anon, authenticated;
revoke all on function public.casas_al_cambiar() from public, anon, authenticated;
revoke all on function public.puntos_por_sello(uuid) from public, anon, authenticated;
revoke all on function public.puntos_al_sellar() from public, anon, authenticated;
revoke all on function public.puntos_al_borrar_sello() from public, anon, authenticated;
revoke all on function public.casas_podios(uuid) from public, anon, authenticated;
revoke all on function public.casas_ranking(uuid) from public, anon;
grant execute on function public.casas_ranking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Descargar tus datos: tu casa y tus puntos
-- ---------------------------------------------------------------------------
-- Es la export_my_data() de la 0041 tal cual (copiada de su cuerpo, no de
-- memoria), con `casa` y `puntos` al final.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_hmac text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  v_hmac := public.hmac_correo(public.correo_de(v_uid));

  return jsonb_build_object(
    'generado_el', now(),

    -- `avatar_url` parece un enlace y no lo es: desde la 0023 el bucket es
    -- privado y esa direccion no descarga nada. Se dice aqui, dentro de la
    -- descarga, para que nadie piense que se le esta negando la imagen.
    'sobre_las_fotos',
      'avatar_url y avatar_thumb_url identifican tu foto; no son enlaces para descargarla. '
      || 'Si quieres una copia de la imagen, pidela desde Mi perfil > Escribir a la organizacion.',

    'cuenta', (
      select to_jsonb(x) from (
        select p.id, p.display_name, p.role, p.avatar_url, p.avatar_thumb_url,
               p.created_at, p.updated_at,
               public.correo_de(v_uid) as correo
          from public.profiles p where p.id = v_uid
      ) x
    ),

    -- Como entras y que guarda de ti cada via. Con Google: correo, nombre,
    -- foto e identificador de la cuenta de Google, tal cual los dio Google.
    'acceso', jsonb_build_object(
      'formas_de_entrar', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'via', i.provider,
                 'datos', i.identity_data,
                 'vinculada_el', i.created_at,
                 'ultimo_acceso', i.last_sign_in_at
               ) order by i.created_at)
          from auth.identities i where i.user_id = v_uid
      ), '[]'::jsonb),
      'metadatos_de_la_cuenta', (
        select u.raw_user_meta_data from auth.users u where u.id = v_uid
      )
    ),

    -- A que rutas perteneces. El nombre y la fecha del evento, no la ruta
    -- entera: los bares son de la organizacion, no datos personales tuyos.
    'rutas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', r.name, 'fecha_evento', r.event_date, 'desde', rm.joined_at
             ) order by rm.joined_at)
        from public.route_members rm join public.routes r on r.id = rm.route_id
       where rm.user_id = v_uid
    ), '[]'::jsonb),

    -- Con coordenadas y hora: es dato de localizacion tuyo, y que lo tengamos
    -- es justo lo que hay que poder ensenar.
    'sellos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'bar', b.name, 'ruta', r.name,
               'cuando', s.stamped_at,
               'lat', s.lat, 'lng', s.lng, 'distancia_m', s.distance_m
             ) order by s.stamped_at)
        from public.stamps s
        join public.route_bars b on b.id = s.route_bar_id
        join public.routes r on r.id = b.route_id
       where s.user_id = v_uid
    ), '[]'::jsonb),

    -- Las fotos que enviaste a revision y que se decidio con ellas.
    'fotos_enviadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'enviada_el', a.created_at, 'estado', a.status,
               'motivo_del_rechazo', a.reason, 'decidida_el', a.decided_at
             ) order by a.created_at)
        from public.avatar_requests a where a.user_id = v_uid
    ), '[]'::jsonb),

    -- Lo que se ha decidido sobre ti y por que (art. 17 DSA). Es lo que hace
    -- falta para reclamar, asi que tiene que poder llevarselo quien se va.
    'avisos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'que', n.action, 'motivo', n.reason, 'ruta', n.route_name,
               'fecha', n.created_at, 'leido_el', n.read_at
             ) order by n.created_at)
        from public.user_notices n where n.user_id = v_uid
    ), '[]'::jsonb),

    -- Las sanciones vigentes, con el HMAC incluido.
    'sanciones', jsonb_build_object(
      'suspension', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'motivo', s.reason, 'desde', s.created_at,
                 'levantada_el', s.lifted_at, 'hmac_de_tu_correo', s.email_hmac
               ) order by s.created_at)
          from public.account_suspensions s
         where s.user_id = v_uid or (v_hmac is not null and s.email_hmac = v_hmac)
      ), '[]'::jsonb),
      'vetos_de_ruta', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'ruta', r.name, 'motivo', b.reason, 'desde', b.created_at,
                 'hmac_de_tu_correo', b.email_hmac
               ) order by b.created_at)
          from public.route_bans b join public.routes r on r.id = b.route_id
         where b.user_id = v_uid or (v_hmac is not null and b.email_hmac = v_hmac)
      ), '[]'::jsonb),
      'veto_de_cana', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'motivo', c.reason, 'desde', c.created_at,
                 'hmac_de_tu_correo', c.email_hmac
               ) order by c.created_at)
          from public.cana_bans c
         where c.user_id = v_uid or (v_hmac is not null and c.email_hmac = v_hmac)
      ), '[]'::jsonb)
    ),

    -- Lo de los minijuegos (0034): tu mejor nota por juego y ruta, y las cervezas
    -- que has hecho, con el nombre que les pusiste. Es lo que otras personas de
    -- la ruta ven de ti en el ranking y en la lista de cervezas.
    'minijuegos', jsonb_build_object(
      'records', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'juego', s.game, 'ruta', r.name,
                 'mejor_nota', s.best_score, 'el', s.best_at
               ) order by s.best_at)
          from public.minigame_scores s join public.routes r on r.id = s.route_id
         where s.user_id = v_uid
      ), '[]'::jsonb),
      'cervezas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nombre', b.name, 'ruta', r.name, 'estilo', b.estilo,
                 'malta', b.malta, 'levadura', b.levadura,
                 'graduacion', b.abv, 'amargor_ibu', b.ibu, 'cuerpo', b.cuerpo,
                 'nota', b.score, 'maceracion', b.maceracion,
                 'amargor', b.amargor, 'aroma', b.aroma, 'siembra', b.siembra, 'el', b.created_at
               ) order by b.created_at)
          from public.maestro_beers b join public.routes r on r.id = b.route_id
         where b.user_id = v_uid
      ), '[]'::jsonb),
      -- "¿Conduces tu?" (0041): tu mejor distancia por ruta y nivel de cañas.
      'conduces', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'ruta', r.name, 'nivel_de_canas', c.level,
                 'mejor_distancia_m', c.best_distance, 'el', c.best_at
               ) order by c.best_at)
          from public.conduces_scores c join public.routes r on r.id = c.route_id
         where c.user_id = v_uid
      ), '[]'::jsonb)
    ),

    -- Y lo de la cana, tal cual lo devuelve la funcion de la 0010: se llama en
    -- vez de copiarse, para que no puedan separarse con el tiempo.
    'cana', public.match_export_my_data(),

    -- Tu casa (0043) y los puntos que has conseguido para ella (0044), con su origen.
    'casa', (
      select jsonb_build_object('casa', h.house, 'desde', h.assigned_at)
        from public.user_houses h where h.user_id = v_uid
    ),
    'puntos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', r.name, 'casa', m.house, 'accion', m.action, 'puntos', m.points,
               'el', m.created_at, 'anulado_el', m.annulled_at, 'motivo_anulacion', m.annul_reason
             ) order by m.created_at)
        from public.point_movements m join public.routes r on r.id = m.route_id
       where m.user_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

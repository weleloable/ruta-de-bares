-- Ruta de Bares - 0064: avisos en el movil (notificaciones push de la web).
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0063
-- y con las extensiones pg_cron y pg_net activadas (Database > Extensions).
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define funciones que una migracion POSTERIOR rehizo: volver a pegarla las
-- devuelve a esta version, en silencio y sin avisar. Aqui quedan obsoletas:
--   * avisos_encolar() la rehace la 0066 (conoce el tipo `admin`)
--   * push_preferencias_leer() la rehace la 0066 (devuelve `admin` a los admins)
-- Ojo al reves: rehace export_my_data() de la 0063, que ya no se vuelve a pegar.
--
-- Que hace.
--
--   1. SUSCRIPCIONES. Cuando alguien activa los avisos, el navegador da una
--      direccion (endpoint) y dos claves; `push_guardar` las apunta a su
--      nombre. Un dispositivo, una fila: si otra persona entra en el mismo
--      movil, pasa a ser suya. `push_preferencias` guarda que tipos quiere
--      (paradas, sorteo, La Cana), todo activado por defecto.
--   2. COLA. Cada aviso es una fila de `push_cola` con una `clave` unica, para
--      que nunca salga dos veces. Solo se encola para quien tiene algun
--      dispositivo y quiere ese tipo. Los envia la Edge Function
--      `enviar-avisos` (supabase/functions/enviar-avisos), que la base de
--      datos despierta con pg_net. Se borran a los 7 dias.
--   3. QUE AVISA.
--        * Parada: 10 min antes de que abra cada parada, a la gente de la ruta
--          (tarea de pg_cron cada minuto, `avisos_generar`).
--        * Ultimo bar: media hora antes de que cierre el ultimo bar de una ruta
--          con sorteo, a quien le falta UN bar y aun puede sellarlo.
--        * Sorteo: al hacerse (o repetirse), a toda la ruta; a quien gana y a
--          los suplentes, con su texto.
--        * La Cana: conexion nueva y mensajes (como mucho uno cada 5 min por
--          chat), sin ensenar lo que dice el mensaje.
--   4. Para despertar a la funcion hacen falta dos secretos en Vault
--      (`avisos_url` y `avisos_secreto`, ver docs/SETUP.md). Sin ellos se
--      encola igual y no se envia nada, sin romper nada.
--   5. "Descargar mis datos" anade tus preferencias, tus dispositivos y los
--      avisos de la ultima semana.

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------
create table if not exists public.push_suscripciones (
  endpoint  text primary key check (char_length(endpoint) between 10 and 1000),
  user_id   uuid not null references public.profiles (id) on delete cascade,
  p256dh    text not null check (char_length(p256dh) between 10 and 200),
  auth      text not null check (char_length(auth) between 8 and 100),
  creada_at timestamptz not null default now(),
  usada_at  timestamptz not null default now()
);
create index if not exists push_suscripciones_user_idx on public.push_suscripciones (user_id);

create table if not exists public.push_preferencias (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  paradas    boolean not null default true,
  sorteo     boolean not null default true,
  cana       boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_cola (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  tipo         text not null check (tipo in ('parada', 'ultimo_bar', 'sorteo', 'cana')),
  clave        text not null unique,
  titulo       text not null,
  cuerpo       text not null,
  url          text not null default '/',
  creada_at    timestamptz not null default now(),
  intentos     smallint not null default 0,
  reclamada_at timestamptz,
  enviada_at   timestamptz
);
create index if not exists push_cola_pendientes_idx on public.push_cola (id) where enviada_at is null;

alter table public.push_suscripciones enable row level security;
alter table public.push_preferencias enable row level security;
alter table public.push_cola enable row level security;
revoke all on table public.push_suscripciones, public.push_preferencias, public.push_cola from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lo que llama la app (cada uno, lo suyo)
-- ---------------------------------------------------------------------------
create or replace function public.push_guardar(p_endpoint text, p_p256dh text, p_auth text)
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
  if p_endpoint is null or p_endpoint !~ '^https://' then
    raise exception 'INVALID_ENDPOINT' using errcode = '22023';
  end if;
  insert into public.push_suscripciones (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, usada_at = now();
end;
$$;

create or replace function public.push_borrar(p_endpoint text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.push_suscripciones s where s.endpoint = p_endpoint and s.user_id = auth.uid();
$$;

create or replace function public.push_preferencias_leer()
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
  return jsonb_build_object(
    'paradas', coalesce((select p.paradas from public.push_preferencias p where p.user_id = v_uid), true),
    'sorteo', coalesce((select p.sorteo from public.push_preferencias p where p.user_id = v_uid), true),
    'cana', coalesce((select p.cana from public.push_preferencias p where p.user_id = v_uid), true),
    'dispositivos', (select count(*) from public.push_suscripciones s where s.user_id = v_uid)
  );
end;
$$;

create or replace function public.push_preferencias_guardar(p_paradas boolean, p_sorteo boolean, p_cana boolean)
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
  insert into public.push_preferencias (user_id, paradas, sorteo, cana)
  values (auth.uid(), coalesce(p_paradas, true), coalesce(p_sorteo, true), coalesce(p_cana, true))
  on conflict (user_id) do update
    set paradas = excluded.paradas, sorteo = excluded.sorteo, cana = excluded.cana, updated_at = now();
end;
$$;

revoke all on function public.push_guardar(text, text, text) from public, anon;
revoke all on function public.push_borrar(text) from public, anon;
revoke all on function public.push_preferencias_leer() from public, anon;
revoke all on function public.push_preferencias_guardar(boolean, boolean, boolean) from public, anon;
grant execute on function public.push_guardar(text, text, text) to authenticated;
grant execute on function public.push_borrar(text) to authenticated;
grant execute on function public.push_preferencias_leer() to authenticated;
grant execute on function public.push_preferencias_guardar(boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Encolar y despertar a la Edge Function (internas)
-- ---------------------------------------------------------------------------

-- Despierta a `enviar-avisos` una vez por transaccion. Si no hay pg_net o
-- faltan los secretos de Vault, no hace nada: lo encolado espera a la
-- siguiente vuelta, y nunca rompe lo que lo disparo (un sello, un mensaje).
create or replace function public.avisos_despertar()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secreto text;
begin
  if current_setting('avisos.despertado', true) = '1' then
    return;
  end if;
  perform set_config('avisos.despertado', '1', true);
  begin
    select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'avisos_url';
    select s.decrypted_secret into v_secreto from vault.decrypted_secrets s where s.name = 'avisos_secreto';
    if v_url is null or v_secreto is null then
      return;
    end if;
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-secreto', v_secreto),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'avisos_despertar: %', sqlerrm;
  end;
end;
$$;

-- Encola un aviso si esa persona tiene algun dispositivo y quiere ese tipo
-- (`ultimo_bar` cuenta como sorteo). La clave evita repetirlo.
create or replace function public.avisos_encolar(p_user uuid, p_tipo text, p_clave text, p_titulo text, p_cuerpo text, p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quiere boolean;
begin
  if not exists (select 1 from public.push_suscripciones s where s.user_id = p_user) then
    return;
  end if;
  select case p_tipo
           when 'parada' then p.paradas
           when 'ultimo_bar' then p.sorteo
           when 'sorteo' then p.sorteo
           when 'cana' then p.cana
         end
    into v_quiere
    from public.push_preferencias p where p.user_id = p_user;
  if v_quiere is false then
    return;
  end if;
  insert into public.push_cola (user_id, tipo, clave, titulo, cuerpo, url)
  values (p_user, p_tipo, p_clave, left(p_titulo, 120), left(p_cuerpo, 300), p_url)
  on conflict (clave) do nothing;
  if found then
    perform public.avisos_despertar();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Lo que se mira cada minuto: paradas que van a abrir y el ultimo bar
-- ---------------------------------------------------------------------------
create or replace function public.avisos_generar()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_antes integer;
  r record;
begin
  select count(*) into v_antes from public.push_cola;

  -- 10 min antes de que abra cada parada (o lo que quede, si se creo tarde).
  for r in
    select b.id, b.name, b.tipo, b.sort_order, b.opens_at, ru.name as ruta, rm.user_id,
           greatest(1, ceil(extract(epoch from b.opens_at - now()) / 60))::integer as minutos
      from public.route_bars b
      join public.routes ru on ru.id = b.route_id
      join public.route_members rm on rm.route_id = b.route_id
     where b.opens_at > now() and b.opens_at <= now() + interval '10 minutes'
     order by b.opens_at, rm.user_id
  loop
    perform public.avisos_encolar(
      r.user_id, 'parada', 'parada:' || r.id || ':' || r.user_id,
      case r.tipo
        when 'foto' then '📸 En ' || r.minutos || ' min: ' || r.name
        when 'otra' then '📍 En ' || r.minutos || ' min: ' || r.name
        else '🍺 En ' || r.minutos || ' min abre ' || r.name
      end,
      case r.tipo
        when 'foto' then 'Parada para la foto de ' || r.ruta || '.'
        when 'otra' then 'Siguiente parada de ' || r.ruta || '.'
        else 'Parada ' || (r.sort_order + 1) || ' de ' || r.ruta || '. ¡A por el sello!'
      end,
      '/');
  end loop;

  -- Media hora antes de que cierre el ultimo bar de una ruta con sorteo (aun
  -- sin hacer): a quien le falta UN bar y todavia puede sellarlo.
  for r in
    with rutas as (
      select ru.id, ru.name, coalesce(nullif(trim(ru.sorteo_premio), ''), 'un premio') as premio
        from public.routes ru
       where coalesce(ru.sorteo_activo, false)
         and not exists (select 1 from public.sorteos s where s.route_id = ru.id and s.vigente)
         and exists (select 1 from public.route_bars b where b.route_id = ru.id and b.tipo = 'bar')
         and now() between (select max(b.closes_at) from public.route_bars b where b.route_id = ru.id and b.tipo = 'bar') - interval '30 minutes'
                       and (select max(b.closes_at) from public.route_bars b where b.route_id = ru.id and b.tipo = 'bar')
    ),
    faltan as (
      select ru.id as route_id, ru.name as ruta, ru.premio, rm.user_id, b.name as bar, b.closes_at, b.margen_min
        from rutas ru
        join public.route_members rm on rm.route_id = ru.id
        join public.route_bars b on b.route_id = ru.id and b.tipo = 'bar'
       where not exists (select 1 from public.stamps s where s.user_id = rm.user_id and s.route_bar_id = b.id)
         and not exists (select 1 from public.sorteo_excluidos x where x.route_id = ru.id and x.user_id = rm.user_id)
    )
    select f.route_id, f.ruta, f.premio, f.user_id, min(f.bar) as bar
      from faltan f
     group by f.route_id, f.ruta, f.premio, f.user_id
    having count(*) = 1
       and min(f.closes_at + make_interval(mins => f.margen_min)) > now() + interval '5 minutes'
  loop
    perform public.avisos_encolar(
      r.user_id, 'ultimo_bar', 'ultimo_bar:' || r.route_id || ':' || r.user_id,
      '🎽 ¡Te falta 1 bar para el sorteo!',
      'Sella ' || r.bar || ' antes de que cierre y entras en el sorteo de ' || r.premio || '.',
      '/');
  end loop;

  -- Lo que quedo sin enviar (la funcion no contesto, sin red...): otra vuelta.
  if exists (select 1 from public.push_cola c where c.enviada_at is null and c.intentos < 3
                and c.creada_at > now() - interval '30 minutes') then
    perform public.avisos_despertar();
  end if;

  delete from public.push_cola c where c.creada_at < now() - interval '7 days';

  return (select count(*) from public.push_cola) - v_antes;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Sorteo y La Cana: avisan al momento (disparadores)
-- ---------------------------------------------------------------------------
create or replace function public.avisos_tras_sorteo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ganador text := coalesce((select p.display_name from public.profiles p where p.id = new.ganador), 'alguien');
  v_premio text := coalesce(nullif(trim(new.premio), ''), 'el premio');
  r record;
begin
  for r in select rm.user_id from public.route_members rm where rm.route_id = new.route_id loop
    perform public.avisos_encolar(
      r.user_id, 'sorteo', 'sorteo:' || new.id || ':' || r.user_id,
      case
        when r.user_id = new.ganador then '🎉 ¡Has ganado el sorteo!'
        when r.user_id = any (new.suplentes) then '🎽 Sorteo hecho: has quedado de suplente'
        else '🎽 Sorteo de ' || v_premio
      end,
      case
        when r.user_id = new.ganador then 'Te llevas ' || v_premio || '. Busca a la organización.'
        when r.user_id = any (new.suplentes) then 'Ha ganado ' || v_ganador || '. Si no aparece, te puede tocar a ti.'
        else 'Ha ganado ' || v_ganador || '.'
      end,
      '/');
  end loop;
  return null;
end;
$$;
drop trigger if exists avisos_tras_sorteo on public.sorteos;
create trigger avisos_tras_sorteo after insert on public.sorteos
  for each row execute function public.avisos_tras_sorteo();

-- Conexion nueva (o que se vuelve a abrir): a los dos, menos a quien la provoco.
create or replace function public.avisos_tras_conexion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid;
begin
  if not new.is_open or (tg_op = 'UPDATE' and old.is_open) then
    return null;
  end if;
  foreach v_quien in array array[new.user_a, new.user_b] loop
    if v_quien is distinct from auth.uid() then
      perform public.avisos_encolar(
        v_quien, 'cana', 'conexion:' || new.id || ':' || v_quien || ':' || floor(extract(epoch from new.opened_at))::bigint,
        '🍻 ¡Nueva conexión en La Caña!',
        coalesce((select p.display_name from public.profiles p
                   where p.id = case when v_quien = new.user_a then new.user_b else new.user_a end), 'Alguien')
          || ' y tú os habéis dado Me gusta.',
        '/cana');
    end if;
  end loop;
  return null;
end;
$$;
drop trigger if exists avisos_tras_conexion on public.match_connections;
create trigger avisos_tras_conexion after insert or update of is_open on public.match_connections
  for each row execute function public.avisos_tras_conexion();

-- Mensaje: a quien no lo escribio, como mucho uno cada 5 min por chat, y sin
-- ensenar lo que dice (sale en la pantalla bloqueada).
create or replace function public.avisos_tras_mensaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := coalesce((select p.display_name from public.profiles p where p.id = new.sender_id), 'Alguien');
  r record;
begin
  for r in select m.user_id from public.match_connection_members m
            where m.connection_id = new.connection_id and m.user_id <> new.sender_id loop
    perform public.avisos_encolar(
      r.user_id, 'cana',
      'mensaje:' || new.connection_id || ':' || r.user_id || ':' || floor(extract(epoch from new.created_at) / 300)::bigint,
      case new.kind
        when 'buzz' then '📳 ' || v_nombre || ' te ha dado un toque'
        when 'question' then '🍺 ' || v_nombre || ' tiene una pregunta para ti'
        when 'answer' then '💬 ' || v_nombre || ' te ha contestado'
        else '💬 ' || v_nombre || ' te ha escrito'
      end,
      'En La Caña.',
      '/cana');
  end loop;
  return null;
end;
$$;
drop trigger if exists avisos_tras_mensaje on public.match_messages;
create trigger avisos_tras_mensaje after insert on public.match_messages
  for each row execute function public.avisos_tras_mensaje();

-- ---------------------------------------------------------------------------
-- 6. Lo que llama la Edge Function (solo service_role)
-- ---------------------------------------------------------------------------

-- Coge hasta `p_limite` avisos pendientes (de la ultima media hora: uno de
-- "abre en 10 min" que sale una hora tarde sobra) con los dispositivos de su
-- persona. `skip locked`: dos llamadas a la vez no se llevan el mismo.
create or replace function public.push_cola_reclamar(p_limite integer default 200)
returns table (id bigint, tipo text, titulo text, cuerpo text, url text, dispositivos jsonb)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return query
  with cogidos as (
    update public.push_cola c
       set reclamada_at = now(), intentos = c.intentos + 1
     where c.id in (
       select c2.id from public.push_cola c2
        where c2.enviada_at is null and c2.intentos < 3
          and c2.creada_at > now() - interval '30 minutes'
          and (c2.reclamada_at is null or c2.reclamada_at < now() - interval '2 minutes')
        order by c2.id
        limit greatest(1, least(coalesce(p_limite, 200), 500))
        for update skip locked)
    returning c.id, c.user_id, c.tipo, c.titulo, c.cuerpo, c.url
  )
  select k.id, k.tipo, k.titulo, k.cuerpo, k.url,
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                     from public.push_suscripciones s where s.user_id = k.user_id), '[]'::jsonb)
    from cogidos k
   order by k.id;
end;
$$;

-- Lo que paso: los enviados se marcan y los dispositivos que ya no existen
-- (el navegador contesto 404/410) se borran.
create or replace function public.push_cola_resultado(p_enviados bigint[], p_caducados text[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.push_cola c set enviada_at = now() where c.id = any (coalesce(p_enviados, '{}'));
  delete from public.push_suscripciones s where s.endpoint = any (coalesce(p_caducados, '{}'));
end;
$$;

revoke all on function public.avisos_despertar() from public, anon, authenticated;
revoke all on function public.avisos_encolar(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.avisos_generar() from public, anon, authenticated;
revoke all on function public.avisos_tras_sorteo() from public, anon, authenticated;
revoke all on function public.avisos_tras_conexion() from public, anon, authenticated;
revoke all on function public.avisos_tras_mensaje() from public, anon, authenticated;
revoke all on function public.push_cola_reclamar(integer) from public, anon, authenticated;
revoke all on function public.push_cola_resultado(bigint[], text[]) from public, anon, authenticated;
grant execute on function public.push_cola_reclamar(integer) to service_role;
grant execute on function public.push_cola_resultado(bigint[], text[]) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Cada minuto (pg_cron). Sin la extension, se salta: lo demas funciona.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'avisos-cada-minuto';
    perform cron.schedule('avisos-cada-minuto', '* * * * *', 'select public.avisos_generar()');
  else
    raise notice 'pg_cron no esta activada: los avisos de las paradas no saldran hasta activarla y volver a pegar esta migracion.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Descargar mis datos (de la 0063): preferencias, dispositivos y avisos
-- ---------------------------------------------------------------------------
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
               p.created_at, p.updated_at, p.politica_vista,
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
                 'mejor_nota', s.best_score, 'tiempo_ms', s.best_ms, 'el', s.best_at
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
          or coalesce(m.detail -> 'usuarios', '[]'::jsonb) ? v_uid::text
    ), '[]'::jsonb),

    -- Las consumiciones que apuntaste (0045): categoria, bar y hora.
    'consumiciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', r.name, 'bar', b.name, 'categoria', c.categoria,
               'puntuo', c.puntua, 'el', c.created_at
             ) order by c.created_at)
        from public.consumiciones c
        join public.routes r on r.id = c.route_id
        join public.route_bars b on b.id = c.route_bar_id
       where c.user_id = v_uid
    ), '[]'::jsonb),

    -- Los encuentros por QR (0046): con quien (su nombre visible) y cuando.
    'encuentros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', r.name, 'tipo', e.tipo, 'puntuo', e.puntua, 'el', e.created_at,
               'con', (select jsonb_agg(p.display_name) from public.profiles p
                        where p.id = any (e.usuarios) and p.id <> v_uid)
             ) order by e.created_at)
        from public.encuentros e join public.routes r on r.id = e.route_id
       where v_uid = any (e.usuarios)
    ), '[]'::jsonb),

    -- Si se te cambio de casa (0048), de cual a cual y por que.
    'cambios_de_casa', coalesce((
      select jsonb_agg(jsonb_build_object(
               'de', c.de, 'a', c.a, 'motivo', c.motivo, 'el', c.changed_at
             ) order by c.changed_at)
        from public.house_changes c where c.user_id = v_uid
    ), '[]'::jsonb),

    -- Los sorteos en los que saliste (0061): de ganador o de suplente. Entrar
    -- no se guarda aparte: se deduce de tus sellos.
    'sorteos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', r.name, 'premio', s.premio,
               'saliste_como', case when s.ganador = v_uid then 'ganador' else 'suplente' end,
               'el', s.realizado_at, 'vigente', s.vigente
             ) order by s.realizado_at)
        from public.sorteos s join public.routes r on r.id = s.route_id
       where s.ganador = v_uid or v_uid = any (s.suplentes)
    ), '[]'::jsonb),

    -- Los sorteos de los que se te saco porque lo pediste (0063).
    'sorteos_sin_participar', coalesce((
      select jsonb_agg(jsonb_build_object('ruta', r.name, 'motivo', x.motivo, 'el', x.excluido_at)
             order by x.excluido_at)
        from public.sorteo_excluidos x join public.routes r on r.id = x.route_id
       where x.user_id = v_uid
    ), '[]'::jsonb),

    -- Los avisos en el movil (0064): que tipos quieres y en que dispositivos
    -- estan activados (solo el servicio y la fecha: la direccion entera es
    -- una clave tecnica del navegador), y los avisos de la ultima semana.
    'avisos_en_el_movil', jsonb_build_object(
      'preferencias', (
        select jsonb_build_object('paradas', p.paradas, 'sorteo', p.sorteo, 'cana', p.cana)
          from public.push_preferencias p where p.user_id = v_uid
      ),
      'dispositivos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'servicio', split_part(split_part(s.endpoint, '://', 2), '/', 1),
                 'desde', s.creada_at, 'ultimo_uso', s.usada_at
               ) order by s.creada_at)
          from public.push_suscripciones s where s.user_id = v_uid
      ), '[]'::jsonb),
      'enviados', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tipo', c.tipo, 'titulo', c.titulo, 'texto', c.cuerpo,
                 'creado_el', c.creada_at, 'enviado_el', c.enviada_at
               ) order by c.creada_at)
          from public.push_cola c where c.user_id = v_uid
      ), '[]'::jsonb)
    )
  );
end;
$$;

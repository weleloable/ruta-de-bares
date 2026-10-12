-- Ruta de Bares - 0063: aviso de politica nueva y sacar a alguien del sorteo.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0062.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar. Aqui queda obsoleta:
--   * export_my_data() la rehace la 0064
-- (Y a su vez rehace funciones de la 0061 y la 0062.)
--
-- Que hace.
--
--   1. AVISO DE POLITICA. La politica promete avisar en la app si cambia que
--      datos se recogen. `profiles.politica_vista` guarda la version que vio
--      cada persona; la app ensena el aviso una vez si es mas vieja que la
--      actual y lo marca con `politica_marcar_vista`.
--   2. SALIR DEL SORTEO. Quien no quiera participar se lo dice a la
--      organizacion, y un admin lo saca (`sorteo_excluir`, con motivo) o lo
--      vuelve a meter (`sorteo_incluir`). `sorteo_elegibles` ya no le cuenta,
--      `sorteo_estado` le dice que no participa y `sorteo_personas` da al admin
--      la lista de la ruta para elegir. Se borra con la ruta o con la cuenta.
--   3. "Descargar mis datos" anade la version de la politica que viste y los
--      sorteos de los que se te saco.

-- ---------------------------------------------------------------------------
-- 1. Aviso de politica
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists politica_vista text;

create or replace function public.politica_marcar_vista(p_version text)
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
  if p_version is null or char_length(p_version) > 20 then
    raise exception 'INVALID_VERSION' using errcode = '22023';
  end if;
  update public.profiles p set politica_vista = p_version where p.id = auth.uid();
end;
$$;
revoke all on function public.politica_marcar_vista(text) from public, anon;
grant execute on function public.politica_marcar_vista(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Salir del sorteo
-- ---------------------------------------------------------------------------
create table if not exists public.sorteo_excluidos (
  route_id     uuid not null references public.routes (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  motivo       text not null default 'Pidió no participar' check (char_length(motivo) between 1 and 200),
  excluido_por uuid references public.profiles (id) on delete set null,
  excluido_at  timestamptz not null default now(),
  primary key (route_id, user_id)
);
alter table public.sorteo_excluidos enable row level security;
revoke all on table public.sorteo_excluidos from anon, authenticated;

-- sorteo_elegibles (de la 0061): sin quien pidio no participar
create or replace function public.sorteo_elegibles(p_route_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with bares as (select b.id from public.route_bars b where b.route_id = p_route_id and b.tipo = 'bar')
  select rm.user_id
    from public.route_members rm
   where rm.route_id = p_route_id
     -- Quien pidio no participar (0063) no entra.
     and not exists (select 1 from public.sorteo_excluidos x where x.route_id = p_route_id and x.user_id = rm.user_id)
     and (select count(*) from bares) > 0
     and (select count(distinct s.route_bar_id) from public.stamps s
           where s.user_id = rm.user_id and s.route_bar_id in (select id from bares)) = (select count(*) from bares);
$$;

-- sorteo_estado (de la 0061): dice si se te saco del sorteo
create or replace function public.sorteo_estado(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_ruta public.routes%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not (public.is_route_participant(p_route_id, v_uid) or public.is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_ruta from public.routes r where r.id = p_route_id;
  return jsonb_build_object(
    'activo', coalesce(v_ruta.sorteo_activo, false),
    'premio', coalesce(v_ruta.sorteo_premio, ''),
    'bares', (select count(*) from public.route_bars b where b.route_id = p_route_id and b.tipo = 'bar'),
    'participantes', (select count(*) from public.sorteo_elegibles(p_route_id)),
    'dentro', exists (select 1 from public.sorteo_elegibles(p_route_id) u where u = v_uid),
    'excluido', exists (select 1 from public.sorteo_excluidos x where x.route_id = p_route_id and x.user_id = v_uid),
    'resultado', (
      select jsonb_build_object(
               'premio', s.premio,
               'ganador', (select p.display_name from public.profiles p where p.id = s.ganador),
               'soy_ganador', s.ganador = v_uid,
               'suplentes', coalesce((select jsonb_agg(p.display_name order by array_position(s.suplentes, p.id))
                                        from public.profiles p where p.id = any (s.suplentes)), '[]'::jsonb),
               'participantes', s.participantes,
               'realizado_at', s.realizado_at)
        from public.sorteos s where s.route_id = p_route_id and s.vigente
    )
  );
end;
$$;

-- La gente de la ruta, para que quien administra elija a quien sacar o meter.
create or replace function public.sorteo_personas(p_route_id uuid)
returns table (user_id uuid, nombre text, bares_sellados integer, completa boolean, excluido boolean, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bares integer;
begin
  perform public.casas_admin_requerir();
  select count(*)::integer into v_bares from public.route_bars b where b.route_id = p_route_id and b.tipo = 'bar';
  return query
  select rm.user_id, p.display_name,
         (select count(distinct s.route_bar_id)::integer from public.stamps s
            join public.route_bars b on b.id = s.route_bar_id
           where s.user_id = rm.user_id and b.route_id = p_route_id and b.tipo = 'bar'),
         v_bares > 0 and (select count(distinct s.route_bar_id) from public.stamps s
            join public.route_bars b on b.id = s.route_bar_id
           where s.user_id = rm.user_id and b.route_id = p_route_id and b.tipo = 'bar') >= v_bares,
         x.user_id is not null,
         x.motivo
    from public.route_members rm
    join public.profiles p on p.id = rm.user_id
    left join public.sorteo_excluidos x on x.route_id = p_route_id and x.user_id = rm.user_id
   where rm.route_id = p_route_id
   order by (x.user_id is not null) desc, p.display_name;
end;
$$;

create or replace function public.sorteo_excluir(p_route_id uuid, p_user_id uuid, p_motivo text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  if not exists (select 1 from public.route_members rm where rm.route_id = p_route_id and rm.user_id = p_user_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.sorteo_excluidos (route_id, user_id, motivo, excluido_por)
  values (p_route_id, p_user_id, coalesce(nullif(trim(coalesce(p_motivo, '')), ''), 'Pidió no participar'), auth.uid())
  on conflict (route_id, user_id) do update set motivo = excluded.motivo, excluido_por = excluded.excluido_por, excluido_at = now();
end;
$$;

create or replace function public.sorteo_incluir(p_route_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  delete from public.sorteo_excluidos x where x.route_id = p_route_id and x.user_id = p_user_id;
end;
$$;

revoke all on function public.sorteo_personas(uuid) from public, anon;
revoke all on function public.sorteo_excluir(uuid, uuid, text) from public, anon;
revoke all on function public.sorteo_incluir(uuid, uuid) from public, anon;
grant execute on function public.sorteo_personas(uuid) to authenticated;
grant execute on function public.sorteo_excluir(uuid, uuid, text) to authenticated;
grant execute on function public.sorteo_incluir(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Descargar mis datos (de la 0062): version de la politica vista y sorteos sin participar
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
    ), '[]'::jsonb)
  );
end;
$$;

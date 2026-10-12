-- Ruta de Bares - 0062: "descargar mis datos" con lo ultimo (sorteos y tiempo del quiz).
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0061.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar. Aqui queda obsoleta:
--   * export_my_data() la rehace la 0063 (y despues la 0064)
-- Ojo al reves: rehace export_my_data() de la 0048, que ya no se puede volver a
-- pegar despues.
--
-- Que hace. La politica promete que en "Ver lo que guardamos" sale TODO lo
-- tuyo. Con la 0061 se guardaban dos cosas nuevas que la descarga no traia:
--
--   * los sorteos en los que has salido, de ganador o de suplente (`sorteos`);
--   * en los minijuegos, el tiempo con el que se desempata el quiz
--     (`minigame_scores.best_ms`), junto a tu mejor nota.
--
-- Es la export_my_data() de la 0048 tal cual (copiada de su cuerpo, no de
-- memoria), con esas dos cosas.

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
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

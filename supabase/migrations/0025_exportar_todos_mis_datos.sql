-- Ruta de Bares - 0025: llevarte TODOS tus datos, no solo los de la cana.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0024.
-- NO SE PUEDE RE-EJECUTAR una vez aplicada la 0030: export_my_data() la rehace la 0030
-- (le anade los datos de los minijuegos); pegar esta despues la dejaria sin ellos.
--
-- Por que existe. `match_export_my_data` (0010) devuelve siete bloques y los
-- siete son de la cana. El derecho de acceso del art. 15 del RGPD cubre TODOS
-- los datos personales, no los de una pestana. Faltaban:
--
--   * los AVISOS de moderacion y sus motivos (`user_notices`): las decisiones
--     tomadas contra ti son datos tuyos de libro, y ademas son justo lo que
--     necesitas para reclamar;
--   * tu SUSPENSION y tus VETOS (`account_suspensions`, `route_bans`,
--     `cana_bans`), **incluido el HMAC de tu correo**: no se puede decir en la
--     politica que se guarda y luego esconderlo cuando alguien pide sus datos;
--   * y nada de fuera de la cana: tu perfil, tus SELLOS con sus coordenadas y
--     su hora, y a que rutas perteneces.
--
-- Pesa mas desde la 0021: se puede BORRAR la cuenta entera pero solo se podia
-- DESCARGAR el trozo de la cana. El art. 20 del DSA da seis meses para
-- reclamar, asi que quien se va tiene que poder llevarse su expediente ANTES de
-- irse; si no, pierde el acceso a lo unico con lo que podria reclamar.
--
-- Decisiones que conviene conocer:
--
--   * `match_export_my_data` NO se toca y se sigue usando: la nueva la llama y
--     mete su resultado dentro, en la clave `cana`. Asi no hay dos copias de la
--     misma consulta que puedan separarse.
--   * Las coordenadas de los sellos SI salen. Son tuyas, y que las tengamos es
--     precisamente lo que hay que poder ensenar.
--   * Lo que NO sale, y es deliberado: las denuncias que otras personas
--     pusieron SOBRE ti mientras siguen abiertas. Entregar el texto y el nombre
--     de quien denuncia, antes de que se resuelva, es entregar datos de un
--     tercero y una invitacion a las represalias (art. 15.4: el derecho de
--     acceso no puede afectar a los derechos de otros). SI sale lo que se
--     decidio sobre ti, que es lo que te afecta y lo que puedes reclamar: eso
--     esta en `avisos`.

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

    'cuenta', (
      select to_jsonb(x) from (
        select p.id, p.display_name, p.role, p.avatar_url, p.avatar_thumb_url,
               p.created_at, p.updated_at,
               public.correo_de(v_uid) as correo
          from public.profiles p where p.id = v_uid
      ) x
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

    -- Y lo de la cana, tal cual lo devuelve la funcion de la 0010: se llama en
    -- vez de copiarse, para que no puedan separarse con el tiempo.
    'cana', public.match_export_my_data()
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

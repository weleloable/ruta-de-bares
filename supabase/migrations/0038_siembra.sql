-- Ruta de Bares - 0038: Maestro Cervecero, paso 4 "enfriar y sembrar".
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0037.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar. Aqui queda obsoleta:
--   * export_my_data() la rehace la 0041
-- (Ademas, esta rehace export_my_data() a partir de la 0034, asi que la 0034
-- tampoco se puede volver a pegar despues.)
--
-- Que hace. El paso de la levadura deja de ser "elige una": ahora hay que
-- enfriar el mosto y echar la levadura a su temperatura (siembra.ts). Lo bien
-- que se hizo, de 0 a 100, entra en la nota de la cerveza:
--
--   antes: 40 maceracion + 30 amargor + 30 aroma
--   ahora: 30 maceracion + 25 amargor + 25 aroma + 20 siembra
--
-- Decisiones que conviene conocer:
--
--   * **Funciones NUEVAS con `_v2`, sin tocar las de la 0034.** Quien tenga la
--     app vieja en cache sigue llamando a `maestro_submit_beer` con 7
--     argumentos y le sigue funcionando, con la nota de antes. No se
--     sobrecarga el mismo nombre con un argumento mas por defecto porque
--     Postgres no sabria cual de las dos llamar ("function is not unique").
--   * `maestro_calcular_cerveza_v2` reutiliza la de la 0034 para estilo,
--     graduacion, amargor y cuerpo (no cambian) y solo rehace la nota. Es un
--     espejo de `calcularPuntuacion` (estilo.ts); un test compara las dos.
--   * `maestro_beers.siembra` admite NULL: las cervezas de antes no la tienen y
--     no se inventa. Sale en "descargar mis datos" (export_my_data).
--   * ORDEN DE DESPLIEGUE: esta migracion va ANTES que la app. La app nueva
--     llama a `maestro_submit_beer_v2`; si no existe, la cerveza se juega igual
--     pero al guardarla en la ruta avisa de que falta una migracion.

alter table public.maestro_beers add column if not exists siembra smallint
  check (siembra between 0 and 100);

-- Espejo de calcularPuntuacion (src/features/minijuegos/juegos/maestro/estilo.ts):
-- aritmetica ENTERA sobre porcentajes, como la 0034.
create or replace function public.maestro_calcular_cerveza_v2(
  p_malta text, p_levadura text, p_maceracion integer, p_amargor integer, p_aroma integer, p_siembra integer
)
returns table (estilo text, abv numeric, ibu integer, cuerpo text, score integer)
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_siembra is null or p_siembra not between 0 and 100 then
    raise exception 'INVALID_RECIPE' using errcode = '22023';
  end if;
  -- La de la 0034 valida el resto y calcula estilo, graduacion, amargor y cuerpo.
  return query
  select c.estilo, c.abv, c.ibu, c.cuerpo,
         round((30 * p_maceracion + 25 * p_amargor + 25 * p_aroma + 20 * p_siembra) / 100.0)::integer
    from public.maestro_calcular_cerveza(p_malta, p_levadura, p_maceracion, p_amargor, p_aroma) c;
end;
$$;
revoke all on function public.maestro_calcular_cerveza_v2(text, text, integer, integer, integer, integer)
  from public, anon, authenticated;

-- La de la 0034 con la siembra: mismas comprobaciones (quien, nombre, ritmo y tope).
create or replace function public.maestro_submit_beer_v2(
  p_route_id uuid, p_name text, p_malta text, p_levadura text,
  p_maceracion integer, p_amargor integer, p_aroma integer, p_siembra integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public.minijuegos_require(p_route_id, true);
  v_nombre text := btrim(coalesce(p_name, ''));
  v_calc   record;
  v_ultima timestamptz;
  v_total  integer;
  v_fila   public.maestro_beers%rowtype;
begin
  if char_length(v_nombre) not between 1 and 30 or v_nombre ~ '[[:cntrl:]]' then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  select * into v_calc
    from public.maestro_calcular_cerveza_v2(p_malta, p_levadura, p_maceracion, p_amargor, p_aroma, p_siembra);

  select max(b.created_at), count(*) into v_ultima, v_total
    from public.maestro_beers b where b.route_id = p_route_id and b.user_id = v_uid;
  -- Un juego entero lleva mas de 25 s: menos que eso es un script, no una persona.
  if v_ultima is not null and clock_timestamp() - v_ultima < interval '25 seconds' then
    raise exception 'TOO_FAST' using errcode = '54000';
  end if;
  if v_total >= 100 then
    raise exception 'LIMIT_REACHED' using errcode = '54000';
  end if;

  insert into public.maestro_beers
    (route_id, user_id, name, malta, levadura, maceracion, amargor, aroma, siembra,
     estilo, abv, ibu, cuerpo, score, created_at)
  values
    (p_route_id, v_uid, v_nombre, p_malta, p_levadura, p_maceracion, p_amargor, p_aroma, p_siembra,
     v_calc.estilo, v_calc.abv, v_calc.ibu, v_calc.cuerpo, v_calc.score, clock_timestamp())
  returning * into v_fila;

  return jsonb_build_object(
    'id', v_fila.id, 'name', v_fila.name, 'estilo', v_fila.estilo, 'abv', v_fila.abv,
    'ibu', v_fila.ibu, 'cuerpo', v_fila.cuerpo, 'score', v_fila.score
  );
end;
$$;
revoke all on function public.maestro_submit_beer_v2(uuid, text, text, text, integer, integer, integer, integer)
  from public, anon;
grant execute on function public.maestro_submit_beer_v2(uuid, text, text, text, integer, integer, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Descargar tus datos: la siembra de cada cerveza
-- ---------------------------------------------------------------------------
-- Es la export_my_data() de la 0034 tal cual (copiada de su cuerpo, no de
-- memoria), con `siembra` en la lista de cada cerveza.
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

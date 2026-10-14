-- ===========================================================================
-- Ruta de Bares - VOLVER ATRAS un reseteo de datos de prueba
-- ===========================================================================
-- Pegar ENTERO en Supabase > SQL Editor > New query > Run.
--
-- Devuelve a `public` lo que `reseteo.sql` borro, desde la copia que dejo en el
-- esquema reseteo_AAAAMMDD_HHMMSS (incluidos los vetos de La Cana). Solo sirve
-- mientras esa copia exista (si ya la borraste con `drop schema`, no hay vuelta
-- atras).
--
-- Antes de nada: pon abajo el nombre EXACTO de la copia (sale en el informe del
-- reseteo, en la columna "nota", y en Database > Schemas), cambia 'NO' por 'SI' y
-- pon la fecha de hoy. Con 'NO' es un simulacro: solo cuenta lo que devolveria.
--
-- Solo restaura si las tablas estan VACIAS (como las dejo el reseteo): si ya hay
-- datos nuevos, se para sin tocar nada, porque mezclar lo viejo con lo nuevo
-- duplicaria puntos y sellos. Es todo o nada, como el reseteo. Las dos tablas de
-- las que el reseteo solo borra una parte (fotos pendientes y avisos sin enviar)
-- se restauran sin pisar lo que ya haya.
--
-- Se desactivan los disparadores de usuario de esas tablas mientras se restaura
-- (y se vuelven a activar al final): si no, devolver un sello volveria a dar sus
-- puntos y quedarian duplicados al devolver tambien los puntos. Y mientras corre,
-- esas tablas estan bloqueadas para escribir (unos segundos).
-- ===========================================================================

do $restaurar$
declare
  v_esquema constant text := 'reseteo_AAAAMMDD_HHMMSS';  -- <<< PON EL NOMBRE DE LA COPIA
  v_confirmar constant text := 'NO';                      -- <<< 'SI' PARA RESTAURAR DE VERDAD
  v_fecha constant text := 'AAAA-MM-DD';                  -- <<< Y LA FECHA DE HOY (UTC), por ejemplo '2026-10-13'

  -- El orden importa por las claves ajenas: primero lo que otras tablas necesitan.
  v_tablas constant text[] := array[
    'match_connections', 'match_connection_members', 'match_messages', 'match_votes', 'match_blocks',
    'match_reports', 'match_report_messages', 'match_moderation_log',
    'account_suspensions', 'cana_bans', 'route_bans', 'match_fotos_liberadas', 'avatar_requests',
    'user_messages', 'user_notices',
    'stamps', 'point_movements', 'consumiciones', 'encuentros', 'casas_resultados', 'casas_resultado_vistos',
    'house_changes', 'sorteos', 'sorteo_excluidos', 'minigame_scores', 'conduces_scores', 'maestro_beers',
    'push_cola'
  ];
  -- De estas el reseteo solo borro una parte: pueden tener filas hoy sin que sea un problema.
  v_parciales constant text[] := array['avatar_requests', 'push_cola'];
  t text;
  v_n bigint;
  v_copia bigint;
  v_cols text;
  v_total bigint := 0;
  v_vetos bigint := 0;
begin
  if v_confirmar not in ('SI', 'NO') then
    raise exception 'v_confirmar tiene que ser ''SI'' o ''NO''.';
  end if;
  if not exists (select 1 from pg_namespace where nspname = v_esquema) then
    raise exception 'No existe el esquema %. Pon el nombre exacto de la copia (o ya la borraste: entonces no hay vuelta atras).', v_esquema;
  end if;
  if v_confirmar = 'SI' and v_fecha <> to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') then
    raise exception 'Para restaurar, pon en v_fecha la fecha de hoy (UTC): ''%''. No se ha tocado nada.', to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD');
  end if;

  create temp table if not exists restaurar_informe (tabla text primary key, en_la_copia bigint, hoy_en_public bigint, restauradas bigint);
  truncate restaurar_informe;

  if v_confirmar = 'SI' then
    foreach t in array v_tablas loop
      if to_regclass(format('%I.%I', v_esquema, t)) is not null then
        execute format('lock table public.%I in share row exclusive mode', t);
      end if;
    end loop;
    lock table public.match_profiles in share row exclusive mode;
  end if;

  -- Comprobaciones antes de tocar nada.
  foreach t in array v_tablas loop
    if to_regclass(format('%I.%I', v_esquema, t)) is null then
      continue; -- la tabla no estaba en esa copia (otra version): se salta
    end if;
    execute format('select count(*) from %I.%I', v_esquema, t) into v_copia;
    execute format('select count(*) from public.%I', t) into v_n;
    insert into restaurar_informe (tabla, en_la_copia, hoy_en_public) values (t, v_copia, v_n);
    v_total := v_total + v_copia;
    if v_n > 0 and v_copia > 0 and not (t = any (v_parciales)) then
      raise exception 'public.% ya tiene % filas: restaurar encima las mezclaria con las nuevas. No se ha tocado nada.', t, v_n;
    end if;
  end loop;
  if to_regclass(format('%I.match_profiles_vetos', v_esquema)) is not null then
    execute format('select count(*) from %I.match_profiles_vetos', v_esquema) into v_vetos;
    if exists (select 1 from public.match_profiles where blocked_at is not null) and v_vetos > 0 then
      raise exception 'Ya hay vetos de La Cana puestos: restaurar encima los mezclaria. No se ha tocado nada.';
    end if;
    v_total := v_total + v_vetos;
  end if;

  if v_confirmar = 'NO' then
    update restaurar_informe set restauradas = 0;
    raise notice 'SIMULACRO: se devolverian % filas (y % vetos de La Cana). Para restaurar de verdad, cambia NO por SI y pon la fecha.', v_total, v_vetos;
    return;
  end if;

  foreach t in array v_tablas loop
    if to_regclass(format('%I.%I', v_esquema, t)) is not null then
      execute format('alter table public.%I disable trigger user', t);
    end if;
  end loop;

  foreach t in array v_tablas loop
    if to_regclass(format('%I.%I', v_esquema, t)) is null then
      continue;
    end if;
    -- Todas las columnas menos las generadas (esas se calculan solas).
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into v_cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = t and c.is_generated = 'NEVER';
    execute format('insert into public.%I (%s) overriding system value select %s from %I.%I %s',
                   t, v_cols, v_cols, v_esquema, t, case when t = any (v_parciales) then 'on conflict do nothing' else '' end);
    execute format('select count(*) from public.%I', t) into v_n;
    update restaurar_informe set restauradas = v_n - hoy_en_public where tabla = t;
  end loop;

  foreach t in array v_tablas loop
    if to_regclass(format('%I.%I', v_esquema, t)) is not null then
      execute format('alter table public.%I enable trigger user', t);
    end if;
  end loop;

  -- Los vetos de La Cana vuelven a ponerse (solo esas tres columnas).
  if to_regclass(format('%I.match_profiles_vetos', v_esquema)) is not null then
    execute format(
      'update public.match_profiles m set blocked_at = v.blocked_at, blocked_by = v.blocked_by, blocked_reason = v.blocked_reason
         from %I.match_profiles_vetos v where m.user_id = v.user_id', v_esquema);
    get diagnostics v_n = row_count;
    if v_n <> v_vetos then
      raise exception 'Se esperaba devolver % vetos de La Cana y se han devuelto %. Se deshace todo.', v_vetos, v_n;
    end if;
  end if;
  update public.casas_marcador set cambiado_at = now() where true;

  for t in select tabla from restaurar_informe where restauradas is distinct from en_la_copia and not (tabla = any (v_parciales)) loop
    raise exception 'public.% no ha quedado completa. Se deshace todo.', t;
  end loop;
  raise notice 'HECHO: % filas devueltas desde %.', v_total, v_esquema;
end
$restaurar$;

select tabla, en_la_copia, hoy_en_public, restauradas from restaurar_informe order by tabla;

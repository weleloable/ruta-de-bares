-- ===========================================================================
-- Ruta de Bares - RESETEO DE LOS DATOS DE PRUEBA
-- ===========================================================================
-- Pegar ENTERO en Supabase > SQL Editor > New query > Run.  (No es una migracion:
-- no va en supabase/migrations y se ejecuta cuando se decide, no al desplegar.)
--
-- Lo que BORRA (todo, de todas las personas y rutas):
--   PUNTOS Y SELLOS  puntos de las casas, consumiciones, encuentros por QR,
--                    resultados de rutas cerradas, cambios de casa, sellos de la
--                    compostelana, sorteos hechos y excluidos, notas de los
--                    minijuegos y cervezas de Maestro Cervecero.
--   MENSAJES         lo escrito a la organizacion (contacto y reclamaciones, con
--                    sus respuestas), los avisos de moderacion, y en La Cana los
--                    chats, las conexiones, los "me gusta" y los bloqueos.
--   MODERACION       denuncias (y sus mensajes), registro de moderacion,
--                    suspensiones de cuenta, vetos de ruta y de La Cana (TODOS se
--                    LEVANTAN, tambien el que vive en match_profiles.blocked_*),
--                    fotos de perfil PENDIENTES de aprobar y fotos liberadas.
--   AVISOS AL MOVIL  los que estan en cola sin enviar (para que no salga uno de
--                    una denuncia que ya no existe).
--
-- Lo que NO toca (se comprueba al final, tabla por tabla, y si cambia una sola
-- fila se DESHACE TODO): cuentas, perfiles y fotos puestas, rutas, paradas,
-- catalogo de bares, miembros, invitaciones, la CASA de cada persona, reglas de
-- puntos, retos, temporadas, activacion y etiquetas de La Cana, codigos QR,
-- suscripciones y preferencias de avisos, las fotos ya aprobadas o rechazadas
-- (solo se borran las pendientes), y la clave secreta de los vetos.
-- Los ficheros de fotos de Storage tampoco (el SQL no puede borrarlos).
-- Quien fue expulsado de una ruta o suspendido SIGUE FUERA de ella (se le quito
-- de la ruta en su dia y eso no se revierte); sin veto, vuelve con la invitacion.
--
-- COMO SE USA, en tres pasos:
--   1. Pegalo tal cual y ejecuta: es un SIMULACRO. No borra nada; enseña cuantas
--      filas hay en cada tabla y cuantas se borrarian.
--   2. Si es lo que quieres, cambia 'NO' por 'SI' y pon la fecha de hoy, en las
--      DOS lineas marcadas con <<<, y ejecuta otra vez. La fecha esta para que un
--      script guardado en el editor no pueda borrar nada otro dia por accidente.
--      Antes de borrar guarda una COPIA de todo lo que borra en un esquema nuevo
--      (reseteo_AAAAMMDD_HHMMSS) y comprueba que esta completa.
--   3. La copia contiene datos personales (sellos con GPS, mensajes...) y NO se
--      va sola: cuando estes seguro de que todo esta bien (como mucho, a los 30
--      dias) borrala. El nombre sale en el informe:
--          drop schema reseteo_AAAAMMDD_HHMMSS cascade;
--      Para VOLVER ATRAS mientras la copia exista: scripts/reseteo-pruebas/restaurar.sql
--
-- Es todo o nada: va en un solo bloque, asi que si algo falla (un error, una
-- tabla que cambia sin que toque, una fila que entra mientras se borra) no se
-- borra NADA, ni siquiera la copia. Mientras corre, las tablas afectadas estan
-- bloqueadas para escribir (unos segundos): quien intente sellar o escribir en
-- ese momento espera, y su accion se hace justo despues. Se desactivan los
-- disparadores de usuario de esas tablas mientras se borra (si no, cada fila
-- borrada avisaria al tiempo real y con muchas filas el borrado se haria eterno).
-- ===========================================================================

do $reseteo$
declare
  v_confirmar constant text := 'NO';                    -- <<< CAMBIA 'NO' POR 'SI' PARA BORRAR DE VERDAD
  v_fecha constant text := 'AAAA-MM-DD';                -- <<< Y PON AQUI LA FECHA DE HOY, por ejemplo '2026-10-13' (hora UTC)

  v_borrar boolean := (v_confirmar = 'SI');
  v_esquema text := 'reseteo_' || to_char(now(), 'YYYYMMDD_HH24MISS');
  v_total_antes bigint := 0;
  v_n bigint;
  v_borradas bigint;
  p record;
  g record;
begin
  if v_confirmar not in ('SI', 'NO') then
    raise exception 'v_confirmar tiene que ser ''SI'' o ''NO''.';
  end if;
  if v_borrar and v_fecha <> to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') then
    raise exception 'Para borrar, pon en v_fecha la fecha de hoy (UTC): ''%''. Asi un script guardado no borra nada otro dia por accidente. No se ha borrado nada.', to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD');
  end if;

  -- Que se borra, en que orden y con que condicion. Los puntos antes que los
  -- sellos: borrar un sello dispara `puntos_al_borrar_sello`, que escribe en
  -- `point_movements`; con la tabla ya vacia no encuentra nada.
  create temp table if not exists reseteo_plan (orden int primary key, grupo text not null, tabla text not null, donde text not null default 'true');
  truncate reseteo_plan;
  insert into reseteo_plan (orden, grupo, tabla, donde) values
    (1,  'puntos y sellos', 'point_movements', 'true'),
    (2,  'puntos y sellos', 'consumiciones', 'true'),
    (3,  'puntos y sellos', 'encuentros', 'true'),
    (4,  'puntos y sellos', 'casas_resultados', 'true'),
    (5,  'puntos y sellos', 'casas_resultado_vistos', 'true'),
    (6,  'puntos y sellos', 'house_changes', 'true'),
    (7,  'puntos y sellos', 'stamps', 'true'),
    (8,  'puntos y sellos', 'sorteo_excluidos', 'true'),
    (9,  'puntos y sellos', 'sorteos', 'true'),
    (10, 'puntos y sellos', 'minigame_scores', 'true'),
    (11, 'puntos y sellos', 'conduces_scores', 'true'),
    (12, 'puntos y sellos', 'maestro_beers', 'true'),
    (20, 'mensajes', 'user_messages', 'true'),
    (21, 'mensajes', 'user_notices', 'true'),
    (22, 'mensajes', 'match_messages', 'true'),
    (23, 'mensajes', 'match_connection_members', 'true'),
    (24, 'mensajes', 'match_connections', 'true'),
    (25, 'mensajes', 'match_votes', 'true'),
    (26, 'mensajes', 'match_blocks', 'true'),
    (27, 'mensajes', 'anuncios', 'true'),
    (30, 'moderacion', 'match_report_messages', 'true'),
    (31, 'moderacion', 'match_moderation_log', 'true'),
    (32, 'moderacion', 'match_reports', 'true'),
    (33, 'moderacion', 'account_suspensions', 'true'),
    (34, 'moderacion', 'cana_bans', 'true'),
    (35, 'moderacion', 'route_bans', 'true'),
    (36, 'moderacion', 'match_fotos_liberadas', 'true'),
    (37, 'moderacion', 'avatar_requests', 'status = ''pendiente'''),
    (40, 'avisos al movil', 'push_cola', 'enviada_at is null');

  -- Si una tabla del plan no existe (otra version de la base) se para: no se
  -- borra a medias con una lista distinta de la prevista.
  for p in select * from reseteo_plan order by orden loop
    if to_regclass(format('public.%I', p.tabla)) is null then
      raise exception 'La tabla public.% no existe: este script no es para esta version de la base. No se ha borrado nada.', p.tabla;
    end if;
  end loop;

  -- Antes de contar nada, nadie escribe en lo que se va a borrar (ver arriba).
  -- `match_profiles` tambien: el veto de La Cana vive ahi. Con SHARE ROW EXCLUSIVE
  -- se puede seguir LEYENDO; escribir espera a que termine.
  if v_borrar then
    for p in select * from reseteo_plan order by orden loop
      execute format('lock table public.%I in share row exclusive mode', p.tabla);
    end loop;
    lock table public.match_profiles in share row exclusive mode;
  end if;

  -- Informe y estado "antes" de TODAS las tablas de public.
  create temp table if not exists reseteo_informe (orden int, grupo text, tabla text, antes bigint, borradas bigint, despues bigint, nota text);
  truncate reseteo_informe;
  create temp table if not exists reseteo_resto (tabla text primary key, antes bigint, despues bigint);
  truncate reseteo_resto;

  for p in select * from reseteo_plan order by orden loop
    execute format('select count(*) from public.%I where %s', p.tabla, p.donde) into v_n;
    insert into reseteo_informe (orden, grupo, tabla, antes, nota) values (p.orden, p.grupo, p.tabla, v_n, case when p.donde <> 'true' then 'solo ' || p.donde end);
    v_total_antes := v_total_antes + v_n;
  end loop;
  -- Los vetos de La Cana que viven en match_profiles: se cuentan como una fila mas del informe.
  select count(*) into v_n from public.match_profiles where blocked_at is not null;
  insert into reseteo_informe (orden, grupo, tabla, antes, nota) values (38, 'moderacion', 'match_profiles (vetos: blocked_at)', v_n, 'se levantan: solo esas columnas, la fila se queda');
  v_total_antes := v_total_antes + v_n;

  for g in
    select c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname not in (select tabla from reseteo_plan)
     order by 1
  loop
    execute format('select count(*) from public.%I', g.tabla) into v_n;
    insert into reseteo_resto (tabla, antes) values (g.tabla, v_n);
  end loop;
  -- De las tablas con condicion solo se borra una parte: lo demas se vigila aparte.
  for p in select * from reseteo_plan where donde <> 'true' loop
    execute format('select count(*) from public.%I where not coalesce(%s, false)', p.tabla, p.donde) into v_n;
    insert into reseteo_resto (tabla, antes) values (p.tabla || ' (lo que no se borra)', v_n);
  end loop;

  if not v_borrar then
    update reseteo_informe set nota = coalesce(nota || '; ', '') || 'SIMULACRO: no se ha borrado nada';
    update reseteo_informe set despues = antes, borradas = 0;
    raise notice 'SIMULACRO: % filas se borrarian. Para borrar de verdad, cambia NO por SI y pon la fecha.', v_total_antes;
    return;
  end if;

  if v_total_antes = 0 then
    update reseteo_informe set borradas = 0, despues = antes, nota = coalesce(nota || '; ', '') || 'nada que borrar: no se crea copia';
    raise notice 'Nada que borrar: todo esta ya a cero.';
    return;
  end if;

  -- 1. COPIA de seguridad, y se comprueba que esta completa antes de seguir.
  --    Nadie mas la ve: sin permisos para anon ni authenticated, y con RLS activado
  --    en cada tabla por si algun dia se expone el esquema.
  execute format('create schema %I', v_esquema);
  execute format('revoke all on schema %I from public, anon, authenticated', v_esquema);
  execute format('comment on schema %I is %L', v_esquema, 'COPIA del reseteo de datos de prueba (' || now() || '). Contiene datos personales: borrar con drop schema ' || v_esquema || ' cascade (como mucho a los 30 dias).');
  for p in select * from reseteo_plan order by orden loop
    execute format('create table %I.%I as select * from public.%I where %s', v_esquema, p.tabla, p.tabla, p.donde);
    execute format('alter table %I.%I enable row level security', v_esquema, p.tabla);
    execute format('select count(*) from %I.%I', v_esquema, p.tabla) into v_n;
    if v_n <> (select antes from reseteo_informe where tabla = p.tabla) then
      raise exception 'La copia de % no esta completa (% de %). No se ha borrado nada.', p.tabla, v_n, (select antes from reseteo_informe where tabla = p.tabla);
    end if;
  end loop;
  -- Los vetos de La Cana: la copia guarda las tres columnas para poder devolverlos.
  execute format('create table %I.match_profiles_vetos as select user_id, blocked_at, blocked_by, blocked_reason from public.match_profiles where blocked_at is not null', v_esquema);
  execute format('alter table %I.match_profiles_vetos enable row level security', v_esquema);

  -- 2. BORRAR, en orden, sin disparadores de usuario en esas tablas (todo dentro
  --    de esta transaccion: si algo falla, vuelven a estar como antes).
  for p in select * from reseteo_plan loop
    execute format('alter table public.%I disable trigger user', p.tabla);
  end loop;
  for p in select * from reseteo_plan order by orden loop
    execute format('delete from public.%I where %s', p.tabla, p.donde);
    get diagnostics v_borradas = row_count;
    if v_borradas <> (select antes from reseteo_informe where tabla = p.tabla) then
      raise exception 'En public.% se han borrado % filas y la copia tiene %: alguien ha escrito mientras se borraba. Se deshace todo.', p.tabla, v_borradas, (select antes from reseteo_informe where tabla = p.tabla);
    end if;
  end loop;
  for p in select * from reseteo_plan loop
    execute format('alter table public.%I enable trigger user', p.tabla);
  end loop;

  -- Levantar los vetos de La Cana igual que lo hace match_admin_lift_cana: las
  -- tres columnas, y nada mas (no se toca is_active ni las activaciones por ruta).
  update public.match_profiles
     set blocked_at = null, blocked_by = null, blocked_reason = ''
   where blocked_at is not null;
  get diagnostics v_borradas = row_count;
  if v_borradas <> (select antes from reseteo_informe where orden = 38) then
    raise exception 'Se esperaba levantar % vetos de La Cana y se han levantado %. Se deshace todo.', (select antes from reseteo_informe where orden = 38), v_borradas;
  end if;

  -- Que los clientes con la pantalla de casas abierta se enteren (el tiempo real
  -- mira esta tabla). `where true` a proposito: son todas las rutas.
  update public.casas_marcador set cambiado_at = now() where true;

  -- 3. COMPROBAR. Lo borrado, a cero; todo lo demas, exactamente como estaba.
  for p in select * from reseteo_plan order by orden loop
    execute format('select count(*) from public.%I where %s', p.tabla, p.donde) into v_n;
    update reseteo_informe set despues = v_n, borradas = antes - v_n where tabla = p.tabla;
    if v_n <> 0 then
      raise exception 'Despues de borrar, public.% sigue teniendo % filas. Se deshace todo.', p.tabla, v_n;
    end if;
  end loop;
  select count(*) into v_n from public.match_profiles where blocked_at is not null;
  update reseteo_informe set despues = v_n, borradas = antes - v_n where orden = 38;
  if v_n <> 0 then
    raise exception 'Quedan % vetos de La Cana sin levantar. Se deshace todo.', v_n;
  end if;
  for g in select tabla from reseteo_resto where tabla not like '% (lo que no se borra)' loop
    execute format('select count(*) from public.%I', g.tabla) into v_n;
    update reseteo_resto set despues = v_n where tabla = g.tabla;
  end loop;
  for p in select * from reseteo_plan where donde <> 'true' loop
    execute format('select count(*) from public.%I where not coalesce(%s, false)', p.tabla, p.donde) into v_n;
    update reseteo_resto set despues = v_n where tabla = p.tabla || ' (lo que no se borra)';
  end loop;
  for g in select * from reseteo_resto where antes is distinct from despues loop
    raise exception 'La tabla % ha cambiado sin que tocase (% -> %). Se deshace todo: no se ha borrado nada.', g.tabla, g.antes, g.despues;
  end loop;

  update reseteo_informe set nota = coalesce(nota || '; ', '') || 'copia en ' || v_esquema;
  raise notice 'HECHO: % filas borradas o levantadas. Copia en el esquema %.', v_total_antes, v_esquema;
end
$reseteo$;

-- El informe: una fila por tabla, y al final lo que no debia cambiar.
select orden, grupo, tabla, antes, borradas, despues, nota
  from reseteo_informe
union all
select 100, 'NO SE TOCA (debe quedar igual)', tabla, antes, 0, coalesce(despues, antes), case when antes is not distinct from coalesce(despues, antes) then 'igual' else 'CAMBIO' end
  from reseteo_resto
 order by 1, 3;

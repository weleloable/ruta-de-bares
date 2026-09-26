-- Ruta de Bares - 0030: minijuegos. Ranking POR RUTA y cervezas guardadas.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0029.
-- Idempotente: se puede re-ejecutar sin romper nada (tablas con `if not exists`,
-- funciones con `or replace`). Ojo al reves: esta migracion rehace export_my_data()
-- a partir de la 0025, asi que la 0025 ya no se puede volver a pegar despues.
--
-- Que hace. La pestana Juegos guarda ahora dos cosas EN LA RUTA:
--
--   * `minigame_scores`: la MEJOR nota de cada persona en cada juego con
--     ranking (hoy solo "La Cana Perfecta"). Una fila por persona, juego y
--     ruta: no se guarda cada tirada, solo la mejor, que es lo que se ensena y
--     lo minimo que hace falta.
--   * `maestro_beers`: todas las cervezas de "Maestro Cervecero", con el nombre
--     que puso quien la hizo. Las ven las personas de la misma ruta.
--
-- Decisiones que conviene conocer:
--
--   * **Todo es por ruta.** Ni el ranking ni la lista cruzan de una ruta a otra,
--     y solo los ve quien esta dentro (o un admin). Coherente con el resto de la
--     app: una cuenta nueva no ve nada hasta canjear una invitacion.
--   * **Las tablas no tienen privilegios para la app**, como las `match_*`: todo
--     pasa por funciones SECURITY DEFINER que comprueban quien llama. Sin RLS
--     que olvidar y sin `supabase.from('minigame_scores')` que compile.
--   * **La nota no se cree: se comprueba.** El cliente no manda la nota de una
--     cerveza: manda la RECETA (malta, levadura y tres porcentajes) y el
--     servidor calcula estilo, graduacion, amargor y nota con
--     `maestro_calcular_cerveza`. Es un espejo de `estilo.ts`; un test compara
--     las dos con todas las combinaciones. Lo que el servidor NO puede saber es
--     si el porcentaje de una receta se gano jugando: quien se salte la app
--     puede mandar 100/100/100. Se frena con un ritmo minimo (`TOO_FAST`) y con
--     un tope de cervezas por ruta; evitarlo del todo no se puede.
--   * En el ranking de "La Cana Perfecta" el servidor solo acepta notas de 0 a
--     100 y espacia los envios (4 s: llenar un vaso lleva mas).
--   * Quien esta suspendida no puede enviar nada (`SUSPENDED`); si puede seguir
--     llevandose sus datos (`export_my_data`) y borrar la cuenta.
--   * El nombre de una cerveza lo escribe quien la hace y lo ven otras personas:
--     es texto libre de hasta 30 caracteres. Quien la hizo puede borrarla y un
--     admin tambien (`maestro_delete_beer`), que es la moderacion que hay.
--   * Se borran con la ruta (cascade desde `routes`) y con la cuenta (cascade
--     desde `profiles`), sin dejar rastro: no es moderacion, es contenido.
--
-- Errores que lanzan las funciones: NOT_AUTHENTICATED, FORBIDDEN, SUSPENDED,
-- INVALID_GAME, INVALID_SCORE, INVALID_RECIPE, INVALID_NAME, TOO_FAST,
-- LIMIT_REACHED.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists public.minigame_scores (
  route_id       uuid not null references public.routes (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  game           text not null check (game in ('cana-perfecta')),
  best_score     integer not null check (best_score between 0 and 100),
  best_at        timestamptz not null default now(),
  -- Cuando llego el ULTIMO envio (mejorase o no): para espaciarlos.
  last_submit_at timestamptz not null default now(),
  primary key (route_id, user_id, game)
);

create index if not exists minigame_scores_ranking_idx
  on public.minigame_scores (route_id, game, best_score desc);

create table if not exists public.maestro_beers (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.routes (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 30 and name !~ '[[:cntrl:]]'),
  malta       text not null check (malta in ('palida', 'caramelo', 'tostada', 'negra')),
  levadura    text not null check (levadura in ('ale', 'lager')),
  -- Porcentajes de acierto de cada microjuego, 0..100.
  maceracion  smallint not null check (maceracion between 0 and 100),
  amargor     smallint not null check (amargor between 0 and 100),
  aroma       smallint not null check (aroma between 0 and 100),
  -- Lo calculado por el servidor a partir de lo anterior.
  estilo      text not null,
  abv         numeric(3, 1) not null,
  ibu         integer not null,
  cuerpo      text not null,
  score       integer not null check (score between 0 and 100),
  created_at  timestamptz not null default now()
);

create index if not exists maestro_beers_ruta_idx on public.maestro_beers (route_id, created_at desc);
create index if not exists maestro_beers_user_idx on public.maestro_beers (user_id, route_id, created_at desc);

alter table public.minigame_scores enable row level security;
alter table public.maestro_beers enable row level security;
-- Sin policies y sin privilegios: la app solo entra por las funciones de abajo.
revoke all on table public.minigame_scores from anon, authenticated;
revoke all on table public.maestro_beers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------------
-- Quien puede LEER: alguien de la ruta o un admin. Quien puede ESCRIBIR ademas
-- no esta suspendida. Devuelve el uid.
create or replace function public.minijuegos_require(p_route_id uuid, p_escribir boolean)
returns uuid
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
  if not (public.is_route_participant(p_route_id, v_uid) or (not p_escribir and public.is_admin())) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_escribir and public.esta_suspendida(v_uid) then
    raise exception 'SUSPENDED' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function public.minijuegos_require(uuid, boolean) from public, anon, authenticated;

-- Espejo de src/features/minijuegos/juegos/maestro/estilo.ts: los DOS se
-- calculan con aritmetica ENTERA sobre porcentajes para que no puedan diferir
-- por un redondeo de coma flotante. Si se toca uno, se toca el otro (hay test).
create or replace function public.maestro_calcular_cerveza(
  p_malta text, p_levadura text, p_maceracion integer, p_amargor integer, p_aroma integer
)
returns table (estilo text, abv numeric, ibu integer, cuerpo text, score integer)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_ibu    integer;
  v_estilo text;
  v_extra  integer;   -- decimas de grado que suma el estilo
  v_base   integer;   -- cuerpo de la malta, en milesimas
  v_cuerpo integer;
begin
  if p_malta not in ('palida', 'caramelo', 'tostada', 'negra')
     or p_levadura not in ('ale', 'lager')
     or p_maceracion not between 0 and 100
     or p_amargor not between 0 and 100
     or p_aroma not between 0 and 100 then
    raise exception 'INVALID_RECIPE' using errcode = '22023';
  end if;

  v_ibu := round(10 + p_amargor * 50 / 100.0)::integer;

  if p_levadura = 'lager' then
    v_estilo := case p_malta
      when 'palida' then 'Pilsner' when 'caramelo' then 'Lager ámbar'
      when 'tostada' then 'Dunkel' else 'Schwarzbier' end;
  elsif p_malta = 'palida' then
    v_estilo := case when v_ibu >= 40 then 'IPA' else 'Rubia' end;
  else
    v_estilo := case p_malta when 'caramelo' then 'Amber Ale' when 'tostada' then 'Tostada' else 'Stout' end;
  end if;

  v_extra := case v_estilo
    when 'Pilsner' then 0 when 'Lager ámbar' then 2 when 'Dunkel' then 2
    when 'Schwarzbier' then 3 when 'Rubia' then 0 when 'IPA' then 8
    when 'Amber Ale' then 3 when 'Tostada' then 2 else 6 end;   -- Stout

  v_base := case p_malta when 'palida' then 1000 when 'caramelo' then 2000 when 'tostada' then 2000 else 2500 end;
  v_cuerpo := v_base + 12 * p_maceracion;

  -- `return query` y no asignar a los OUT + `return next`: es lo mismo, pero el
  -- parser de plpgsql de tests/ no entiende un `return next` sin expresion.
  return query select
    v_estilo,
    (round((4200 + 18 * p_maceracion + 100 * v_extra) / 100.0) / 10.0)::numeric,
    v_ibu,
    case when v_cuerpo < 2000 then 'ligero' when v_cuerpo < 3000 then 'medio' else 'con cuerpo' end,
    round((40 * p_maceracion + 30 * p_amargor + 30 * p_aroma) / 100.0)::integer;
end;
$$;
revoke all on function public.maestro_calcular_cerveza(text, text, integer, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ranking de La Cana Perfecta
-- ---------------------------------------------------------------------------
create or replace function public.minigame_submit_score(p_route_id uuid, p_game text, p_score integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.minijuegos_require(p_route_id, true);
  v_prev public.minigame_scores%rowtype;
  v_best integer;
begin
  if p_game is distinct from 'cana-perfecta' then
    raise exception 'INVALID_GAME' using errcode = '22023';
  end if;
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;

  select * into v_prev from public.minigame_scores
   where route_id = p_route_id and user_id = v_uid and game = p_game
   for update;

  if found and clock_timestamp() - v_prev.last_submit_at < interval '4 seconds' then
    raise exception 'TOO_FAST' using errcode = '54000';
  end if;

  if not found then
    insert into public.minigame_scores (route_id, user_id, game, best_score, best_at, last_submit_at)
    values (p_route_id, v_uid, p_game, p_score, clock_timestamp(), clock_timestamp());
    return jsonb_build_object('best', p_score, 'is_record', true);
  end if;

  v_best := greatest(v_prev.best_score, p_score);
  update public.minigame_scores
     set best_score = v_best,
         best_at = case when p_score > v_prev.best_score then clock_timestamp() else best_at end,
         last_submit_at = clock_timestamp()
   where route_id = p_route_id and user_id = v_uid and game = p_game;
  return jsonb_build_object('best', v_best, 'is_record', p_score > v_prev.best_score);
end;
$$;

-- Los mejores de la ruta, y ademas tu fila aunque no entres en el top. Ante un
-- empate gana quien lo logro antes.
create or replace function public.minigame_ranking(p_route_id uuid, p_game text, p_limit integer default 50)
returns table (pos bigint, user_id uuid, display_name text, score integer, achieved_at timestamptz, is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public.minijuegos_require(p_route_id, false);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  return query
  with ordenado as (
    select row_number() over (order by s.best_score desc, s.best_at asc) as n,
           s.user_id as uid, p.display_name as nombre, s.best_score as nota, s.best_at as cuando
      from public.minigame_scores s
      join public.profiles p on p.id = s.user_id
     where s.route_id = p_route_id and s.game = p_game
  )
  select o.n, o.uid, o.nombre, o.nota, o.cuando, (o.uid = v_uid)
    from ordenado o
   where o.n <= v_limit or o.uid = v_uid
   order by o.n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Maestro Cervecero
-- ---------------------------------------------------------------------------
create or replace function public.maestro_submit_beer(
  p_route_id uuid, p_name text, p_malta text, p_levadura text,
  p_maceracion integer, p_amargor integer, p_aroma integer
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

  select * into v_calc from public.maestro_calcular_cerveza(p_malta, p_levadura, p_maceracion, p_amargor, p_aroma);

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
    (route_id, user_id, name, malta, levadura, maceracion, amargor, aroma, estilo, abv, ibu, cuerpo, score, created_at)
  values
    (p_route_id, v_uid, v_nombre, p_malta, p_levadura, p_maceracion, p_amargor, p_aroma,
     v_calc.estilo, v_calc.abv, v_calc.ibu, v_calc.cuerpo, v_calc.score, clock_timestamp())
  returning * into v_fila;

  return jsonb_build_object(
    'id', v_fila.id, 'name', v_fila.name, 'estilo', v_fila.estilo, 'abv', v_fila.abv,
    'ibu', v_fila.ibu, 'cuerpo', v_fila.cuerpo, 'score', v_fila.score
  );
end;
$$;

create or replace function public.maestro_list_beers(
  p_route_id uuid, p_limit integer default 50, p_offset integer default 0, p_only_mine boolean default false
)
returns table (
  id uuid, user_id uuid, display_name text, name text, malta text, levadura text,
  estilo text, abv numeric, ibu integer, cuerpo text, score integer, created_at timestamptz, is_mine boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.minijuegos_require(p_route_id, false);
begin
  return query
  select b.id, b.user_id, p.display_name, b.name, b.malta, b.levadura,
         b.estilo, b.abv, b.ibu, b.cuerpo, b.score, b.created_at, (b.user_id = v_uid)
    from public.maestro_beers b
    join public.profiles p on p.id = b.user_id
   where b.route_id = p_route_id
     and (not coalesce(p_only_mine, false) or b.user_id = v_uid)
   order by b.created_at desc, b.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Borrar una cerveza: la tuya, o cualquiera si eres admin (moderacion del nombre).
create or replace function public.maestro_delete_beer(p_beer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dueno uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select b.user_id into v_dueno from public.maestro_beers b where b.id = p_beer_id;
  if not found or not (v_dueno = v_uid or public.is_admin()) then
    -- Mismo error si no existe o no es tuya: no se confirma que existe.
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.maestro_beers where id = p_beer_id;
  return true;
end;
$$;

revoke all on function public.minigame_submit_score(uuid, text, integer) from public, anon;
revoke all on function public.minigame_ranking(uuid, text, integer) from public, anon;
revoke all on function public.maestro_submit_beer(uuid, text, text, text, integer, integer, integer) from public, anon;
revoke all on function public.maestro_list_beers(uuid, integer, integer, boolean) from public, anon;
revoke all on function public.maestro_delete_beer(uuid) from public, anon;
grant execute on function public.minigame_submit_score(uuid, text, integer) to authenticated;
grant execute on function public.minigame_ranking(uuid, text, integer) to authenticated;
grant execute on function public.maestro_submit_beer(uuid, text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.maestro_list_beers(uuid, integer, integer, boolean) to authenticated;
grant execute on function public.maestro_delete_beer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Descargar tus datos: ahora tambien lo de los minijuegos
-- ---------------------------------------------------------------------------
-- Es la export_my_data() de la 0025 tal cual, con el bloque `minijuegos` nuevo.
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

    -- Lo de los minijuegos (0030): tu mejor nota por juego y ruta, y las cervezas
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
                 'amargor', b.amargor, 'aroma', b.aroma, 'el', b.created_at
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

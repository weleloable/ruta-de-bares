-- Ruta de Bares - 0060: tipo de parada (bar, foto u otra) y solo los bares se sellan.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0059.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define funciones que una migracion POSTERIOR rehizo: volver a pegarla las
-- devuelve a esta version, en silencio y sin avisar. Aqui quedan obsoletas:
--   * claim_stamp() la rehace la 0061
--   * admin_estadisticas_actividad() la rehace la 0061
-- Ojo al reves: rehace funciones de la 0004, 0040, 0041, 0045, 0047, 0058 y
-- 0059, que ya no se pueden volver a pegar despues (devolverian el recuento
-- de paradas de antes, sin distinguir el tipo).
--
-- Por que. En la ruta hay paradas que no son un bar: se para a hacer una foto
-- de grupo. Tienen que salir en el mapa, con su horario y su sitio, pero NO se
-- sellan: la gente tiene que fijarse en la foto, no en el sello.
--
-- Que hace.
--
--   * `route_bars.tipo`: 'bar' (la de siempre, se sella), 'foto' (parada de
--     foto de grupo) u 'otra' (parada sin sello). Por defecto 'bar', asi que
--     ninguna ruta existente cambia.
--   * `claim_stamp` rechaza el sello de una parada que no es un bar
--     (NOT_STAMPABLE). Lo comprueba el servidor, no solo la pantalla.
--   * Todo lo que cuenta bares cuenta SOLO los de tipo 'bar': completar la ruta
--     y su puntuacion (`puntos_por_sello`), los retos (`reto_progreso`), el nivel
--     maximo de "¿Conduces tu?" y las estadisticas de admin (`admin_estadisticas_*`).
--   * El horario y el sitio de la ruta NO cambian: La Cana (0042) y el momento
--     en que la ruta termina siguen usando la primera y la ultima parada del
--     orden, sean del tipo que sean.
--   * Si una parada deja de ser un bar, se pierde lo que tenia de sellos: se
--     anulan los puntos de sus sellos y de la racha de ese bar (con el motivo) y
--     se retiran esos sellos, para que las cifras cuadren. Pasa pocas veces:
--     se configura bien antes de empezar. Los puntos de "ruta completa" ya
--     dados se quedan.

alter table public.route_bars add column if not exists tipo text not null default 'bar';
alter table public.route_bars drop constraint if exists route_bars_tipo_check;
alter table public.route_bars add constraint route_bars_tipo_check check (tipo in ('bar', 'foto', 'otra'));

-- Una parada que deja de ser un bar pierde sus sellos y los puntos de esos sellos.
create or replace function public.route_bars_al_cambiar_tipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.tipo = 'bar' and new.tipo <> 'bar' then
    update public.point_movements m
       set annulled_at = now(), annulled_by = auth.uid(),
           annul_reason = 'La parada dejo de ser un bar: sin sello'
     where m.annulled_at is null
       and (
         m.ref in (select 'sello:' || s.id from public.stamps s where s.route_bar_id = new.id)
         or (m.action = 'racha' and m.detail ->> 'bar' = new.id::text)
       );
    delete from public.stamps s where s.route_bar_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists route_bars_tipo on public.route_bars;
create trigger route_bars_tipo
  after update of tipo on public.route_bars
  for each row execute function public.route_bars_al_cambiar_tipo();

revoke all on function public.route_bars_al_cambiar_tipo() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Las funciones que cuentan bares (copiadas de su ultima version, no de
-- memoria), ahora solo con los de tipo 'bar'.
-- ---------------------------------------------------------------------------

-- claim_stamp
create or replace function public.claim_stamp(
  p_route_bar_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns public.stamps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_bar   public.route_bars%rowtype;
  v_pub   boolean;
  v_dist  double precision;
  v_stamp public.stamps%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_bar from public.route_bars where id = p_route_bar_id;
  if not found then
    raise exception 'BAR_NOT_FOUND' using errcode = 'P0002';
  end if;

  select r.is_published into v_pub from public.routes r where r.id = v_bar.route_id;
  if not coalesce(v_pub, false) and not public.is_admin() then
    raise exception 'ROUTE_NOT_PUBLISHED' using errcode = 'P0001';
  end if;

  if not public.is_admin() and not public.is_route_member(v_bar.route_id) then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  -- Una parada que no es un bar (foto, otra) no se sella: se ve en el mapa y ya.
  if v_bar.tipo <> 'bar' then
    raise exception 'NOT_STAMPABLE' using errcode = 'P0001';
  end if;

  -- Idempotente: volver a sellar un bar ya sellado devuelve el sello original
  -- en vez de fallar, aunque la ventana ya se haya cerrado.
  select * into v_stamp from public.stamps
   where user_id = v_uid and route_bar_id = p_route_bar_id;
  if found then
    return v_stamp;
  end if;

  if now() < v_bar.opens_at then
    raise exception 'TOO_EARLY' using errcode = 'P0001';
  end if;
  if now() > v_bar.closes_at then
    raise exception 'TOO_LATE' using errcode = 'P0001';
  end if;

  v_dist := public.distance_m(p_lat, p_lng, v_bar.lat, v_bar.lng);
  if v_dist > v_bar.radius_m then
    raise exception 'TOO_FAR_%', round(v_dist)::text using errcode = 'P0001';
  end if;

  insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m)
  values (v_uid, p_route_bar_id, p_lat, p_lng, v_dist)
  returning * into v_stamp;

  return v_stamp;
end;
$$;

-- puntos_por_sello
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

  select count(*) into v_bares from public.route_bars b where b.route_id = v_ruta and b.tipo = 'bar';
  select count(distinct s.route_bar_id) into v_mios
    from public.stamps s join public.route_bars b on b.id = s.route_bar_id
   where b.route_id = v_ruta and s.user_id = v_sello.user_id;
  if v_bares > 0 and v_mios >= v_bares then
    perform public.puntos_otorgar(v_ruta, v_sello.user_id, v_casa, 'ruta_completa', 'ruta_completa:' || v_sello.user_id);
  end if;

  perform public.puntos_racha(v_sello.route_bar_id);
end;
$$;

-- reto_progreso
create or replace function public.reto_progreso(p_reto public.retos, p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bares integer;
  v_mios  integer;
  v_ultimo timestamptz;
begin
  case p_reto.tipo
    when 'categorias' then
      return (select count(distinct c.categoria) from public.consumiciones c
               where c.user_id = p_user_id and c.route_id = p_reto.route_id);
    when 'consumiciones_categoria' then
      return (select count(*) from public.consumiciones c
               where c.user_id = p_user_id and c.route_id = p_reto.route_id and c.categoria = p_reto.categoria);
    when 'bares' then
      return (select count(distinct s.route_bar_id)
                from public.stamps s join public.route_bars b on b.id = s.route_bar_id
               where s.user_id = p_user_id and b.route_id = p_reto.route_id);
    when 'encuentros_qr' then
      return (select count(*) from public.encuentros e
               where e.route_id = p_reto.route_id and e.tipo = 'qr' and p_user_id = any (e.usuarios));
    when 'ruta_antes_de' then
      select count(*) into v_bares from public.route_bars b where b.route_id = p_reto.route_id and b.tipo = 'bar';
      select count(distinct s.route_bar_id), max(s.stamped_at) into v_mios, v_ultimo
        from public.stamps s join public.route_bars b on b.id = s.route_bar_id
       where s.user_id = p_user_id and b.route_id = p_reto.route_id;
      return case when v_bares > 0 and v_mios >= v_bares and v_ultimo <= p_reto.hora_limite then 1 else 0 end;
    else
      return 0;
  end case;
end;
$$;

-- conduces_submit_score
create or replace function public.conduces_submit_score(p_route_id uuid, p_level integer, p_distance integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public.minijuegos_require(p_route_id, true);
  v_max   integer;
  v_prev  public.conduces_scores%rowtype;
  v_best  integer;
  v_at    timestamptz;
  v_rec   boolean;
  v_pos   integer;
  v_total integer;
begin
  select greatest(count(*), 1)::integer into v_max from public.route_bars b where b.route_id = p_route_id and b.tipo = 'bar';
  if p_level is null or p_level < 1 or p_level > v_max then
    raise exception 'INVALID_LEVEL' using errcode = '22023';
  end if;
  if p_distance is null or p_distance < 0 or p_distance > 1000000 then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;

  select * into v_prev from public.conduces_scores s
   where s.route_id = p_route_id and s.user_id = v_uid and s.level = p_level
   for update;

  if found and clock_timestamp() - v_prev.last_submit_at < interval '4 seconds' then
    raise exception 'TOO_FAST' using errcode = '54000';
  end if;

  if not found then
    insert into public.conduces_scores (route_id, user_id, level, best_distance, best_at, last_submit_at)
    values (p_route_id, v_uid, p_level, p_distance, clock_timestamp(), clock_timestamp());
    v_best := p_distance;
    v_rec := true;
  else
    v_rec := p_distance > v_prev.best_distance;
    v_best := greatest(v_prev.best_distance, p_distance);
    update public.conduces_scores s
       set best_distance = v_best,
           best_at = case when v_rec then clock_timestamp() else s.best_at end,
           last_submit_at = clock_timestamp()
     where s.route_id = p_route_id and s.user_id = v_uid and s.level = p_level;
  end if;

  select s.best_at into v_at from public.conduces_scores s
   where s.route_id = p_route_id and s.user_id = v_uid and s.level = p_level;
  -- El puesto, con el mismo orden que el ranking: mas metros, y en empate quien llego antes.
  select count(*)::integer + 1 into v_pos from public.conduces_scores s
   where s.route_id = p_route_id and s.level = p_level
     and (s.best_distance > v_best or (s.best_distance = v_best and s.best_at < v_at));
  select count(*)::integer into v_total from public.conduces_scores s
   where s.route_id = p_route_id and s.level = p_level;

  return jsonb_build_object('best', v_best, 'is_record', v_rec, 'position', v_pos, 'total', v_total);
end;
$$;

-- admin_estadisticas_ruta
create or replace function public.admin_estadisticas_ruta(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bares integer;
begin
  perform public.match_admin_require();
  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    raise exception 'ROUTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_bares from public.route_bars b where b.route_id = p_route_id and b.tipo = 'bar';

  return jsonb_build_object(
    'ruta', jsonb_build_object(
      'personas', (select count(*) from public.route_members m where m.route_id = p_route_id),
      'bares', v_bares,
      'sellos', (
        select count(*) from public.stamps s
          join public.route_bars b on b.id = s.route_bar_id
         where b.route_id = p_route_id
      ),
      'han_sellado', (
        select count(distinct s.user_id) from public.stamps s
          join public.route_bars b on b.id = s.route_bar_id
         where b.route_id = p_route_id
      ),
      -- Una ruta sin bares no se puede completar: 0 y no "todos".
      'completaron', case when v_bares = 0 then 0 else (
        select count(*) from (
          select s.user_id from public.stamps s
            join public.route_bars b on b.id = s.route_bar_id
           where b.route_id = p_route_id
           group by s.user_id
          having count(distinct s.route_bar_id) = v_bares
        ) x
      ) end
    ),

    'cana', jsonb_build_object(
      'activada', (
        select count(*) from public.match_route_activations a
          join public.route_members m on m.user_id = a.user_id and m.route_id = a.route_id
         where a.route_id = p_route_id
      ),
      'me_gusta', (
        select count(*) from public.match_votes v where v.route_id = p_route_id and v.value = 'like'
      ),
      'conexiones', (select count(*) from public.match_connections c where c.route_id = p_route_id),
      'conexiones_abiertas', (
        select count(*) from public.match_connections c where c.route_id = p_route_id and c.is_open
      ),
      'preguntas', (
        select count(*) from public.match_connections c
         where c.route_id = p_route_id and c.question_state <> 'none'
      ),
      'si', (
        select count(*) from public.match_connections c
         where c.route_id = p_route_id and c.question_state = 'accepted'
      )
    ),

    -- Las cinco mas elegidas por la gente con La Caña activada EN ESTA RUTA. En
    -- empate, por orden alfabetico, que es como salen en la app.
    'etiquetas', coalesce((
      select jsonb_agg(jsonb_build_object('etiqueta', x.label, 'veces', x.veces) order by x.veces desc, x.sort_order)
        from (
          select t.label, t.sort_order, count(*)::integer as veces
            from public.match_profile_tags pt
            join public.match_tags t on t.id = pt.tag_id
            join public.match_route_activations a on a.user_id = pt.user_id and a.route_id = p_route_id
            join public.route_members m on m.user_id = pt.user_id and m.route_id = p_route_id
           group by t.label, t.sort_order
           order by veces desc, t.sort_order
           limit 5
        ) x
    ), '[]'::jsonb),

    'moderacion', jsonb_build_object(
      'denuncias', (select count(*) from public.match_reports r where r.route_id = p_route_id),
      'denuncias_sin_cerrar', (
        select count(*) from public.match_reports r where r.route_id = p_route_id and r.status <> 'resuelta'
      ),
      -- Vetos que siguen puestos en esta ruta: de la ruta y de La Caña. Las
      -- suspensiones de cuenta no son de ninguna ruta (sacan de todas), asi
      -- que no se cuentan aqui.
      'vetos', (
        (select count(*) from public.route_bans b where b.route_id = p_route_id)
        + (select count(*) from public.cana_bans c where c.route_id = p_route_id)
      )
    )
  );
end;
$$;

-- admin_estadisticas_actividad
create or replace function public.admin_estadisticas_actividad(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();
  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    raise exception 'ROUTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'participacion', jsonb_build_object(
      'personas', (select count(*) from public.route_members m where m.route_id = p_route_id),
      'sellaron', (select count(distinct s.user_id) from public.stamps s
                     join public.route_bars b on b.id = s.route_bar_id where b.route_id = p_route_id),
      'consumieron', (select count(distinct q.user_id) from public.consumiciones q where q.route_id = p_route_id),
      'qr', (select count(distinct u) from public.encuentros e, unnest(e.usuarios) as u
              where e.route_id = p_route_id and e.tipo = 'qr'),
      'jugaron', (select count(*) from (
                    select s.user_id from public.minigame_scores s where s.route_id = p_route_id
                    union select b.user_id from public.maestro_beers b where b.route_id = p_route_id
                    union select c.user_id from public.conduces_scores c where c.route_id = p_route_id
                  ) x),
      'cana', (select count(*) from public.match_route_activations a where a.route_id = p_route_id),
      'retos', (select count(distinct m.user_id) from public.point_movements m
                 where m.route_id = p_route_id and m.action = 'reto' and m.annulled_at is null and m.user_id is not null),
      'activos_30min', (select count(*) from (
                          select s.user_id from public.stamps s
                            join public.route_bars b on b.id = s.route_bar_id
                           where b.route_id = p_route_id and s.stamped_at > now() - interval '30 minutes'
                          union select q.user_id from public.consumiciones q
                           where q.route_id = p_route_id and q.created_at > now() - interval '30 minutes'
                          union select u from public.encuentros e, unnest(e.usuarios) as u
                           where e.route_id = p_route_id and e.created_at > now() - interval '30 minutes'
                        ) x)
    ),
    'bares', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', b.name, 'sellos', (
               select count(*) from public.stamps s where s.route_bar_id = b.id))
             order by b.sort_order)
        from public.route_bars b where b.route_id = p_route_id and b.tipo = 'bar'
    ), '[]'::jsonb),
    'horas', coalesce((
      select jsonb_agg(jsonb_build_object('hora', h.hora, 'sellos', h.n) order by h.hora)
        from (
          select date_trunc('hour', s.stamped_at) as hora, count(*) as n
            from public.stamps s join public.route_bars b on b.id = s.route_bar_id
           where b.route_id = p_route_id
           group by 1
        ) h
    ), '[]'::jsonb),
    'consumiciones', jsonb_build_object(
      'total', (select count(*) from public.consumiciones q where q.route_id = p_route_id),
      'puntuan', (select count(*) from public.consumiciones q where q.route_id = p_route_id and q.puntua),
      'personas', (select count(distinct q.user_id) from public.consumiciones q where q.route_id = p_route_id),
      'por_categoria', (
        select jsonb_object_agg(c.categoria, (
                 select count(*) from public.consumiciones q where q.route_id = p_route_id and q.categoria = c.categoria))
          from (values ('tercio'), ('jarra'), ('vino'), ('sidra'), ('chupito'), ('sin_alcohol')) as c (categoria)
      )
    ),
    'juegos', coalesce((
      select jsonb_agg(j order by j ->> 'juego')
        from (
          select jsonb_build_object('juego', s.game, 'jugadores', count(distinct s.user_id), 'mejor', max(s.best_score)) as j
            from public.minigame_scores s where s.route_id = p_route_id group by s.game
          union all
          select jsonb_build_object('juego', 'maestro-cervecero', 'jugadores', count(distinct b.user_id), 'mejor', max(b.score))
            from public.maestro_beers b where b.route_id = p_route_id having count(*) > 0
          union all
          select jsonb_build_object('juego', 'conduces-tu', 'jugadores', count(distinct c.user_id), 'mejor', null)
            from public.conduces_scores c where c.route_id = p_route_id having count(*) > 0
        ) x
    ), '[]'::jsonb),
    'retos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', r.nombre, 'activo', r.activo, 'puntos', r.puntos, 'plazas', r.max_personas,
               'conseguidos', (select count(*) from public.point_movements m
                                where m.route_id = p_route_id and m.action = 'reto' and m.annulled_at is null
                                  and m.detail ->> 'reto' = r.id::text))
             order by r.created_at)
        from public.retos r where r.route_id = p_route_id
    ), '[]'::jsonb),
    'qr', jsonb_build_object(
      'encuentros', (select count(*) from public.encuentros e where e.route_id = p_route_id and e.tipo = 'qr'),
      'puntuan', (select count(*) from public.encuentros e where e.route_id = p_route_id and e.tipo = 'qr' and e.puntua)
    )
  );
end;
$$;

-- admin_estadisticas_global
create or replace function public.admin_estadisticas_global(p_temporada_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();

  return (
    with rutas as (
      select r.* from public.routes r where p_temporada_id is null or r.temporada_id = p_temporada_id
    ),
    filas as (
      select r.id, r.name, r.event_date, r.created_at,
             (select count(*) from public.route_members rm where rm.route_id = r.id) as personas,
             (select count(*) from public.route_bars b where b.route_id = r.id and b.tipo = 'bar') as bares,
             (select count(*) from public.stamps s join public.route_bars b on b.id = s.route_bar_id where b.route_id = r.id) as sellos,
             (select count(*) from public.consumiciones q where q.route_id = r.id) as consumiciones,
             (select count(*) from (
                select s.user_id from public.stamps s join public.route_bars b on b.id = s.route_bar_id
                 where b.route_id = r.id group by s.user_id
                having count(distinct s.route_bar_id) >= (select count(*) from public.route_bars b2 where b2.route_id = r.id and b2.tipo = 'bar')
                   and (select count(*) from public.route_bars b3 where b3.route_id = r.id and b3.tipo = 'bar') > 0
              ) c) as completaron,
             (select cr.ganadoras from public.casas_resultados cr where cr.route_id = r.id) as ganadoras
        from rutas r
    )
    select jsonb_build_object(
      'totales', jsonb_build_object(
        'rutas', (select count(*) from rutas),
        'personas', (select count(distinct rm.user_id) from public.route_members rm where rm.route_id in (select id from rutas)),
        'sellos', coalesce((select sum(f.sellos) from filas f), 0),
        'consumiciones', coalesce((select sum(f.consumiciones) from filas f), 0),
        'encuentros', (select count(*) from public.encuentros e where e.tipo = 'qr' and e.route_id in (select id from rutas)),
        'retos', (select count(*) from public.point_movements m
                   where m.action = 'reto' and m.annulled_at is null and m.route_id in (select id from rutas))
      ),
      'rutas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nombre', f.name, 'fecha', f.event_date, 'personas', f.personas, 'bares', f.bares,
                 'sellos', f.sellos, 'completaron', f.completaron, 'consumiciones', f.consumiciones,
                 'cerrada', f.ganadoras is not null, 'ganadoras', coalesce(to_jsonb(f.ganadoras), '[]'::jsonb))
               order by f.event_date desc nulls last, f.created_at desc)
          from filas f
      ), '[]'::jsonb)
    )
  );
end;
$$;

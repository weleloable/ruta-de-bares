-- Ruta de Bares - 0045: consumiciones en cada bar y la racha de casa.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0044.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define funciones que una migracion POSTERIOR rehizo: volver a pegarla las
-- devuelve a esta version, en silencio y sin avisar. Aqui quedan obsoletas:
--   * puntos_por_sello() la rehace la 0060
--   * registrar_consumicion() la rehace la 0061
-- Ojo al reves: rehace puntos_por_sello() de la 0044, que ya no se puede volver
-- a pegar despues.
--
-- Que hace.
--
--   * CONSUMICIONES. Tras sellar un bar sale "Añadir consumicion": tercio,
--     jarra, vino, sidra, chupito o sin alcohol. Todo se comprueba aqui, no en
--     el movil (`registrar_consumicion`):
--       - solo en un bar que has sellado, y solo en el ULTIMO que sellaste en
--         la ruta: al sellar otro, el anterior se cierra para ti;
--       - un tiempo minimo entre registros (30 min por defecto);
--       - puntuan como mucho N por bar y M por ruta (1 y 6 por defecto): lo de
--         mas se apunta, pero no puntua;
--       - la primera vez que registras una categoria, bonus de variedad, como
--         mucho K veces por ruta (3 por defecto). "Sin alcohol" puntua igual y
--         es una categoria mas: los puntos no premian beber mas ni mas rapido.
--   * Los limites son de cada ruta (columnas nuevas de `routes`, como las de la
--     0042) para tocarlos desde el panel de admin.
--   * RACHA. Si los TRES ultimos sellos de un bar son de tres personas distintas
--     de la misma casa, esa casa gana el bonus de racha, una vez por casa y bar
--     (o cada vez, si la ruta lo permite: `racha_repetible`). Es de la casa, no
--     de una persona: el movimiento guarda quienes la hicieron (`detail`), para
--     poder anularla si alguno cambia de casa.
--
-- Errores nuevos: NOT_STAMPED, NOT_LAST_BAR, TOO_SOON, INVALID_CATEGORY.

alter table public.routes add column if not exists consumo_minutos smallint not null default 30;
alter table public.routes add column if not exists consumo_por_bar smallint not null default 1;
alter table public.routes add column if not exists consumo_por_ruta smallint not null default 6;
alter table public.routes add column if not exists variedad_max smallint not null default 3;
alter table public.routes add column if not exists racha_repetible boolean not null default false;

alter table public.routes drop constraint if exists routes_consumo_check;
alter table public.routes add constraint routes_consumo_check check (
  consumo_minutos between 0 and 240
  and consumo_por_bar between 0 and 10
  and consumo_por_ruta between 0 and 50
  and variedad_max between 0 and 6
);

-- Quien hizo una racha o un encuentro (lo que es de la casa, no de una persona).
alter table public.point_movements add column if not exists detail jsonb;

create table if not exists public.consumiciones (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references public.routes (id) on delete cascade,
  route_bar_id uuid not null references public.route_bars (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  categoria    text not null check (categoria in ('tercio', 'jarra', 'vino', 'sidra', 'chupito', 'sin_alcohol')),
  -- Si dio puntos (dentro de los limites) o solo se apunto.
  puntua       boolean not null,
  created_at   timestamptz not null default now()
);
create index if not exists consumiciones_usuario_idx on public.consumiciones (user_id, route_id, created_at desc);

alter table public.consumiciones enable row level security;
revoke all on table public.consumiciones from anon, authenticated;
grant select on table public.consumiciones to authenticated;
-- Cada uno ve las suyas (para el boton y la cuenta atras); nadie mas.
drop policy if exists consumiciones_select on public.consumiciones;
create policy consumiciones_select on public.consumiciones
  for select to authenticated using (user_id = auth.uid());

create or replace function public.registrar_consumicion(p_route_bar_id uuid, p_categoria text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_ruta    public.routes%rowtype;
  v_ruta_id uuid;
  v_ultimo  uuid;
  v_prev    timestamptz;
  v_casa    text;
  v_id      uuid;
  v_en_bar  integer;
  v_en_ruta integer;
  v_puntua  boolean;
  v_nueva   boolean;
  v_puntos  integer := 0;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if p_categoria is null or p_categoria not in ('tercio', 'jarra', 'vino', 'sidra', 'chupito', 'sin_alcohol') then
    raise exception 'INVALID_CATEGORY' using errcode = '22023';
  end if;
  select b.route_id into v_ruta_id from public.route_bars b where b.id = p_route_bar_id;
  if v_ruta_id is null or not public.is_route_participant(v_ruta_id, v_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if public.esta_suspendida(v_uid) then
    raise exception 'SUSPENDED' using errcode = '42501';
  end if;
  -- Una a la vez por persona: dos toques seguidos no se cuelan los dos.
  perform pg_advisory_xact_lock(hashtext('consumicion:' || v_uid::text));

  if not exists (select 1 from public.stamps s where s.user_id = v_uid and s.route_bar_id = p_route_bar_id) then
    raise exception 'NOT_STAMPED' using errcode = 'P0001';
  end if;
  select s.route_bar_id into v_ultimo
    from public.stamps s join public.route_bars b on b.id = s.route_bar_id
   where s.user_id = v_uid and b.route_id = v_ruta_id
   order by s.stamped_at desc limit 1;
  if v_ultimo is distinct from p_route_bar_id then
    raise exception 'NOT_LAST_BAR' using errcode = 'P0001';
  end if;

  select * into v_ruta from public.routes r where r.id = v_ruta_id;
  select max(c.created_at) into v_prev from public.consumiciones c where c.user_id = v_uid and c.route_id = v_ruta_id;
  if v_prev is not null and now() < v_prev + make_interval(mins => v_ruta.consumo_minutos) then
    raise exception 'TOO_SOON' using errcode = 'P0001';
  end if;

  select count(*) into v_en_bar from public.consumiciones c
   where c.user_id = v_uid and c.route_bar_id = p_route_bar_id and c.puntua;
  select count(*) into v_en_ruta from public.consumiciones c
   where c.user_id = v_uid and c.route_id = v_ruta_id and c.puntua;
  v_puntua := v_en_bar < v_ruta.consumo_por_bar and v_en_ruta < v_ruta.consumo_por_ruta;
  v_nueva := not exists (
    select 1 from public.consumiciones c where c.user_id = v_uid and c.route_id = v_ruta_id and c.categoria = p_categoria
  );

  insert into public.consumiciones (route_id, route_bar_id, user_id, categoria, puntua)
  values (v_ruta_id, p_route_bar_id, v_uid, p_categoria, v_puntua)
  returning id into v_id;

  v_casa := public.asignar_casa(v_uid, v_ruta_id);
  if v_puntua and public.puntos_otorgar(v_ruta_id, v_uid, v_casa, 'consumicion', 'consumicion:' || v_id) then
    v_puntos := v_puntos + (select r.points from public.point_rules r where r.action = 'consumicion');
  end if;
  if v_nueva and (
    select count(*) from public.point_movements m
     where m.route_id = v_ruta_id and m.user_id = v_uid and m.action = 'categoria_nueva' and m.annulled_at is null
  ) < v_ruta.variedad_max then
    if public.puntos_otorgar(v_ruta_id, v_uid, v_casa, 'categoria_nueva', 'categoria:' || v_uid || ':' || p_categoria) then
      v_puntos := v_puntos + (select r.points from public.point_rules r where r.action = 'categoria_nueva');
    else
      v_nueva := false;
    end if;
  else
    v_nueva := false;
  end if;

  return jsonb_build_object(
    'puntos', v_puntos,
    'casa', v_casa,
    'puntua', v_puntua,
    'categoria_nueva', v_nueva,
    'siguiente', now() + make_interval(mins => v_ruta.consumo_minutos)
  );
end;
$$;

revoke all on function public.registrar_consumicion(uuid, text) from public, anon;
grant execute on function public.registrar_consumicion(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- La racha: tres seguidos de la misma casa en el mismo bar
-- ---------------------------------------------------------------------------
create or replace function public.puntos_racha(p_route_bar_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ruta     uuid;
  v_repite   boolean;
  v_ultimos  record;
  v_casas    text[];
  v_usuarios uuid[];
  v_sellos   uuid[];
  v_ref      text;
begin
  select b.route_id, r.racha_repetible into v_ruta, v_repite
    from public.route_bars b join public.routes r on r.id = b.route_id
   where b.id = p_route_bar_id;
  select array_agg(x.house order by x.stamped_at desc),
         array_agg(x.user_id order by x.stamped_at desc),
         array_agg(x.id order by x.stamped_at desc)
    into v_casas, v_usuarios, v_sellos
    from (
      select s.id, s.user_id, s.stamped_at, h.house
        from public.stamps s
        left join public.user_houses h on h.user_id = s.user_id
       where s.route_bar_id = p_route_bar_id
       order by s.stamped_at desc, s.id desc
       limit 3
    ) x;
  if coalesce(array_length(v_casas, 1), 0) < 3 then
    return;
  end if;
  if v_casas[1] is null or v_casas[1] <> v_casas[2] or v_casas[1] <> v_casas[3] then
    return;
  end if;
  -- Tres personas distintas (un sello por persona y bar ya lo asegura la tabla).
  v_ref := case when v_repite
                then 'racha:' || p_route_bar_id || ':' || v_casas[1] || ':' || v_sellos[1]
                else 'racha:' || p_route_bar_id || ':' || v_casas[1] end;
  if public.puntos_otorgar(v_ruta, null, v_casas[1], 'racha', v_ref) then
    update public.point_movements m set detail = jsonb_build_object('usuarios', to_jsonb(v_usuarios), 'bar', p_route_bar_id)
     where m.route_id = v_ruta and m.ref = v_ref;
  end if;
end;
$$;

-- De la 0044: ademas de sello y ruta completa, mira la racha del bar.
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

  perform public.puntos_racha(v_sello.route_bar_id);
end;
$$;

revoke all on function public.puntos_racha(uuid) from public, anon, authenticated;
revoke all on function public.puntos_por_sello(uuid) from public, anon, authenticated;

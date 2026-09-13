-- Ruta de Bares — esquema inicial
-- Modelo: rutas anuales creadas por administradores, bares con horario y
-- posición, y "sellos" (seals) que un usuario obtiene automáticamente por
-- GPS: al estar a menos de 10m de un bar durante su turno horario.
-- Progreso de sellado visible para todo el grupo.

-- ---------------------------------------------------------------------------
-- profiles: un perfil por usuario de auth.users, con rol admin|user.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- Vista pública mínima: cualquier usuario autenticado puede ver el nombre
-- (no el email ni el rol) de los demás miembros del grupo, necesario para
-- mostrar "quién lleva cuántos sellos" en la compostelana compartida.
create view public.profiles_public
  with (security_invoker = false) as
select id, coalesce(display_name, split_part(email, '@', 1)) as display_name
from public.profiles;

grant select on public.profiles_public to authenticated;

-- Crea el perfil automáticamente cuando alguien se registra.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- routes: una ruta por año. Solo admins gestionan; todos ven la activa.
-- ---------------------------------------------------------------------------
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,
  name text not null,
  is_active boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.routes enable row level security;

create policy "routes_select_active_or_admin"
  on public.routes for select
  to authenticated
  using (
    is_active
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "routes_admin_write"
  on public.routes for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------------
-- bars: entre 5 y 20 bares por ruta, con horario y posición GPS. La tabla
-- es de solo-admin (para poder editar bares de rutas aún no activas); los
-- usuarios normales leen bars_public, que solo expone lo necesario para el
-- mapa y el check-in.
-- ---------------------------------------------------------------------------
create table public.bars (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  start_time time not null,
  end_time time not null,
  order_index int not null,
  created_at timestamptz not null default now(),
  unique (route_id, order_index)
);

-- Una ruta tiene entre 5 y 20 bares. El máximo se comprueba al añadir un
-- bar; el mínimo solo tiene sentido al activar la ruta (mientras se está
-- montando, tiene menos de 5 la mayor parte del tiempo).
create function public.enforce_max_bars_per_route()
returns trigger
language plpgsql
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.bars where route_id = new.route_id;
  if v_count >= 20 then
    raise exception 'Una ruta no puede tener más de 20 bares' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger bars_max_20
  before insert on public.bars
  for each row execute function public.enforce_max_bars_per_route();

alter table public.bars enable row level security;

create policy "bars_admin_only"
  on public.bars for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Al activar una ruta (is_active false -> true) debe tener ya al menos 5
-- bares. Mientras se monta (is_active sigue en false) no se exige nada.
create function public.enforce_min_bars_before_activation()
returns trigger
language plpgsql
as $$
declare
  v_count int;
begin
  if new.is_active and not old.is_active then
    select count(*) into v_count from public.bars where route_id = new.id;
    if v_count < 5 then
      raise exception 'Una ruta necesita al menos 5 bares para activarse (tiene %)', v_count
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger routes_min_5_before_activate
  before update on public.routes
  for each row execute function public.enforce_min_bars_before_activation();

-- Vista pública: cualquier usuario autenticado ve los bares de rutas activas.
-- Propiedad del owner de la tabla => evalúa sin RLS (patrón estándar de
-- Supabase para exponer una proyección de una tabla restringida).
create view public.bars_public
  with (security_invoker = false) as
select b.id, b.route_id, b.name, b.address, b.latitude, b.longitude,
       b.start_time, b.end_time, b.order_index
from public.bars b
join public.routes r on r.id = b.route_id
where r.is_active;

grant select on public.bars_public to authenticated;

-- ---------------------------------------------------------------------------
-- seals: un sello por (bar, usuario). Progreso visible para todo el grupo.
-- Nunca se inserta directamente: solo a través de check_in().
-- ---------------------------------------------------------------------------
create table public.seals (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  bar_id uuid not null references public.bars (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sealed_at timestamptz not null default now(),
  unique (bar_id, user_id)
);

alter table public.seals enable row level security;

create policy "seals_select_group"
  on public.seals for select
  to authenticated
  using (
    exists (
      select 1 from public.routes r where r.id = seals.route_id and r.is_active
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Sin policy de insert/update/delete para 'authenticated': todo pasa por
-- check_in(), que corre como el owner de la tabla (security definer).

-- ---------------------------------------------------------------------------
-- haversine_meters: distancia en metros entre dos puntos GPS. El cliente
-- (src/lib/geo.ts) usa la misma fórmula para el feedback inmediato en
-- pantalla; si tocas una, toca la otra.
-- ---------------------------------------------------------------------------
create function public.haversine_meters(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ^ 2
  ));
$$;

-- ---------------------------------------------------------------------------
-- check_in: sella un bar para el usuario autenticado si (a) el bar
-- pertenece a la ruta activa, (b) está a <=10m de la posición GPS que
-- envía el dispositivo, y (c) la hora local (Europe/Madrid) cae dentro del
-- turno del bar. Idempotente. Nunca confía en que el cliente diga "estoy
-- cerca": recalcula la distancia aquí con las coordenadas que manda.
--
-- Límite conocido: no hay forma de verificar en el servidor que las
-- coordenadas que manda el móvil son reales (un GPS falseado -mock
-- location- podría engañarlo). Igual que un QR fotografiado, es una
-- limitación aceptada para una ruta de grupo, no un sistema anti-fraude.
-- ---------------------------------------------------------------------------
create function public.check_in(p_route_id uuid, p_bar_id uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_bar public.bars%rowtype;
  v_distance double precision;
  v_local_time time;
  v_in_window boolean;
  v_already boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select b.* into v_bar
  from public.bars b
  join public.routes r on r.id = b.route_id
  where b.id = p_bar_id
    and b.route_id = p_route_id
    and r.is_active
  for update of b;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'route_or_bar_not_found');
  end if;

  v_distance := public.haversine_meters(p_lat, p_lng, v_bar.latitude, v_bar.longitude);
  if v_distance > 10 then
    return jsonb_build_object('ok', false, 'error', 'too_far', 'distance_m', v_distance);
  end if;

  v_local_time := (now() at time zone 'Europe/Madrid')::time;
  if v_bar.end_time >= v_bar.start_time then
    v_in_window := v_local_time between v_bar.start_time and v_bar.end_time;
  else
    -- El turno cruza medianoche (ej. 23:30–01:00).
    v_in_window := v_local_time >= v_bar.start_time or v_local_time <= v_bar.end_time;
  end if;

  if not v_in_window then
    return jsonb_build_object('ok', false, 'error', 'outside_schedule');
  end if;

  select exists(
    select 1 from public.seals s where s.bar_id = p_bar_id and s.user_id = auth.uid()
  ) into v_already;

  insert into public.seals (route_id, bar_id, user_id)
  values (p_route_id, p_bar_id, auth.uid())
  on conflict (bar_id, user_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'already_sealed', v_already,
    'bar_name', v_bar.name
  );
end;
$$;

grant execute on function public.check_in(uuid, uuid, double precision, double precision) to authenticated;

-- Ruta de Bares - esquema inicial.
-- Pegar entero en Supabase > SQL Editor > New query > Run.
-- Es idempotente en lo que Postgres permite: se puede re-ejecutar sin romper nada.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'user');
  end if;
end
$$;

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url   text,
  role         public.user_role not null default 'user',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- is_admin() es SECURITY DEFINER a proposito: las policies de `profiles`
-- necesitan consultar `profiles`, y sin definer eso es recursion infinita de RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Todo usuario de auth.users obtiene su fila en profiles, con rol 'user'.
-- El rol 'admin' solo se concede a mano (ver docs/SETUP.md).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un usuario no puede ascenderse a admin editando su propia fila.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'ROLE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_profile_update on public.profiles;
create trigger on_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Rutas y bares
-- ---------------------------------------------------------------------------
create table if not exists public.routes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) > 0),
  description  text not null default '',
  event_date   date,
  is_published boolean not null default false,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.route_bars (
  id         uuid primary key default gen_random_uuid(),
  route_id   uuid not null references public.routes (id) on delete cascade,
  sort_order   integer not null check (sort_order >= 0),
  name       text not null check (length(btrim(name)) > 0),
  address    text not null default '',
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  radius_m   integer not null default 120 check (radius_m between 20 and 2000),
  opens_at   timestamptz not null,
  closes_at  timestamptz not null,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  constraint route_bars_window_valid check (closes_at > opens_at)
);

-- deferrable: reordenar bares dentro de una transaccion pasa por estados
-- intermedios con posiciones duplicadas.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'route_bars_route_sort_order_key'
  ) then
    alter table public.route_bars
      add constraint route_bars_route_sort_order_key
      unique (route_id, sort_order) deferrable initially deferred;
  end if;
end
$$;

create index if not exists route_bars_route_id_idx on public.route_bars (route_id, sort_order);

-- ---------------------------------------------------------------------------
-- Sellos
-- ---------------------------------------------------------------------------
create table if not exists public.stamps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  route_bar_id uuid not null references public.route_bars (id) on delete cascade,
  stamped_at  timestamptz not null default now(),
  lat         double precision not null,
  lng         double precision not null,
  distance_m  double precision not null,
  unique (user_id, route_bar_id)
);

create index if not exists stamps_user_idx on public.stamps (user_id);

-- Haversine en metros. Radio medio terrestre 6371008.8 m (IUGG).
create or replace function public.distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
as $$
  select 2 * 6371008.8 * asin(
    least(1.0, sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2))
        * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  );
$$;

-- Unico camino para crear un sello. SECURITY DEFINER + sin policy de INSERT en
-- `stamps` = el cliente no puede inventarse sellos, ni saltarse geocerca ni horario.
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

-- ---------------------------------------------------------------------------
-- Invitaciones de un solo uso
-- ---------------------------------------------------------------------------
-- Se guarda el sha256 del token, no el token. Una fuga de la base de datos no
-- reparte cuentas.
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label      text not null default '',
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references public.profiles (id) on delete set null
);

create index if not exists invites_created_by_idx on public.invites (created_by, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.routes     enable row level security;
alter table public.route_bars enable row level security;
alter table public.stamps     enable row level security;
alter table public.invites    enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Sin policy de INSERT/DELETE en profiles: las crea el trigger, las borra
-- el cascade de auth.users.

drop policy if exists routes_select on public.routes;
create policy routes_select on public.routes
  for select to authenticated
  using (is_published or public.is_admin());

drop policy if exists routes_write on public.routes;
create policy routes_write on public.routes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists route_bars_select on public.route_bars;
create policy route_bars_select on public.route_bars
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.routes r
      where r.id = route_bars.route_id and r.is_published
    )
  );

drop policy if exists route_bars_write on public.route_bars;
create policy route_bars_write on public.route_bars
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists stamps_select on public.stamps;
create policy stamps_select on public.stamps
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists stamps_delete on public.stamps;
create policy stamps_delete on public.stamps
  for delete to authenticated
  using (public.is_admin());

-- Cinturon y tirantes: aunque alguien anada una policy de INSERT por error,
-- el rol `authenticated` no tiene el privilegio.
revoke insert, update on public.stamps from authenticated;

drop policy if exists invites_admin on public.invites;
create policy invites_admin on public.invites
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: fotos de perfil
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

-- Cada usuario solo escribe dentro de la carpeta que lleva su uuid.
drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

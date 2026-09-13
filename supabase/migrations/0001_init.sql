-- Ruta de Bares — esquema inicial
-- Modelo: rutas anuales creadas por administradores, bares con horario y
-- posición, y "sellos" (seals) que un usuario obtiene escaneando el QR
-- físico de cada bar. Progreso de sellado visible para todo el grupo.

create extension if not exists pgcrypto;

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
-- bars: bares de una ruta, con horario y posición. qr_secret NUNCA se expone
-- a clientes normales: la tabla es de solo-admin y hay una vista pública
-- (bars_public) sin esa columna, que sí puede leer cualquier usuario.
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
  qr_secret text not null default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  unique (route_id, order_index)
);

alter table public.bars enable row level security;

create policy "bars_admin_only"
  on public.bars for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Vista pública: cualquier usuario autenticado ve los bares de rutas activas,
-- sin el secreto del QR. Propiedad del owner de la tabla => evalúa sin RLS.
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
-- Nunca se inserta directamente: solo a través de redeem_stamp().
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
-- redeem_stamp(), que corre como el owner de la tabla (security definer).

-- ---------------------------------------------------------------------------
-- redeem_stamp: valida el secreto escaneado del QR y sella el bar para el
-- usuario autenticado. Idempotente (un segundo escaneo no duplica ni falla).
-- ---------------------------------------------------------------------------
create function public.redeem_stamp(p_route_id uuid, p_bar_id uuid, p_secret text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_bar public.bars%rowtype;
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

  if v_bar.qr_secret <> p_secret then
    return jsonb_build_object('ok', false, 'error', 'invalid_secret');
  end if;

  select exists(
    select 1 from public.seals s where s.bar_id = p_bar_id and s.user_id = auth.uid()
  ) into v_already;

  -- ON CONFLICT como red de seguridad además del check de arriba: el "for
  -- update of b" ya serializa dos escaneos del mismo bar, pero esto evita
  -- que cualquier otra carrera termine en un 23505 sin manejar.
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

grant execute on function public.redeem_stamp(uuid, uuid, text) to authenticated;

-- Nota: los admins leen qr_secret directamente de public.bars (permitido por
-- bars_admin_only) para pintar el QR de cada bar. No hace falta una función
-- aparte: la policy ya restringe esa columna a admins.

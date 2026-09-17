-- Ruta de Bares - las invitaciones dejan de dar cuenta y pasan a dar RUTA.
-- Pegar entero en Supabase > SQL Editor > New query > Run, despues de 0003.
-- Es idempotente: se puede re-ejecutar sin romper nada.
--
-- Que cambia respecto a 0001:
--   Antes: el alta estaba cerrada y una invitacion creaba una CUENTA. Toda
--          cuenta veia todas las rutas publicadas.
--   Ahora: el alta es abierta (Sign Up normal, hay que activarlo en Supabase
--          Auth, ver docs/SETUP.md) y una invitacion da acceso a UNA RUTA.
--          Solo ves las rutas de las que eres miembro.
--
-- OJO, esto borra datos: al final se hace DROP de la tabla `invites` de 0001.
-- Sus filas son huellas de tokens que ya no abren nada (la Edge Function que
-- los canjeaba desaparece en este mismo cambio), asi que no hay nada que
-- conservar. Si prefieres guardarlas, copia la tabla antes de pegar esto.

-- ---------------------------------------------------------------------------
-- Invitaciones a una ruta
-- ---------------------------------------------------------------------------
-- OJO, esto cambia respecto a 0001: el token se guarda EN CLARO, no su sha256.
--
-- Por que: el historial tiene que poder volver a enseñar el enlace de una
-- invitacion ya creada (para repegarlo en otro grupo), y de un hash no se
-- puede reconstruir. Decision consciente, no descuido.
--
-- Que se pierde y por que se acepta: quien lea esta tabla ve enlaces vivos.
-- Antes eso repartia CUENTAS y era inaceptable; ahora el daño maximo es
-- colarse en una ruta de bares durante unas horas y ocupando una de las plazas
-- del tope. Lo unico que protege estos tokens es la policy route_invites_admin
-- de mas abajo, asi que esa policy pasa a ser critica: si se afloja, se
-- reparten enlaces. Hay un test dedicado a que un usuario normal no lea nada
-- de aqui (tests/migration-0004.test.ts).
--
-- Lo nuevo ademas: max_uses, el mismo enlace sirve para varias personas hasta
-- agotar las plazas o caducar.
create table if not exists public.route_invites (
  id         uuid primary key default gen_random_uuid(),
  route_id   uuid not null references public.routes (id) on delete cascade,
  -- El CHECK fija la forma que valida src/features/invites/link.ts: 32 bytes
  -- en base64url. Asi no entra por aqui un token con otra pinta.
  token      text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  max_uses   integer not null check (max_uses between 1 and 500),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- Anular no borra la fila: el historial tiene que seguir contando que esa
  -- invitacion existio y quien la creo.
  revoked_at timestamptz
);

create index if not exists route_invites_route_idx
  on public.route_invites (route_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Pertenencia a una ruta
-- ---------------------------------------------------------------------------
-- La tabla que decide lo que ve cada usuario. Solo escribe redeem_route_invite().
create table if not exists public.route_members (
  route_id  uuid not null references public.routes (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  -- set null y no cascade: si se borra la invitacion, quien ya entro se queda.
  invite_id uuid references public.route_invites (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (route_id, user_id)
);

create index if not exists route_members_user_idx on public.route_members (user_id);
create index if not exists route_members_invite_idx on public.route_members (invite_id);

-- ---------------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER por el mismo motivo que is_admin() en 0001: las policies de
-- routes/route_bars consultan route_members, y sin definer eso es recursion de RLS.
create or replace function public.is_route_member(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.route_members m
    where m.route_id = p_route_id and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Crear una invitacion
-- ---------------------------------------------------------------------------
-- Sustituye a la Edge Function create-invite: menos piezas que desplegar y la
-- regla vive donde manda, en el servidor.
--
-- Los OUT se llaman distinto que las columnas a proposito: con el mismo nombre,
-- plpgsql resuelve el RETURNING contra el parametro y no contra la tabla.
create or replace function public.create_route_invite(
  p_route_id uuid,
  p_max_uses integer,
  p_expires_in_hours integer
)
returns table (invite_id uuid, invite_token text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Rango amplio a proposito: la app ofrece 2/4/8 horas, pero el servidor solo
  -- se pronuncia sobre lo que es absurdo. Cambiar el menu no exige migracion.
  if p_expires_in_hours is null or p_expires_in_hours not between 1 and 72 then
    raise exception 'BAD_EXPIRY' using errcode = '22023';
  end if;

  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    raise exception 'ROUTE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 32 bytes en base64url = 43 caracteres, el mismo formato que valida
  -- src/features/invites/link.ts. rtrim quita el '=' de relleno.
  v_token := rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

  return query
  insert into public.route_invites (route_id, token, max_uses, created_by, expires_at)
  values (
    p_route_id,
    v_token,
    p_max_uses,
    auth.uid(),
    now() + make_interval(hours => p_expires_in_hours)
  )
  returning route_invites.id, route_invites.token, route_invites.expires_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Canjear una invitacion
-- ---------------------------------------------------------------------------
-- Sustituye a la Edge Function redeem-invite. Diferencia de fondo: antes se
-- llamaba SIN sesion porque creaba la cuenta; ahora la cuenta ya existe (el
-- alta es abierta) y esto solo apunta a una persona a una ruta.
create or replace function public.redeem_route_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_inv  public.route_invites%rowtype;
  v_usos integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- FOR UPDATE serializa dos canjes simultaneos del MISMO enlace: sin el, las
  -- dos transacciones leen el mismo recuento, las dos creen que queda plaza y
  -- el tope se pasa por uno. Es el mismo cuidado que el UPDATE atomico de 0001.
  select * into v_inv
    from public.route_invites
   where token = p_token
   for update;

  if not found then
    -- No se distingue "no existe" de "anulada" de "caducada": decirlo
    -- convertiria la funcion en un oraculo para adivinar tokens.
    raise exception 'INVITE_UNUSABLE' using errcode = 'P0001';
  end if;

  -- Ya es miembro: no gasta plaza y no falla. Abrir el enlace dos veces es
  -- normal (un doble toque, el navegador precargando) y la segunda vez no
  -- puede castigar a nadie. Va ANTES de mirar caducidad a proposito: quien ya
  -- entro sigue dentro aunque el enlace haya muerto despues.
  if exists (
    select 1 from public.route_members
    where route_id = v_inv.route_id and user_id = v_uid
  ) then
    return v_inv.route_id;
  end if;

  if v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'INVITE_UNUSABLE' using errcode = 'P0001';
  end if;

  select count(*) into v_usos
    from public.route_members
   where invite_id = v_inv.id;

  if v_usos >= v_inv.max_uses then
    raise exception 'INVITE_FULL' using errcode = 'P0001';
  end if;

  insert into public.route_members (route_id, user_id, invite_id)
  values (v_inv.route_id, v_uid, v_inv.id)
  on conflict (route_id, user_id) do nothing;

  return v_inv.route_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_stamp: ademas de publicada, horario y geocerca, ahora exige membresia
-- ---------------------------------------------------------------------------
-- Se reescribe entera (no se parchea) para que quede una sola definicion viva.
-- Sin esta comprobacion, cualquiera con sesion podria sellar una ruta a la que
-- nadie le invito llamando a la RPC a mano: la pantalla no se lo ofreceria,
-- pero la pantalla nunca ha sido la autoridad.
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
-- Quien ya estaba dentro, sigue dentro
-- ---------------------------------------------------------------------------
-- Sin este backfill, al pegar esta migracion TODOS los usuarios actuales se
-- quedarian sin ver ninguna ruta hasta que alguien les invite otra vez. Quien
-- ya tiene un sello en una ruta es, evidentemente, participante de esa ruta.
insert into public.route_members (route_id, user_id)
select distinct rb.route_id, s.user_id
  from public.stamps s
  join public.route_bars rb on rb.id = s.route_bar_id
on conflict (route_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.route_invites enable row level security;
alter table public.route_members enable row level security;

-- Las invitaciones solo las toca un admin, igual que en 0001.
drop policy if exists route_invites_admin on public.route_invites;
create policy route_invites_admin on public.route_invites
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Cada uno ve sus pertenencias; el admin, todas (las necesita para contar
-- plazas gastadas en el historial).
drop policy if exists route_members_select on public.route_members;
create policy route_members_select on public.route_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Sin policy de INSERT/UPDATE/DELETE a proposito: la unica via de entrada es
-- redeem_route_invite(). Cinturon y tirantes, igual que con stamps en 0001:
-- aunque alguien anada una policy por error, el rol no tiene el privilegio.
revoke insert, update, delete on public.route_members from authenticated;

-- Lo que cambia de verdad para el usuario: ya no basta con que la ruta este
-- publicada, hay que ser miembro.
drop policy if exists routes_select on public.routes;
create policy routes_select on public.routes
  for select to authenticated
  using (public.is_admin() or (is_published and public.is_route_member(id)));

drop policy if exists route_bars_select on public.route_bars;
create policy route_bars_select on public.route_bars
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.routes r
      where r.id = route_bars.route_id
        and r.is_published
        and public.is_route_member(r.id)
    )
  );

-- Las funciones son la unica via: que no las pueda llamar quien no tiene sesion.
revoke all on function public.create_route_invite(uuid, integer, integer) from public;
revoke all on function public.redeem_route_invite(text) from public;
grant execute on function public.create_route_invite(uuid, integer, integer) to authenticated;
grant execute on function public.redeem_route_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fuera lo viejo
-- ---------------------------------------------------------------------------
-- Las invitaciones de cuenta ya no existen: el alta es abierta y nadie canjea
-- estos tokens (la Edge Function redeem-invite se borra en este mismo cambio).
drop table if exists public.invites;

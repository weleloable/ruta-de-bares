-- Ruta de Bares - 0068: pantalla de Usuarios para admins (correo, sellar a mano
-- y borrar una cuenta sin entrar en Supabase).
-- Pegar entero en SQL Editor (Supabase > SQL Editor > New query > Run), DESPUES
-- de la 0067.
-- Idempotente: se puede re-ejecutar sin romper nada (`add column if not
-- exists`, `create table if not exists`, `create or replace`).
-- Ojo al reves: rehace puntos_racha() de la 0045, que ya no se puede volver a
-- pegar despues.
--
-- Tres cosas que hasta ahora obligaban a abrir el panel de Supabase:
--
-- 1. Ver el CORREO de cada cuenta (`admin_usuarios`). El nombre visible lo
--    elige cada cual y no siempre dice quien es; el correo si. Solo admins, y
--    la politica de privacidad lo cuenta (VERSION_POLITICA 2026-10-15).
--
-- 2. Sellar a alguien FUERA DE PLAZO o sin estar alli (`admin_sellar`). Para
--    el movil sin bateria, el GPS que no engancha o el bar que cerro antes. Se
--    salta horario y radio, NO la pertenencia: la persona tiene que estar en la
--    ruta, la ruta publicada y la parada tiene que ser un bar (0060). Un admin
--    no se sella a si mismo (SELF): entraria en el sorteo y daria puntos a su
--    casa sin que nadie mas lo viera; que lo haga otro admin. El sello lleva quien lo puso
--    y por que (`stamps.sellado_por`, `sellado_motivo`), y como no hay posicion
--    de la persona se guarda la del bar con distancia 0: la politica lo dice.
--    Los puntos, retos y sorteo salen solos de los disparadores de `stamps`,
--    igual que con un sello normal. La RACHA no: premia llegar seguidos los de
--    una casa, y un sello puesto horas despues se sumaria a los ultimos sellos
--    del bar y crearia una racha que no paso. `puntos_racha` ignora ahora los
--    sellos a mano (rehecha desde el cuerpo de la 0045, solo con ese filtro).
--
-- 3. BORRAR una cuenta (`admin_borrar_cuenta`). Es para cuentas de prueba, o
--    cuando la persona lo pide y no puede hacerlo ella. NO es una sancion: para
--    eso esta suspender (0015), que deja a la persona leer por que y reclamar.
--    Hace lo mismo que `delete_my_account` (0021): borra de auth.users y cae en
--    cascada lo que cuelga de profiles; el rastro de moderacion y los vetos con
--    HMAC se quedan (0017, 0024). No se borra a un admin (TARGET_IS_ADMIN) ni a
--    una misma (SELF: para eso esta Borrar mi cuenta). Queda apuntado quien
--    borro a quien y por que (`admin_cuentas_borradas`), con el nombre visible
--    de entonces y SIN el correo: guardarlo seria conservar el dato que se acaba
--    de borrar. Las fotos de la cuenta las borra la app justo despues, con la
--    limpieza de la 0032 (`avatar_admin_sobrantes`): una cuenta que ya no
--    existe no tiene periodo de gracia.

-- ---------------------------------------------------------------------------
-- 1. Quien puso un sello a mano
-- ---------------------------------------------------------------------------
alter table public.stamps add column if not exists sellado_por uuid references public.profiles (id) on delete set null;
alter table public.stamps add column if not exists sellado_motivo text;
alter table public.stamps drop constraint if exists stamps_sellado_motivo_check;
alter table public.stamps add constraint stamps_sellado_motivo_check
  check (sellado_motivo is null or char_length(sellado_motivo) <= 300);

-- ---------------------------------------------------------------------------
-- 2. Registro de cuentas borradas por un admin
-- ---------------------------------------------------------------------------
create table if not exists public.admin_cuentas_borradas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  motivo      text not null check (char_length(motivo) between 3 and 300),
  borrada_por uuid references public.profiles (id) on delete set null,
  borrada_at  timestamptz not null default now()
);
alter table public.admin_cuentas_borradas enable row level security;
revoke all on table public.admin_cuentas_borradas from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. La lista de usuarios, con correo
-- ---------------------------------------------------------------------------
create or replace function public.admin_usuarios(p_busqueda text default null)
returns table (
  user_id        uuid,
  nombre         text,
  email          text,
  rol            text,
  house          text,
  rutas          integer,
  alta           timestamptz,
  ultima_entrada timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_busqueda, '')), '');
begin
  perform public.match_admin_require();
  return query
  select p.id, p.display_name, u.email::text, p.role::text, h.house,
         (select count(*)::integer from public.route_members rm where rm.user_id = p.id),
         p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_houses h on h.user_id = p.id
   where v_q is null
      or p.display_name ilike '%' || v_q || '%'
      or u.email ilike '%' || v_q || '%'
   order by lower(p.display_name)
   limit 300;
end;
$$;

-- Una sola cuenta, para su ficha. NOT_FOUND si ya no existe (otro admin la
-- borro): la pantalla lo dice en vez de quedarse cargando.
create or replace function public.admin_usuario(p_user_id uuid)
returns table (
  user_id        uuid,
  nombre         text,
  email          text,
  rol            text,
  house          text,
  rutas          integer,
  alta           timestamptz,
  ultima_entrada timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return query
  select p.id, p.display_name, u.email::text, p.role::text, h.house,
         (select count(*)::integer from public.route_members rm where rm.user_id = p.id),
         p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_houses h on h.user_id = p.id
   where p.id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Los bares de las rutas de una persona y cuales tiene sellados
-- ---------------------------------------------------------------------------
create or replace function public.admin_usuario_sellos(p_user_id uuid)
returns table (
  route_id       uuid,
  ruta           text,
  route_bar_id   uuid,
  bar            text,
  orden          integer,
  opens_at       timestamptz,
  closes_at      timestamptz,
  sellado_at     timestamptz,
  sellado_por    text,
  sellado_motivo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();
  return query
  select r.id, r.name, b.id, b.name, b.sort_order, b.opens_at, b.closes_at,
         s.stamped_at,
         case when s.id is null or s.sellado_por is null then null
              else coalesce((select a.display_name from public.profiles a where a.id = s.sellado_por), 'Admin borrado')
         end,
         s.sellado_motivo
    from public.route_members rm
    join public.routes r on r.id = rm.route_id
    join public.route_bars b on b.route_id = r.id and b.tipo = 'bar'
    left join public.stamps s on s.route_bar_id = b.id and s.user_id = rm.user_id
   where rm.user_id = p_user_id
   order by r.event_date desc nulls last, r.name, b.sort_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Sellar a mano
-- ---------------------------------------------------------------------------
create or replace function public.admin_sellar(p_user_id uuid, p_route_bar_id uuid, p_motivo text)
returns public.stamps
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_bar    public.route_bars%rowtype;
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_stamp  public.stamps%rowtype;
begin
  if char_length(v_motivo) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_motivo) > 300 then
    raise exception 'REASON_TOO_LONG' using errcode = '22023';
  end if;

  if p_user_id = v_admin then
    raise exception 'SELF' using errcode = 'P0001';
  end if;

  select * into v_bar from public.route_bars where id = p_route_bar_id;
  if not found then
    raise exception 'BAR_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Como claim_stamp: en una ruta sin publicar nadie juega todavia.
  if not exists (select 1 from public.routes r where r.id = v_bar.route_id and r.is_published) then
    raise exception 'ROUTE_NOT_PUBLISHED' using errcode = 'P0001';
  end if;
  if v_bar.tipo <> 'bar' then
    raise exception 'NOT_STAMPABLE' using errcode = 'P0001';
  end if;
  -- Se salta horario y radio, no la pertenencia: sellar a quien no esta en la
  -- ruta le meteria puntos y sorteo de una ruta en la que no juega.
  if not public.is_route_participant(v_bar.route_id, p_user_id) then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  -- Ya sellado (por ella o por otro admin): se devuelve el que hay, como
  -- claim_stamp. Asi dos admins a la vez no fallan ni duplican.
  select * into v_stamp from public.stamps where user_id = p_user_id and route_bar_id = p_route_bar_id;
  if found then
    return v_stamp;
  end if;

  insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m, sellado_por, sellado_motivo)
  values (p_user_id, p_route_bar_id, v_bar.lat, v_bar.lng, 0, v_admin, v_motivo)
  on conflict (user_id, route_bar_id) do nothing
  returning * into v_stamp;
  if v_stamp.id is null then
    select * into v_stamp from public.stamps where user_id = p_user_id and route_bar_id = p_route_bar_id;
  end if;
  return v_stamp;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5b. La racha no cuenta los sellos a mano
-- ---------------------------------------------------------------------------
-- Cuerpo de la 0045 (nadie lo rehizo despues) con UN cambio: el filtro
-- `s.sellado_por is null`. Los ultimos tres sellos del bar son ahora los tres
-- ultimos de VERDAD; un sello a mano ni empieza ni cierra una racha.
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
         and s.sellado_por is null
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
revoke all on function public.puntos_racha(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Borrar una cuenta
-- ---------------------------------------------------------------------------
create or replace function public.admin_borrar_cuenta(p_user_id uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_nombre text;
begin
  if char_length(v_motivo) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_motivo) > 300 then
    raise exception 'REASON_TOO_LONG' using errcode = '22023';
  end if;
  if p_user_id = v_admin then
    raise exception 'SELF' using errcode = 'P0001';
  end if;

  -- El mismo candado que delete_my_account (0021): una denuncia que entra a la
  -- vez espera a que esto termine en vez de quedarse sin persona.
  select p.display_name into v_nombre from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.is_admin_de(p_user_id) then
    raise exception 'TARGET_IS_ADMIN' using errcode = 'P0001';
  end if;
  -- routes.created_by no tiene cascade: borrarla fallaria a medias.
  if exists (select 1 from public.routes r where r.created_by = p_user_id) then
    raise exception 'OWNS_ROUTES' using errcode = 'P0001';
  end if;

  insert into public.admin_cuentas_borradas (nombre, motivo, borrada_por)
  values (v_nombre, v_motivo, v_admin);
  delete from auth.users where id = p_user_id;
end;
$$;

create or replace function public.admin_cuentas_borradas_lista()
returns table (nombre text, motivo text, por text, el timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();
  return query
  select c.nombre, c.motivo, (select p.display_name from public.profiles p where p.id = c.borrada_por), c.borrada_at
    from public.admin_cuentas_borradas c
   order by c.borrada_at desc
   limit 100;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que (todas exigen admin por dentro)
-- ---------------------------------------------------------------------------
revoke all on function
  public.admin_usuarios(text),
  public.admin_usuario(uuid),
  public.admin_usuario_sellos(uuid),
  public.admin_sellar(uuid, uuid, text),
  public.admin_borrar_cuenta(uuid, text),
  public.admin_cuentas_borradas_lista()
from public, anon;

grant execute on function
  public.admin_usuarios(text),
  public.admin_usuario(uuid),
  public.admin_usuario_sellos(uuid),
  public.admin_sellar(uuid, uuid, text),
  public.admin_borrar_cuenta(uuid, text),
  public.admin_cuentas_borradas_lista()
to authenticated;

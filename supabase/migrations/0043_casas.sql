-- Ruta de Bares - 0043: las cuatro casas (Mahou, Cruzcampo, Estrella Galicia, Alhambra).
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0042.
-- Idempotente: se puede re-ejecutar sin romper nada (`if not exists`, funciones
-- con `or replace` y el reparto de los que ya estaban solo toca a quien no
-- tiene casa).
--
-- Que hace. Cada persona pertenece a una casa, para siempre (un admin puede
-- cambiarla mas adelante, desde el panel). Es la base del sistema de puntos:
-- lo que consigue cada uno suma para su casa en la ruta.
--
-- Como se asigna (decidido asi):
--
--   * Al entrar por PRIMERA vez en una ruta (al canjear la invitacion, o
--     cualquier alta en `route_members`), no al registrarse. Se elige la casa
--     con menos gente DENTRO DE ESA RUTA; si empatan, a sorteo. Asi la primera
--     ruta de cada uno sale lo mas igualada posible.
--   * Excepciones, por encima del equilibrio: si el nombre visible empieza por
--     "Pablo" va a Cruzcampo, y si empieza por "Rodrigo", a Estrella Galicia
--     (sin distinguir mayusculas ni tildes).
--   * Quien ya estaba en alguna ruta recibe casa ahora: ruta a ruta, por orden
--     de creacion, y dentro de cada una por orden de llegada, con la misma regla.
--     Quien no esta en ninguna ruta la recibira al entrar en la primera.
--
-- La casa vive en su propia tabla y no en `profiles` a proposito: el perfil lo
-- edita cada uno (politica profiles_update), y la casa no la puede tocar nadie
-- desde la app. Todos la pueden VER (hace falta para rankings y QR): saber de
-- que casa es alguien no es un dato sensible, y es lo que se ve en la ruta.
--
-- `seen_at` es cuando vio la animacion de descubrimiento de su casa: la app la
-- ensena una vez y la marca con `casa_marcar_vista()`.

create table if not exists public.user_houses (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  house            text not null check (house in ('mahou', 'cruzcampo', 'estrella', 'alhambra')),
  assigned_at      timestamptz not null default now(),
  -- La ruta en la que se le asigno (null si la puso un admin a mano).
  assigned_route   uuid references public.routes (id) on delete set null,
  seen_at          timestamptz
);

create index if not exists user_houses_house_idx on public.user_houses (house);

alter table public.user_houses enable row level security;
revoke all on table public.user_houses from anon, authenticated;
grant select on table public.user_houses to authenticated;

drop policy if exists user_houses_select on public.user_houses;
create policy user_houses_select on public.user_houses
  for select to authenticated using (true);

-- Excepcion por nombre: casa fija para Pablo y Rodrigo. Null si no aplica.
create or replace function public.casa_por_nombre(p_nombre text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when translate(lower(coalesce(p_nombre, '')), 'áéíóúüñ', 'aeiouun') like 'pablo%' then 'cruzcampo'
    when translate(lower(coalesce(p_nombre, '')), 'áéíóúüñ', 'aeiouun') like 'rodrigo%' then 'estrella'
  end;
$$;

-- Da casa a quien no la tiene, equilibrando dentro de la ruta. Devuelve su casa.
create or replace function public.asignar_casa(p_user_id uuid, p_route_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actual text;
  v_casa   text;
begin
  select h.house into v_actual from public.user_houses h where h.user_id = p_user_id;
  if v_actual is not null then
    return v_actual;
  end if;

  select public.casa_por_nombre(p.display_name) into v_casa from public.profiles p where p.id = p_user_id;

  if v_casa is null then
    -- La casa con menos gente en esta ruta (sin contarle a el); empate a sorteo.
    select c.casa into v_casa
      from (values ('mahou'), ('cruzcampo'), ('estrella'), ('alhambra')) as c (casa)
      left join (
        select h.house, count(*) as n
          from public.route_members m
          join public.user_houses h on h.user_id = m.user_id
         where m.route_id = p_route_id and m.user_id <> p_user_id
         group by h.house
      ) cuenta on cuenta.house = c.casa
     order by coalesce(cuenta.n, 0) asc, random()
     limit 1;
  end if;

  insert into public.user_houses (user_id, house, assigned_route)
  values (p_user_id, v_casa, p_route_id)
  on conflict (user_id) do nothing;

  select h.house into v_casa from public.user_houses h where h.user_id = p_user_id;
  return v_casa;
end;
$$;

-- Al entrar en una ruta (canjear la invitacion o cualquier otra via), casa si no la tenia.
create or replace function public.casa_al_entrar_en_ruta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.asignar_casa(new.user_id, new.route_id);
  return new;
end;
$$;

drop trigger if exists route_members_casa on public.route_members;
create trigger route_members_casa
  after insert on public.route_members
  for each row execute function public.casa_al_entrar_en_ruta();

-- La app la llama al terminar la animacion de "tu casa es...".
create or replace function public.casa_marcar_vista()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  update public.user_houses h set seen_at = coalesce(h.seen_at, now()) where h.user_id = v_uid;
end;
$$;

revoke all on function public.casa_por_nombre(text) from public, anon, authenticated;
revoke all on function public.asignar_casa(uuid, uuid) from public, anon, authenticated;
revoke all on function public.casa_al_entrar_en_ruta() from public, anon, authenticated;
revoke all on function public.casa_marcar_vista() from public, anon;
grant execute on function public.casa_marcar_vista() to authenticated;

-- Los que ya estaban: ruta a ruta (por creacion) y por orden de llegada.
do $$
declare
  r record;
begin
  for r in
    select m.user_id, m.route_id
      from public.route_members m
      join public.routes ru on ru.id = m.route_id
     order by ru.created_at, m.joined_at, m.user_id
  loop
    perform public.asignar_casa(r.user_id, r.route_id);
  end loop;
end;
$$;

-- Ruta de Bares - 0074: anuncios de los admins a la gente de una ruta.
-- Pegar entero en SQL Editor (Supabase > SQL Editor > New query > Run), DESPUES
-- de la 0073 y ANTES de desplegar la app.
-- Idempotente: se puede re-ejecutar sin romper nada (`if not exists`, funciones
-- con `or replace`, el check del tipo quitado antes de ponerlo).
-- Ojo al reves: rehace avisos_encolar() y push_preferencias_leer() de la 0066,
-- que ya no se vuelven a pegar.
--
-- Que hace. Un admin manda un mensaje corto (200 caracteres) a la gente de UNA
-- ruta. Se ve arriba de la pestana Ruta (con un numerito rojo en el boton de
-- Ruta hasta que se marca "Entendido") y, si el admin lo pide, tambien llega
-- como aviso al movil por el sistema de la 0064 (`push_cola` + Edge Function).
--
--   * Duracion a elegir al enviar: 5, 15 o 60 minutos. Pasado ese tiempo el
--     anuncio deja de verse (se mira la hora del SERVIDOR al leer; no hay cron
--     que lo limpie).
--   * Destinatarios a elegir: toda la ruta o solo los admins.
--   * Solo lectura para la gente: no hay respuesta, ni reaccion, ni nada.
--   * Solo manda un admin (`anuncio_enviar` lo exige aqui, en el servidor; que
--     el boton este escondido en la app es comodidad). Tope de 6 por hora y
--     por admin en cada ruta: un dedo torcido o una cuenta de admin robada no
--     puede llenar el movil de toda la ruta de avisos.
--   * Un admin puede RETIRAR un anuncio (deja de verse al momento). Lo que ya
--     llego al movil como notificacion no se puede recoger: la confirmacion de
--     la app lo dice antes de enviar.
--   * El aviso al movil es un tipo nuevo (`anuncio`) que cada persona puede
--     silenciar (`push_preferencias.anuncios`, activado por defecto). Lleva el
--     texto del anuncio, que es contenido de la organizacion para todos, no
--     datos de nadie: la politica ya dice que las notificaciones pasan por el
--     servicio de avisos del navegador.
--
-- La tabla no tiene privilegios para la app: todo pasa por funciones
-- SECURITY DEFINER, como las `match_*` y los minijuegos. Los anuncios cuelgan
-- de la ruta (`on delete cascade`): borrar la ruta se los lleva. El autor se
-- guarda como clave (`author_id`, a null si borra su cuenta); su nombre solo se
-- ensena a los admins, nunca a la gente.

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------
create table if not exists public.anuncios (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references public.routes (id) on delete cascade,
  author_id    uuid references public.profiles (id) on delete set null,
  texto        text not null check (char_length(texto) between 1 and 200),
  duracion_min smallint not null check (duracion_min in (5, 15, 60)),
  solo_admins  boolean not null default false,
  avisar_movil boolean not null default false,
  created_at   timestamptz not null default now(),
  expira_at    timestamptz not null,
  retirado_at  timestamptz,
  retirado_por uuid references public.profiles (id) on delete set null,
  check (expira_at = created_at + make_interval(mins => duracion_min))
);
create index if not exists anuncios_ruta_idx on public.anuncios (route_id, created_at desc);

alter table public.anuncios enable row level security;
revoke all on table public.anuncios from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. El tipo de aviso nuevo y la preferencia de silenciarlo
-- ---------------------------------------------------------------------------
alter table public.push_cola drop constraint if exists push_cola_tipo_check;
alter table public.push_cola
  add constraint push_cola_tipo_check check (tipo in ('parada', 'ultimo_bar', 'sorteo', 'cana', 'admin', 'anuncio'));

alter table public.push_preferencias add column if not exists anuncios boolean not null default true;

-- Mismo cuerpo que la 0066, con una linea mas (`anuncio`).
create or replace function public.avisos_encolar(p_user uuid, p_tipo text, p_clave text, p_titulo text, p_cuerpo text, p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quiere boolean;
begin
  if not exists (select 1 from public.push_suscripciones s where s.user_id = p_user) then
    return;
  end if;
  select case p_tipo
           when 'parada' then p.paradas
           when 'ultimo_bar' then p.sorteo
           when 'sorteo' then p.sorteo
           when 'cana' then p.cana
           when 'admin' then p.admin
           when 'anuncio' then p.anuncios
         end
    into v_quiere
    from public.push_preferencias p where p.user_id = p_user;
  if v_quiere is false then
    return;
  end if;
  insert into public.push_cola (user_id, tipo, clave, titulo, cuerpo, url)
  values (p_user, p_tipo, p_clave, left(p_titulo, 120), left(p_cuerpo, 300), p_url)
  on conflict (clave) do nothing;
  if found then
    perform public.avisos_despertar();
  end if;
end;
$$;

-- Mismo cuerpo que la 0066, mas `anuncios` para todo el mundo.
create or replace function public.push_preferencias_leer()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  v_prefs := jsonb_build_object(
    'paradas', coalesce((select p.paradas from public.push_preferencias p where p.user_id = v_uid), true),
    'sorteo', coalesce((select p.sorteo from public.push_preferencias p where p.user_id = v_uid), true),
    'cana', coalesce((select p.cana from public.push_preferencias p where p.user_id = v_uid), true),
    'anuncios', coalesce((select p.anuncios from public.push_preferencias p where p.user_id = v_uid), true),
    'dispositivos', (select count(*) from public.push_suscripciones s where s.user_id = v_uid)
  );
  if public.is_admin() then
    v_prefs := v_prefs || jsonb_build_object(
      'admin', coalesce((select p.admin from public.push_preferencias p where p.user_id = v_uid), true)
    );
  end if;
  return v_prefs;
end;
$$;

-- Aparte, como la de `admin` (0066): la `push_preferencias_guardar` de siempre no
-- cambia, y la app en cache la sigue llamando con tres argumentos.
create or replace function public.push_preferencias_anuncios_guardar(p_anuncios boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  insert into public.push_preferencias (user_id, anuncios)
  values (auth.uid(), coalesce(p_anuncios, true))
  on conflict (user_id) do update set anuncios = excluded.anuncios, updated_at = now();
end;
$$;

revoke all on function public.push_preferencias_anuncios_guardar(boolean) from public, anon;
grant execute on function public.push_preferencias_anuncios_guardar(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Enviar (solo admins)
-- ---------------------------------------------------------------------------
-- Errores que la app traduce: NOT_AUTHENTICATED, FORBIDDEN (no es admin),
-- ROUTE_NOT_FOUND, TEXT_INVALID (vacio o > 200), DURATION_INVALID (no es 5, 15
-- ni 60), RATE_LIMIT (mas de 6 en la ultima hora).
create or replace function public.anuncio_enviar(
  p_route uuid, p_texto text, p_duracion integer, p_solo_admins boolean, p_avisar_movil boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  -- Un anuncio es una frase: espacios y saltos de linea de mas, fuera.
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'));
  v_id uuid;
  v_ruta text;
  v_solo boolean := coalesce(p_solo_admins, false);
  -- clock_timestamp y no now(): now() es la hora de la TRANSACCION, y dos anuncios
  -- mandados en la misma (un script, una prueba) empatarian y no tendrian orden.
  v_ahora timestamptz := clock_timestamp();
  r record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select ru.name into v_ruta from public.routes ru where ru.id = p_route;
  if v_ruta is null then
    raise exception 'ROUTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if char_length(v_texto) not between 1 and 200 then
    raise exception 'TEXT_INVALID' using errcode = '22023';
  end if;
  if p_duracion is null or p_duracion not in (5, 15, 60) then
    raise exception 'DURATION_INVALID' using errcode = '22023';
  end if;
  -- El tope se cuenta por admin y por ruta, incluidos los que retiro: retirar
  -- no devuelve el cupo (si no, se esquivaria enviando y retirando).
  if (select count(*) from public.anuncios a
       where a.route_id = p_route and a.author_id = v_uid and a.created_at > v_ahora - interval '1 hour') >= 6 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.anuncios (route_id, author_id, texto, duracion_min, solo_admins, avisar_movil, created_at, expira_at)
  values (p_route, v_uid, v_texto, p_duracion, v_solo, coalesce(p_avisar_movil, false), v_ahora,
          v_ahora + make_interval(mins => p_duracion))
  returning id into v_id;

  -- El aviso al movil: a la gente de la ruta (o solo a sus admins), menos a quien
  -- lo manda. Cada persona tiene su clave, asi un reintento no duplica.
  if coalesce(p_avisar_movil, false) then
    for r in
      select u.id from (
        select rm.user_id as id from public.route_members rm where rm.route_id = p_route and not v_solo
        union
        select p.id from public.profiles p where p.role = 'admin'
      ) u
      where u.id <> v_uid
    loop
      perform public.avisos_encolar(r.id, 'anuncio', 'anuncio:' || v_id || ':' || r.id,
        '📣 ' || v_ruta, v_texto, '/ruta');
    end loop;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Leer lo vigente (cualquiera de la ruta) y el historial (admins)
-- ---------------------------------------------------------------------------
-- Devuelve CUANTO hace y CUANTO queda, en segundos, medidos con el reloj del
-- servidor: el del movil puede ir adelantado o atrasado y un anuncio de 5
-- minutos se veria 10 o 0. La app apunta la hora a la que recibe la respuesta
-- y cuenta desde ahi.
-- statement_timestamp() y no now(): now() es la hora de la TRANSACCION y `anuncio_enviar`
-- apunta clock_timestamp(); leer en la misma transaccion daria mas tiempo del que hay.
create or replace function public.anuncios_vigentes(p_route uuid)
returns table (id uuid, texto text, solo_admins boolean, duracion_min integer, hace_s integer, restan_s integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  -- Quien no esta en la ruta no ve nada (ni siquiera que existe).
  if not (public.is_admin() or public.is_route_participant(p_route, auth.uid())) then
    return;
  end if;
  return query
    select a.id, a.texto, a.solo_admins, a.duracion_min::integer,
           greatest(0, extract(epoch from statement_timestamp() - a.created_at))::integer,
           greatest(0, ceil(extract(epoch from a.expira_at - statement_timestamp())))::integer
      from public.anuncios a
     where a.route_id = p_route
       and a.retirado_at is null
       and a.expira_at > statement_timestamp()
       and (not a.solo_admins or public.is_admin())
     order by a.created_at desc
     limit 5;
end;
$$;

-- Lo enviado a esta ruta (vigente, caducado o retirado) para que un admin vea y
-- retire. Con el nombre del autor: eso solo lo ven los admins.
create or replace function public.anuncios_enviados(p_route uuid)
returns table (id uuid, texto text, solo_admins boolean, avisar_movil boolean, duracion_min integer,
               autor text, hace_s integer, restan_s integer, estado text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select a.id, a.texto, a.solo_admins, a.avisar_movil, a.duracion_min::integer,
           coalesce(p.display_name, 'Alguien que ya no esta'),
           greatest(0, extract(epoch from statement_timestamp() - a.created_at))::integer,
           greatest(0, ceil(extract(epoch from a.expira_at - statement_timestamp())))::integer,
           case when a.retirado_at is not null then 'retirado'
                when a.expira_at <= statement_timestamp() then 'caducado'
                else 'vigente' end
      from public.anuncios a
      left join public.profiles p on p.id = a.author_id
     where a.route_id = p_route
     order by a.created_at desc
     limit 20;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Retirar (solo admins)
-- ---------------------------------------------------------------------------
create or replace function public.anuncio_retirar(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.anuncios a
     set retirado_at = now(), retirado_por = auth.uid()
   where a.id = p_id and a.retirado_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permisos
-- ---------------------------------------------------------------------------
revoke all on function public.anuncio_enviar(uuid, text, integer, boolean, boolean) from public, anon;
revoke all on function public.anuncios_vigentes(uuid) from public, anon;
revoke all on function public.anuncios_enviados(uuid) from public, anon;
revoke all on function public.anuncio_retirar(uuid) from public, anon;
grant execute on function public.anuncio_enviar(uuid, text, integer, boolean, boolean) to authenticated;
grant execute on function public.anuncios_vigentes(uuid) to authenticated;
grant execute on function public.anuncios_enviados(uuid) to authenticated;
grant execute on function public.anuncio_retirar(uuid) to authenticated;

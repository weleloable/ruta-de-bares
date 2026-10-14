-- Ruta de Bares - 0066: avisos en el movil a quien administra cuando hay algo por moderar.
-- Pegar entero en SQL Editor (Supabase > SQL Editor > New query > Run), DESPUES
-- de la 0065.
-- Idempotente: se puede re-ejecutar sin romper nada (`if not exists`, funciones
-- con `or replace`, disparadores quitados antes de ponerlos).
-- Ojo al reves: rehace avisos_encolar() y push_preferencias_leer() de la 0064,
-- que ya no se vuelve a pegar.
--
-- Que hace. A los ADMINS (solo a ellos) les llega un aviso al movil, por el
-- mismo sistema que la 0064 (cola `push_cola` + Edge Function `enviar-avisos`),
-- cuando entra algo nuevo que espera una decision:
--
--   * una DENUNCIA nueva de La Cana (`match_reports`),
--   * una FOTO DE PERFIL por aprobar (`avatar_requests` pendiente; la de un admin
--     se aprueba sola y no avisa),
--   * un MENSAJE o RECLAMACION a la organizacion (`user_messages`).
--
-- Cada aviso dice cuantas cosas hay por revisar en total (las mismas que
-- cuentan el punto rojo y la bandeja: ver `admin_pendientes_total`). Nunca
-- lleva nombres ni el texto de lo denunciado o escrito: el aviso sale por un
-- servicio de notificaciones de terceros y basta con "hay algo", que la
-- persona ve con sesion. Abre `/admin/alertas`. No avisa a quien lo provoca (un
-- admin que denuncia, o escribe a la organizacion, no se avisa a si mismo).
--
-- Cada admin elige si los quiere (`push_preferencias.admin`, activado por
-- defecto, solo se cambia desde `push_preferencias_admin_guardar`, que exige
-- ser admin). Tampoco llega a quien no tiene avisos activados en ningun
-- dispositivo. Una persona que deja de ser admin deja de recibirlos al
-- momento: se mira el rol al encolar, no al suscribirse.
--
-- Lo que NO hace, a proposito: recordar lo que lleva dias sin mirar, y avisar
-- de que una ruta terminada hay que borrarla (eso es un banner, no una decision).

-- ---------------------------------------------------------------------------
-- 1. El tipo nuevo y la preferencia
-- ---------------------------------------------------------------------------
alter table public.push_cola drop constraint if exists push_cola_tipo_check;
alter table public.push_cola
  add constraint push_cola_tipo_check check (tipo in ('parada', 'ultimo_bar', 'sorteo', 'cana', 'admin'));

alter table public.push_preferencias add column if not exists admin boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Lo de la 0064 que ahora conoce el tipo `admin` (mismo cuerpo, una linea mas)
-- ---------------------------------------------------------------------------
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

-- Igual que la de la 0064, mas `admin` para quien lo es (para el resto no sale:
-- la app solo lo ensena a admins y asi no se sabe quien lo es por esta via).
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

-- Nueva y aparte: la `push_preferencias_guardar` de la 0064 no cambia (la app en
-- cache la sigue llamando con tres argumentos) y no toca `admin`.
create or replace function public.push_preferencias_admin_guardar(p_admin boolean)
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
  insert into public.push_preferencias (user_id, admin)
  values (auth.uid(), coalesce(p_admin, true))
  on conflict (user_id) do update set admin = excluded.admin, updated_at = now();
end;
$$;

revoke all on function public.push_preferencias_admin_guardar(boolean) from public, anon;
grant execute on function public.push_preferencias_admin_guardar(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cuantas cosas hay por revisar y el aviso a todos los admins
-- ---------------------------------------------------------------------------
-- Lo mismo que cuentan `match_admin_alert_count`, `avatar_admin_count` y
-- `admin_message_count` (el punto rojo de la app), sumado.
create or replace function public.admin_pendientes_total()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.match_reports r where r.status <> 'resuelta')::integer
       + (select count(*) from public.avatar_requests a where a.status = 'pendiente')::integer
       + (select count(*) from public.user_messages m where m.status <> 'resuelta')::integer;
$$;

-- `p_clave` identifica el hecho (la denuncia, la foto, el mensaje); a cada admin
-- se le pone su propia clave para que ninguno la repita ni se la pise otro.
-- `p_excepto`: quien lo provoca, que no se avisa a si mismo.
create or replace function public.avisos_a_admins(p_clave text, p_titulo text, p_que text, p_excepto uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_total integer := public.admin_pendientes_total();
  r record;
begin
  for r in select p.id from public.profiles p where p.role = 'admin' and p.id is distinct from p_excepto loop
    perform public.avisos_encolar(
      r.id, 'admin', 'admin:' || p_clave || ':' || r.id,
      p_titulo,
      p_que || case when v_total > 1 then ' Hay ' || v_total || ' cosas por revisar.' else '' end,
      '/admin/alertas');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Los tres disparadores
-- ---------------------------------------------------------------------------
create or replace function public.avisos_tras_denuncia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.avisos_a_admins('denuncia:' || new.id, '🚩 Denuncia nueva', 'Hay una denuncia de La Caña por revisar.', new.reporter_id);
  return null;
end;
$$;
drop trigger if exists avisos_tras_denuncia on public.match_reports;
create trigger avisos_tras_denuncia after insert on public.match_reports
  for each row execute function public.avisos_tras_denuncia();

create or replace function public.avisos_tras_foto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.avisos_a_admins('foto:' || new.id, '📷 Foto de perfil por aprobar', 'Hay una foto de perfil esperando tu decisión.', new.user_id);
  return null;
end;
$$;
drop trigger if exists avisos_tras_foto on public.avatar_requests;
-- Solo las pendientes: la de un admin se aprueba sola (`avatar_request_submit`).
create trigger avisos_tras_foto after insert on public.avatar_requests
  for each row when (new.status = 'pendiente') execute function public.avisos_tras_foto();

create or replace function public.avisos_tras_mensaje_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.avisos_a_admins(
    'mensaje:' || new.id,
    case new.kind when 'reclamacion' then '⚖️ Reclamación nueva' else '✉️ Mensaje nuevo' end,
    case new.kind when 'reclamacion' then 'Alguien reclama una decisión.' else 'Alguien ha escrito a la organización.' end,
    new.user_id);
  return null;
end;
$$;
drop trigger if exists avisos_tras_mensaje_admin on public.user_messages;
create trigger avisos_tras_mensaje_admin after insert on public.user_messages
  for each row execute function public.avisos_tras_mensaje_admin();

-- ---------------------------------------------------------------------------
-- 5. Permisos: lo interno no lo llama nadie desde la API
-- ---------------------------------------------------------------------------
revoke all on function public.avisos_encolar(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_pendientes_total() from public, anon, authenticated;
revoke all on function public.avisos_a_admins(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.avisos_tras_denuncia() from public, anon, authenticated;
revoke all on function public.avisos_tras_foto() from public, anon, authenticated;
revoke all on function public.avisos_tras_mensaje_admin() from public, anon, authenticated;

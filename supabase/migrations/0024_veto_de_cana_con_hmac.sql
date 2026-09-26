-- Ruta de Bares - 0024: el veto de cana aguanta solo, y deja borrar la cuenta.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0023.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Sus sentencias no dan error al repetirse, pero definen funciones que una
-- migracion POSTERIOR rehizo: volver a pegarla las devuelve a esta version,
-- en silencio y sin avisar. Ya paso una vez (re-ejecutar la 0006 dejo a
-- match_require_target sin la comprobacion de bloqueos, o sea que la gente
-- bloqueada volvia a poder interactuar). Aqui quedan obsoletas:
--   * match_admin_deactivate() la rehace la 0027
--   * delete_my_account_blockers() la rehace la 0032
--
-- Por que existe. La 0021 eligio `CANA_BLOCKED` como impedimento para borrar la
-- cuenta, y el razonamiento era correcto: el veto de cana vive en
-- `match_profiles.blocked_at`, esa tabla cae en cascada desde `profiles`, asi
-- que borrarse la cuenta y volver con el mismo correo lo esquivaba.
--
-- Pero el precio era demasiado alto. Comprobado en navegador: quien tiene la
-- cana desactivada pulsaba "Borrar Cuenta" y leia "habla con la organizacion",
-- sin plazo ninguno y siendo el escalon MAS BAJO de la sancion (la escalera es
-- retirar foto -> desactivar cana -> expulsar de la ruta -> suspender). El
-- art. 17 del RGPD no admite "nunca" como respuesta, y menos por eso.
--
-- La casa ya tenia la solucion buena y aqui no se estaba usando: el veto de
-- ruta (0015) y la suspension (0017) guardan un HMAC del correo, sobreviven al
-- borrado y no bloquean la supresion de nada. Esta migracion hace lo mismo con
-- la cana y QUITA `CANA_BLOCKED` de los impedimentos.
--
-- Lo que NO cambia: `match_profiles.blocked_at` sigue siendo el estado vivo que
-- leen las pantallas. La tabla nueva es solo lo que hace falta para que el veto
-- no se evapore con la cuenta. Las dos se ponen y se quitan a la vez.
--
-- Sobre el HMAC, por si hay que explicarlo: NO identifica a nadie ni sirve para
-- buscar a una persona. Solo permite reconocer "este correo ya estuvo vetado"
-- sin guardar el correo, y es HMAC con clave secreta (no un sha256 pelado)
-- porque el espacio de correos es pequeno y un hash a secas se revierte por
-- fuerza bruta. Frena la evasion perezosa -borrarse y volver esa misma noche
-- con el mismo correo- y nada mas: quien use otro correo entra igual, porque el
-- alta es abierta. Es el dato minimo para el objetivo minimo, no se cede a
-- nadie, y MUERE al levantar el veto.

-- ---------------------------------------------------------------------------
-- Donde vive el veto cuando ya no hay cuenta
-- ---------------------------------------------------------------------------
-- Calcada de route_bans (0015): `user_id` sin clave ajena a proposito, para que
-- la fila siga ahi cuando la cuenta se borre (0017) y un admin pueda levantar
-- el veto desde Moderacion aunque no quede a quien apuntar.
create table if not exists public.cana_bans (
  user_id    uuid primary key,
  email_hmac text,
  reason     text not null check (length(btrim(reason)) between 1 and 500),
  banned_by  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cana_bans_hmac_idx on public.cana_bans (email_hmac);

-- Como las match_*: sin privilegios para la app, todo por SECURITY DEFINER.
alter table public.cana_bans enable row level security;
revoke all on public.cana_bans from public, anon, authenticated;

-- Los vetos que ya estan puestos, para que no se pierdan al aplicar esto.
insert into public.cana_bans (user_id, email_hmac, reason, banned_by, created_at)
select mp.user_id,
       public.hmac_correo(public.correo_de(mp.user_id)),
       coalesce(nullif(btrim(mp.blocked_reason), ''), '(motivo no registrado)'),
       mp.blocked_by,
       mp.blocked_at
  from public.match_profiles mp
 where mp.blocked_at is not null
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- La pregunta
-- ---------------------------------------------------------------------------
-- Calcada de esta_vetada_de_ruta: primero por persona, y si no, por correo.
create or replace function public.esta_vetada_de_cana(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hmac text;
begin
  if exists (select 1 from public.cana_bans b where b.user_id = p_user_id) then
    return true;
  end if;
  v_hmac := public.hmac_correo(public.correo_de(p_user_id));
  if v_hmac is null then
    return false;
  end if;
  return exists (select 1 from public.cana_bans b where b.email_hmac = v_hmac);
end;
$$;

revoke all on function public.esta_vetada_de_cana(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Poner el veto: ademas de la fila viva, la que sobrevive
-- ---------------------------------------------------------------------------
-- Cuerpo copiado del de la 0015 tal y como esta en la base, con el insert
-- anadido y nada mas. (La 0019 existe porque una vez se reescribio una funcion
-- de memoria y se llamo a otra que no existia.)
create or replace function public.match_admin_deactivate(
  p_user_id uuid, p_reason text, p_report_id uuid default null, p_note text default ''
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_motivo text := public.exigir_motivo(p_reason);
begin
  insert into public.match_profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  update public.match_profiles mp
     set is_active = false,
         blocked_at = now(),
         blocked_by = v_admin,
         blocked_reason = v_motivo,
         updated_at = now()
   where mp.user_id = p_user_id;

  -- Lo unico que anade la 0024: el veto que sobrevive al borrado de la cuenta.
  insert into public.cana_bans (user_id, email_hmac, reason, banned_by)
  values (p_user_id, public.hmac_correo(public.correo_de(p_user_id)), v_motivo, v_admin)
  on conflict (user_id) do update
     set email_hmac = excluded.email_hmac,
         reason     = excluded.reason,
         banned_by  = excluded.banned_by,
         created_at = now();

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'cana_desactivada', btrim(coalesce(p_note, '')));

  perform public.crear_aviso(p_user_id, 'cana_desactivada', null, v_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Quitarlo: las dos a la vez, y el HMAC muere aqui
-- ---------------------------------------------------------------------------
-- Cuerpo de la 0015 con dos cambios: se borra tambien la fila de cana_bans, y
-- levantar vale aunque NO quede fila viva (una cuenta nueva con el mismo correo
-- no tiene match_profiles bloqueado, solo el HMAC). Sin eso, un veto heredado
-- por correo no habria forma de retirarlo, y el art. 20 del DSA da seis meses
-- para reclamar: un veto que nadie puede deshacer deja ese derecho en nada.
create or replace function public.match_admin_lift_cana(p_user_id uuid, p_note text default '')
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin    uuid := public.match_admin_require();
  v_filas    integer;
  v_borradas integer;
  v_hmac     text := public.hmac_correo(public.correo_de(p_user_id));
begin
  update public.match_profiles mp
     set blocked_at = null, blocked_by = null, blocked_reason = '', updated_at = now()
   where mp.user_id = p_user_id and mp.blocked_at is not null;
  get diagnostics v_filas = row_count;

  -- Por persona y tambien por correo: si la cuenta se borro y volvio, el veto
  -- que le esta aplicando es el del HMAC y es el que hay que quitar.
  delete from public.cana_bans b
   where b.user_id = p_user_id
      or (v_hmac is not null and b.email_hmac = v_hmac);
  get diagnostics v_borradas = row_count;

  -- Cualquiera de las dos vale: una cuenta nueva con el mismo correo no tiene
  -- fila viva que limpiar, solo el HMAC.
  if v_filas = 0 and v_borradas = 0 then
    return false;
  end if;

  insert into public.match_moderation_log (admin_id, target_id, action, note)
  values (v_admin, p_user_id, 'veto_retirado', btrim(coalesce(p_note, '')));
  -- La cana NO se reactiva sola: volver a la cana es decision suya.
  perform public.crear_aviso(p_user_id, 'cana_reactivada', null, btrim(coalesce(p_note, '')));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien pregunta por el veto
-- ---------------------------------------------------------------------------
-- match_activate: cuerpo tal cual esta en la base, cambiando SOLO la linea del
-- veto para que pregunte tambien por el correo.
create or replace function public.match_activate(
  p_adult_confirmed boolean default false,
  p_bio text default null,
  p_tag_ids text[] default null,
  p_consent_version text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_perfil  public.match_profiles%rowtype;
  v_version text := btrim(coalesce(p_consent_version, ''));
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if public.esta_suspendida(v_uid) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = 'P0001';
  end if;

  insert into public.match_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_perfil from public.match_profiles mp where mp.user_id = v_uid for update;

  -- El veto va ANTES que nada, para no hacerle rellenar la frase y las
  -- etiquetas a quien va a recibir un no al final. Desde la 0024 se pregunta
  -- por las dos vias: la fila viva y el HMAC del correo.
  if v_perfil.blocked_at is not null or public.esta_vetada_de_cana(v_uid) then
    raise exception 'CANA_BLOCKED' using errcode = 'P0001';
  end if;

  if v_perfil.adult_confirmed_at is null and not coalesce(p_adult_confirmed, false) then
    raise exception 'ADULT_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;
  if v_perfil.consent_at is null then
    if v_version = '' then
      raise exception 'CONSENT_REQUIRED' using errcode = 'P0001';
    end if;
    if char_length(v_version) > 40 then
      raise exception 'CONSENT_VERSION_INVALID' using errcode = '22023';
    end if;
  end if;
  if v_perfil.first_activated_at is null or p_bio is not null then
    perform public.match_save_bio_and_tags(v_uid, p_bio, p_tag_ids);
  end if;

  update public.match_profiles mp
     set is_active = true,
         adult_confirmed_at = coalesce(mp.adult_confirmed_at, now()),
         first_activated_at = coalesce(mp.first_activated_at, now()),
         -- Se guarda el primero que se dio; volver a activar no lo pisa.
         consent_version = coalesce(mp.consent_version, nullif(v_version, '')),
         consent_at = coalesce(mp.consent_at, case when v_version <> '' then now() end),
         updated_at = now()
   where mp.user_id = v_uid;
end;
$$;

-- my_restrictions: lo mismo. Sin esto, quien vuelve con el mismo correo entra,
-- ve "Participante" en Mi perfil y no entiende por que la cana le dice que no.
create or replace function public.my_restrictions()
returns table (
  suspended boolean,
  suspended_reason text,
  suspended_at timestamptz,
  cana_blocked boolean,
  cana_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_hmac text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  v_hmac := public.hmac_correo(public.correo_de(v_uid));
  return query
  select
    public.esta_suspendida(v_uid),
    coalesce((select s.reason from public.account_suspensions s
               where s.user_id = v_uid and s.lifted_at is null), ''),
    (select s.created_at from public.account_suspensions s
      where s.user_id = v_uid and s.lifted_at is null),
    public.esta_vetada_de_cana(v_uid),
    coalesce((select b.reason from public.cana_bans b
               where b.user_id = v_uid
                  or (v_hmac is not null and b.email_hmac = v_hmac)
               limit 1), '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Ya no impide borrarse la cuenta
-- ---------------------------------------------------------------------------
-- Cuerpo de la 0021 sin la rama CANA_BLOCKED. Los otros tres impedimentos se
-- quedan: ADMIN_CANNOT_DELETE y OWNS_ROUTES por la clave ajena de
-- `routes.created_by`, y HAS_OPEN_REPORTS porque una denuncia sin resolver no
-- deja a quien organiza a nadie a quien vetar (art. 17.3.e RGPD).
create or replace function public.delete_my_account_blockers()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_res text[] := '{}';
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if public.is_admin_de(v_uid) then
    v_res := array_append(v_res, 'ADMIN_CANNOT_DELETE'::text);
  end if;
  if exists (select 1 from public.routes r where r.created_by = v_uid) then
    v_res := array_append(v_res, 'OWNS_ROUTES'::text);
  end if;
  if exists (select 1 from public.match_reports r
              where r.reported_id = v_uid and r.status <> 'resuelta') then
    v_res := array_append(v_res, 'HAS_OPEN_REPORTS'::text);
  end if;
  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Y en Moderacion se lee de donde no se borra
-- ---------------------------------------------------------------------------
-- Cuerpo de la 0018 cambiando SOLO la rama 'cana': de match_profiles (que cae
-- con la cuenta) a cana_bans (que no). Asi un veto heredado por correo tambien
-- sale en la lista y se puede levantar.
create or replace function public.match_admin_moderaciones()
returns table (
  tipo text,
  user_id uuid,
  user_name text,
  route_id uuid,
  route_name text,
  motivo text,
  accion text,
  cuando timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.match_admin_require();
  return query
  -- Cuentas suspendidas ahora mismo.
  select 'cuenta'::text, s.user_id, coalesce(p.display_name, '(cuenta borrada)'),
         null::uuid, ''::text, s.reason, ''::text, s.created_at
    from public.account_suspensions s
    left join public.profiles p on p.id = s.user_id
   where s.lifted_at is null

  union all
  -- Vetos de ruta vigentes.
  select 'ruta'::text, b.user_id, coalesce(p.display_name, '(cuenta borrada)'),
         b.route_id, r.name, b.reason, ''::text, b.created_at
    from public.route_bans b
    join public.routes r on r.id = b.route_id
    left join public.profiles p on p.id = b.user_id

  union all
  -- Canas vetadas ahora mismo.
  select 'cana'::text, b.user_id, coalesce(p.display_name, '(cuenta borrada)'),
         null::uuid, ''::text, b.reason, ''::text, b.created_at
    from public.cana_bans b
    left join public.profiles p on p.id = b.user_id

  union all
  -- Y lo que se hizo en su dia. Se dejan fuera los apuntes que hablan de la
  -- DENUNCIA y no de la persona (ponerla en revision, resolverla, la purga):
  -- aqui lo que se busca es "a quien se le ha tocado algo".
  select 'accion'::text, l.target_id, coalesce(nullif(l.target_name, ''), '(cuenta borrada)'),
         null::uuid, ''::text, l.note, l.action, l.created_at
    from public.match_moderation_log l
   where l.action in ('foto_retirada', 'cana_desactivada', 'expulsada_de_ruta',
                      'cuenta_suspendida', 'veto_retirado')
   -- Por numero de columna y no por nombre: en un UNION el ORDER BY solo
   -- entiende las columnas de salida, y `cuando` ahi es el parametro OUT.
   order by 8 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Y muere con la purga, como el de ruta
-- ---------------------------------------------------------------------------
-- El HMAC se justifica diciendo que dura lo que dura el motivo por el que
-- existe. match_admin_purge_route ya borra los de route_bans; aqui se le anade
-- el de la cana de quien ya no esta en ninguna ruta.
-- (Se hace en la 0025, con el resto de la conservacion, para no meter dos temas
-- en una migracion. Anotado aqui para que no se pierda.)

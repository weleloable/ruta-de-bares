-- Ruta de Bares - 0020: la foto de perfil nueva pasa por revision de un admin.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0019.
-- Idempotente: se puede re-ejecutar sin romper nada.
--
-- Como era: la app subia el fichero al bucket publico `avatars` y escribia
-- profiles.avatar_url ella misma (la policy profiles_update deja a cada persona
-- editar su fila). Ningun servidor ni admin intervenia, y como la regla estaba
-- solo en el movil, cualquiera con un cliente modificado se la saltaba.
--
-- Como es ahora:
--   1. La app sube el fichero (nombre nuevo, aleatorio) y llama a
--      avatar_request_submit(). Eso crea una solicitud PENDIENTE; la foto
--      anterior sigue puesta hasta que alguien decida.
--   2. Un admin la ve en "Alertas de administracion" y llama a
--      avatar_admin_decide(): aprobar pone la foto en el perfil, rechazar guarda
--      el motivo, que la persona ve en Mi perfil.
--   3. Un admin que cambia su propia foto se auto-aprueba (queda registrado).
--   4. Las fotos que ya estan puestas NO se tocan: no hay solicitud para ellas.
--
-- Decisiones y por que:
--
--   * Nadie escribe avatar_url a mano salvo el backend. guard_profile_avatar()
--     lo impide. Se decide con `current_user` y no con `current_setting('role')`
--     (que es lo que usa guard_profile_role, 0002) porque aqui la pregunta es la
--     contraria: "este UPDATE lo hace una funcion SECURITY DEFINER mia o lo hace
--     directamente la API?". Dentro de una funcion SECURITY DEFINER `current_user`
--     es su duenio (postgres); en una peticion directa de la API es
--     `authenticated`. El trigger NO es security definer, a proposito, o veria
--     siempre al duenio. Es una lista blanca (postgres, supabase_admin,
--     service_role) y no una lista negra (authenticated, anon): si algun dia
--     aparece un rol nuevo, queda bloqueado en vez de colarse.
--     Quitar la foto (poner NULL) sigue permitido: no es contenido nuevo.
--
--   * Una foto aprobada no se puede cambiar por debajo. El bucket es publico y
--     la 0001 deja a cada persona ACTUALIZAR y BORRAR sus ficheros, y la app
--     subia con upsert. Sin esto, se aprueba una foto y luego se sobrescribe el
--     mismo fichero con otra cosa. Por eso: (a) se quita avatars_update_own y
--     (b) avatars_write_own rechaza un nombre que ya este "en uso", lo que tapa
--     tambien el "borrar y volver a subir con el mismo nombre". Borrar sigue
--     permitido (solo dejaria sin foto a quien lo hace).
--     "En uso" son DOS cosas, y las dos hacen falta:
--       - los nombres que tienen una solicitud (pendiente, aprobada o rechazada);
--       - los nombres a los que apunta la foto que la persona YA tiene puesta
--         (avatar_url / avatar_thumb_url). Las fotos anteriores a esta migracion
--         no tienen solicitud a proposito (no se tocan), y sin esta segunda
--         condicion se podian reemplazar por debajo: borrar el fichero y
--         subirlo de nuevo con el mismo nombre dejaba el perfil apuntando a la
--         misma URL con un contenido que nadie habia aprobado.
--
--   * El bucket ya no se puede LISTAR: avatars_read (0001) era `to public`, y la
--     API de Storage aplica esa policy al listar, asi que cualquiera con la clave
--     publicable (que va dentro de la app) veia los nombres de las fotos
--     pendientes de todo el mundo, y el sufijo aleatorio no protegia nada. Ahora
--     solo se lee la carpeta propia. Ver una foto por su URL publica sigue
--     funcionando sin policy (es lo que hace un bucket publico), asi que las
--     fotos de perfil se siguen viendo igual. COMPROBAR tras aplicar (punto 8 de
--     la lista de verificacion de docs/SETUP.md).
--
--   * RIESGO CONOCIDO, SIN CERRAR, y que no se puede probar fuera de un Supabase
--     real: Storage deja firmar una URL de subida (createSignedUploadUrl, con
--     upsert) y, segun el codigo de storage-api, el permiso de INSERT solo se
--     comprueba al FIRMAR, no al subir con el token (que dura unas 2 horas). Si
--     es asi, quien firme un nombre ANTES de enviar su foto podria, ya aprobada
--     y dentro de esas 2 horas, sobrescribirla sin que nadie lo apruebe. Hace
--     falta ser miembro de una ruta, conocer la API y querer hacerlo. Lo unico
--     que lo cierra de verdad es que lo que ve el resto no sea un fichero que la
--     persona pueda escribir: un bucket privado para lo que sube y copiarlo al
--     publico al aprobar con un nombre elegido por el servidor, y eso exige una
--     Edge Function, que este proyecto quito a proposito. Antes de decidir si
--     merece esa pieza, comprobar en un Supabase real si el hueco existe.
--
--   * Las rutas las manda la persona, las URL no. La URL publica depende del
--     proyecto y desde SQL no se conoce; aceptarla de un usuario dejaria poner
--     https://otro-sitio/storage/v1/object/public/avatars/<uid>/x.jpg, cuyo
--     contenido cambia cuando quiere. Asi que la solicitud guarda solo rutas
--     (validadas: carpeta propia, nombre plano, el fichero existe) y es el admin,
--     de confianza, quien pasa las URL al aprobar. Aun asi se comprueba que
--     tengan la forma <host>/storage/v1/object/public/avatars/<ruta>, sin query
--     ni fragmento, para que un admin con un cliente roto no apunte la foto a
--     otro sitio por error. El HOST no se puede comprobar desde SQL: ese ultimo
--     tramo es confianza en el admin.
--
--   * La MINIATURA no la puede verificar el servidor: es un fichero aparte que
--     sube la persona, y desde SQL no se sabe si es una version reducida de la
--     foto grande. Es lo que ven los demas en la grilla y en las listas, asi que
--     la unica proteccion es que el admin la vea antes de aprobar: la pantalla
--     de decidir ensena las DOS (app/admin/foto/[requestId].tsx).
--
--   * Anti-abuso en el envio, solo para quien no es admin: hay que ser miembro de
--     alguna ruta y como mucho 5 envios al dia. El alta es abierta, y sin esto
--     N cuentas vacias metian N solicitudes en la bandeja. Un admin no tiene
--     limite: se auto-aprueba y no genera trabajo para nadie.
--
--   * La bandeja saca primero las pendientes, las mas antiguas antes. El alta es
--     abierta, y con el orden "lo mas nuevo primero" y un tope de 200 filas,
--     alguien con muchas cuentas enterraba las solicitudes viejas: el contador
--     decia 206 y la lista ensenaba 200 sin la que importaba. Asi lo mas
--     urgente (lo que mas lleva esperando) nunca queda fuera.
--
--   * El fichero pendiente ya es legible por URL (bucket publico) aunque no este
--     aprobado. Los nombres llevan un sufijo aleatorio para que no se puedan
--     adivinar. Es un limite conocido: hacerlo privado exigiria mover ficheros
--     entre buckets, que desde SQL no se puede.
--
--   * Los ficheros de solicitudes sustituidas o rechazadas se quedan en el
--     bucket. No se limpian aqui.
--
-- Codigos de error (la app los traduce en src/features/profile/fotoRevision.ts y
-- src/features/admin/api.ts):
--   NOT_AUTHENTICATED, PROFILE_MISSING, NOT_A_MEMBER, TOO_MANY_REQUESTS,
--   INVALID_PATH, FILE_MISSING, PATH_ALREADY_USED, INVALID_URL, NOT_ADMIN,
--   REQUEST_NOT_FOUND, REQUEST_NOT_PENDING, REASON_REQUIRED, REASON_TOO_LONG,
--   AVATAR_NEEDS_REVIEW

-- ---------------------------------------------------------------------------
-- Las solicitudes
-- ---------------------------------------------------------------------------
create table if not exists public.avatar_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- Rutas dentro del bucket `avatars`, de la forma <uid>/<nombre>. Unicas: cada
  -- fichero solo puede pertenecer a una solicitud.
  foto_path   text not null unique,
  thumb_path  text not null unique,
  status      text not null default 'pendiente'
              check (status in ('pendiente', 'aprobada', 'rechazada', 'sustituida')),
  -- El motivo del rechazo. Es lo que ve la persona.
  reason      text,
  created_at  timestamptz not null default now(),
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  check (foto_path <> thumb_path)
);

-- Una sola pendiente por persona: subir otra foto sustituye a la anterior.
create unique index if not exists avatar_requests_una_pendiente
  on public.avatar_requests (user_id) where status = 'pendiente';
create index if not exists avatar_requests_por_persona
  on public.avatar_requests (user_id, created_at desc);
create index if not exists avatar_requests_bandeja
  on public.avatar_requests (created_at) where status = 'pendiente';

alter table public.avatar_requests enable row level security;

-- Cada persona ve las suyas (para enterarse de "en revision" o del motivo del
-- rechazo). Los admins leen por avatar_admin_requests(). Sin policy de escritura
-- y con los privilegios retirados: solo se escribe por las funciones de abajo.
drop policy if exists avatar_requests_select_own on public.avatar_requests;
create policy avatar_requests_select_own on public.avatar_requests
  for select to authenticated
  using (user_id = auth.uid());

-- Se retira TODO y se devuelve solo el select: Supabase da por defecto "all"
-- (incluido TRUNCATE, que la RLS no filtra) a anon y authenticated.
--
-- El select es por COLUMNAS y deja fuera decided_by: quien envia la foto no
-- necesita saber que admin la decidio (el uuid de un admin no es para ella). Las
-- rutas si se dejan: la policy de escritura de storage.objects (mas abajo) las
-- consulta con los permisos de quien sube, y sin ellas fallaria.
revoke all on public.avatar_requests from anon, authenticated;
grant select (id, user_id, foto_path, thumb_path, status, reason, created_at, decided_at)
  on public.avatar_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Nadie cambia su foto a mano
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_avatar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Backend: funciones SECURITY DEFINER (duenio postgres), el SQL Editor y la
  -- service_role. Ver el razonamiento en la cabecera.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  -- Poner un valor NUEVO no vacio es lo que pasa por revision. Dejar la foto
  -- como estaba, o quitarla, no.
  if (new.avatar_url is not null and new.avatar_url is distinct from old.avatar_url)
     or (new.avatar_thumb_url is not null and new.avatar_thumb_url is distinct from old.avatar_thumb_url) then
    raise exception 'AVATAR_NEEDS_REVIEW' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_avatar() from public, anon, authenticated;

drop trigger if exists on_profile_avatar_guard on public.profiles;
create trigger on_profile_avatar_guard
  before update on public.profiles
  for each row execute function public.guard_profile_avatar();

-- ---------------------------------------------------------------------------
-- Storage: una foto enviada no se puede sobrescribir
-- ---------------------------------------------------------------------------
drop policy if exists avatars_update_own on storage.objects;

drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    -- Solo nombres con el MISMO formato que exige avatar_request_submit (una
    -- carpeta, sin "//", "./", espacios ni caracteres raros). Sin esto se podia
    -- subir "<uid>/x.jpg " o "<uid>//x.jpg" junto a "<uid>/x.jpg" aprobado; en
    -- S3 son claves distintas, pero con un backend que normalice (o distinga
    -- mayusculas) serian el mismo fichero.
    and objects.name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$')
    -- Un nombre que ya tiene solicitud (pendiente, aprobada o rechazada) no se
    -- vuelve a escribir. La subconsulta ve solo las solicitudes de quien sube
    -- por la RLS de avatar_requests, y eso basta: el nombre empieza por su uid,
    -- asi que solo puede chocar con las suyas. Se compara en minusculas: "X.JPG"
    -- no puede colarse junto a "x.jpg".
    and not exists (
      select 1 from public.avatar_requests r
       where lower(r.foto_path) = lower(objects.name) or lower(r.thumb_path) = lower(objects.name)
    )
    -- Ni el de la foto que ya tiene puesta (la de antes de esta migracion no
    -- tiene solicitud). Se busca el nombre DENTRO de la URL con strpos() y no
    -- con LIKE (porque '_' es un comodin de LIKE y aparece en los nombres) ni
    -- comparando solo el final (porque una URL con "?v=1" detras se escaparia).
    -- Si bloquea de mas, no pasa nada: la app pone un nombre nuevo cada vez. La
    -- subconsulta lee la propia fila de profiles, que profiles_select permite.
    and not exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and (
           strpos(lower(p.avatar_url), lower('/avatars/' || objects.name)) > 0
           or strpos(lower(p.avatar_thumb_url), lower('/avatars/' || objects.name)) > 0
         )
    )
  );

-- Solo se lista/lee la carpeta propia. La URL publica de una foto no pasa por
-- aqui (un bucket publico se sirve sin policy), asi que las fotos se siguen
-- viendo; lo que se cierra es enumerar el bucket con la clave publicable.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Comprobaciones compartidas (internas: no se llaman desde la API)
-- ---------------------------------------------------------------------------
-- Una URL solo vale si es <http(s)://host>/storage/v1/object/public/avatars/<ruta>
-- EXACTA: sin query, sin fragmento y con la ruta de ese fichero al final. Con
-- solo "termina en /avatars/<ruta>" colaban https://otro.test/x?a=/avatars/<ruta>
-- y https://otro.test/avatars/<ruta>. El host no se puede comprobar desde SQL.
-- Se compara con right()/left() y no con LIKE porque '_' es un comodin de LIKE
-- y aparece en las rutas.
create or replace function public.avatar_url_coincide(p_url text, p_path text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_url is not null
     and p_path is not null
     and right(p_url, length(p_path)) = p_path
     and left(p_url, length(p_url) - length(p_path)) ~ '^https?://[^/?#@]+/storage/v1/object/public/avatars/$';
$$;

revoke all on function public.avatar_url_coincide(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pedir el cambio de foto
-- ---------------------------------------------------------------------------
-- Devuelve 'pendiente' (la habitual) o 'aprobada' (quien es admin se auto-aprueba
-- y por eso SI tiene que pasar las URL). Para una persona normal p_foto_url y
-- p_thumb_url se ignoran por completo.
create or replace function public.avatar_request_submit(
  p_foto_path  text,
  p_thumb_path text,
  p_foto_url   text default null,
  p_thumb_url  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_ruta  text;
  v_admin boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- Bloquear la fila de la persona: dos envios a la vez (doble toque, dos
  -- pestanas) se hacen en fila, y no chocan con el indice de "una pendiente".
  -- FOR NO KEY UPDATE y no FOR UPDATE: decided_by tiene una FK a profiles, y
  -- escribirla toma FOR KEY SHARE sobre la fila del admin. Un FOR UPDATE choca
  -- con eso y dos admins que decidan la solicitud del otro a la vez se esperan
  -- mutuamente (deadlock); FOR NO KEY UPDATE sigue serializando esto y no choca.
  perform 1 from public.profiles p where p.id = v_uid for no key update;
  if not found then
    raise exception 'PROFILE_MISSING' using errcode = 'P0001';
  end if;

  v_admin := public.is_admin();

  -- Anti-abuso, solo para quien no es admin. El alta de cuentas es abierta y
  -- cada solicitud es trabajo manual de un admin:
  --   * hay que estar en alguna ruta (una cuenta sin invitacion no ve nada en la
  --     app, asi que su foto no la ve nadie: no hay motivo para revisarla);
  --   * como mucho 5 envios al dia, cuenten como cuenten (se sustituyan o no).
  if not v_admin then
    if not exists (select 1 from public.route_members m where m.user_id = v_uid) then
      raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
    end if;
    if (select count(*) from public.avatar_requests r
         where r.user_id = v_uid and r.created_at > now() - interval '1 day') >= 5 then
      raise exception 'TOO_MANY_REQUESTS' using errcode = 'P0001';
    end if;
  end if;

  -- <uid>/<nombre plano>. El uid es hex y guiones, asi que va tal cual en la
  -- expresion regular. Sin "..", sin subcarpetas, sin caracteres raros, y el
  -- nombre empieza por letra o numero (asi no valen "." ni "-").
  v_ruta := '^' || v_uid::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$';
  if p_foto_path is null or p_thumb_path is null
     or p_foto_path !~ v_ruta or p_thumb_path !~ v_ruta
     or position('..' in p_foto_path) > 0 or position('..' in p_thumb_path) > 0
     or p_foto_path = p_thumb_path then
    raise exception 'INVALID_PATH' using errcode = 'P0001';
  end if;

  -- El fichero tiene que estar ya subido: si no, se pediria aprobar una foto
  -- que no existe (o una que llegara despues, sin que nadie la haya mirado).
  if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p_foto_path)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p_thumb_path) then
    raise exception 'FILE_MISSING' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.avatar_requests r
     where r.foto_path in (p_foto_path, p_thumb_path) or r.thumb_path in (p_foto_path, p_thumb_path)
  ) then
    raise exception 'PATH_ALREADY_USED' using errcode = 'P0001';
  end if;

  if v_admin then
    if not public.avatar_url_coincide(p_foto_url, p_foto_path)
       or not public.avatar_url_coincide(p_thumb_url, p_thumb_path) then
      raise exception 'INVALID_URL' using errcode = 'P0001';
    end if;
  end if;

  -- Lo que hubiera pendiente deja de valer.
  update public.avatar_requests r
     set status = 'sustituida'
   where r.user_id = v_uid and r.status = 'pendiente';

  if v_admin then
    insert into public.avatar_requests (user_id, foto_path, thumb_path, status, decided_by, decided_at)
    values (v_uid, p_foto_path, p_thumb_path, 'aprobada', v_uid, now());

    update public.profiles p
       set avatar_url = p_foto_url, avatar_thumb_url = p_thumb_url, updated_at = now()
     where p.id = v_uid;
    return 'aprobada';
  end if;

  insert into public.avatar_requests (user_id, foto_path, thumb_path)
  values (v_uid, p_foto_path, p_thumb_path);
  return 'pendiente';
end;
$$;

-- ---------------------------------------------------------------------------
-- Lo que ve el admin
-- ---------------------------------------------------------------------------
-- Las sustituidas no salen nunca: son ruido, la persona ya subio otra.
create or replace function public.avatar_admin_requests(p_solo_pendientes boolean default true)
returns table (
  id                       uuid,
  created_at               timestamptz,
  status                   text,
  reason                   text,
  user_id                  uuid,
  user_name                text,
  foto_path                text,
  thumb_path               text,
  current_avatar_url       text,
  current_avatar_thumb_url text,
  decided_by               uuid,
  decided_by_name          text,
  decided_at               timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();
  return query
    select r.id, r.created_at, r.status, r.reason, r.user_id, p.display_name,
           r.foto_path, r.thumb_path, p.avatar_url, p.avatar_thumb_url,
           r.decided_by, d.display_name, r.decided_at
      from public.avatar_requests r
      join public.profiles p on p.id = r.user_id
      left join public.profiles d on d.id = r.decided_by
     where r.status <> 'sustituida'
       and (not p_solo_pendientes or r.status = 'pendiente')
     -- Pendientes primero y de mas vieja a mas nueva; luego lo cerrado, lo mas
     -- reciente antes. El tope de 200 corta por el final, asi que nunca deja
     -- fuera lo que lleva mas tiempo esperando.
     order by (r.status <> 'pendiente'),
              case when r.status = 'pendiente' then r.created_at end asc,
              r.created_at desc
     limit 200;
end;
$$;

-- Para la burbujita: un numero, no filas.
create or replace function public.avatar_admin_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  perform public.match_admin_require();
  select count(*)::integer into v_total
    from public.avatar_requests r
   where r.status = 'pendiente';
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Decidir
-- ---------------------------------------------------------------------------
-- Aprobar exige las URL (ver la cabecera); rechazar exige el motivo, que es lo
-- que se le ensena a la persona. La fila se bloquea: dos admins con la misma
-- solicitud abierta no la deciden dos veces, el segundo recibe
-- REQUEST_NOT_PENDING.
create or replace function public.avatar_admin_decide(
  p_request_id uuid,
  p_approve    boolean,
  p_reason     text default '',
  p_foto_url   text default null,
  p_thumb_url  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_sol     public.avatar_requests%rowtype;
  v_usuario uuid;
  v_motivo  text := btrim(coalesce(p_reason, ''));
begin
  -- Mismo orden de bloqueos que avatar_request_submit: primero la fila de la
  -- persona y luego la solicitud. Al reves (la solicitud y despues la persona)
  -- un envio y una decision a la vez sobre la misma persona se esperaban
  -- mutuamente y Postgres abortaba una con un deadlock (40P01).
  select r.user_id into v_usuario from public.avatar_requests r where r.id = p_request_id;
  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- FOR NO KEY UPDATE por lo mismo que en el envio: decided_by es una FK a
  -- profiles y con FOR UPDATE dos admins cruzados se bloqueaban (40P01).
  perform 1 from public.profiles p where p.id = v_usuario for no key update;

  select * into v_sol from public.avatar_requests r where r.id = p_request_id for update;
  if not found then
    -- Se borro entre las dos lecturas (la persona borro su cuenta).
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_sol.status <> 'pendiente' then
    raise exception 'REQUEST_NOT_PENDING' using errcode = 'P0001';
  end if;

  if p_approve then
    if not public.avatar_url_coincide(p_foto_url, v_sol.foto_path)
       or not public.avatar_url_coincide(p_thumb_url, v_sol.thumb_path) then
      raise exception 'INVALID_URL' using errcode = 'P0001';
    end if;

    -- La persona puede haber borrado un fichero DESPUES de enviarlo (borrar sigue
    -- permitido): aprobar entonces dejaria el perfil apuntando a una imagen que
    -- no existe.
    if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v_sol.foto_path)
       or not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v_sol.thumb_path) then
      raise exception 'FILE_MISSING' using errcode = 'P0001';
    end if;

    update public.profiles p
       set avatar_url = p_foto_url, avatar_thumb_url = p_thumb_url, updated_at = now()
     where p.id = v_sol.user_id;

    update public.avatar_requests r
       set status = 'aprobada', decided_by = v_admin, decided_at = now()
     where r.id = v_sol.id;
  else
    -- btrim solo quita el espacio ASCII: un motivo hecho de NBSP o de espacios de
    -- ancho cero pasaba como "escrito" y la persona leia "no se aprobo: .".
    if regexp_replace(v_motivo, '[[:space:] ​-‍⁠﻿]', '', 'g') = '' then
      raise exception 'REASON_REQUIRED' using errcode = 'P0001';
    end if;
    if length(v_motivo) > 500 then
      raise exception 'REASON_TOO_LONG' using errcode = 'P0001';
    end if;

    update public.avatar_requests r
       set status = 'rechazada', reason = v_motivo, decided_by = v_admin, decided_at = now()
     where r.id = v_sol.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que
-- ---------------------------------------------------------------------------
-- Las de admin comprueban `is_admin()` dentro (match_admin_require), asi que
-- que las vea `authenticated` no da nada: NOT_ADMIN para quien no lo es.
revoke all on function
  public.avatar_request_submit(text, text, text, text),
  public.avatar_admin_requests(boolean),
  public.avatar_admin_count(),
  public.avatar_admin_decide(uuid, boolean, text, text, text)
from public, anon;

grant execute on function
  public.avatar_request_submit(text, text, text, text),
  public.avatar_admin_requests(boolean),
  public.avatar_admin_count(),
  public.avatar_admin_decide(uuid, boolean, text, text, text)
to authenticated;

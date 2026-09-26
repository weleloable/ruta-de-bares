-- Ruta de Bares - 0032: las fotos que ya no hacen falta se borran; la foto de
-- una denuncia se guarda hasta que un admin decide, y borrarse la cuenta ya no
-- se bloquea por tener una denuncia abierta.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0031.
-- Idempotente: se puede re-ejecutar sin romper nada (nadie rehace despues
-- ninguna de sus funciones, y todo lo que crea lleva "if not exists" o se
-- reemplaza).
--
-- Por que existe. Tres problemas encadenados:
--
--   1. Las fotos sustituidas y rechazadas se quedaban en el bucket para siempre
--      (limite conocido de la 0020). Son datos personales que ya no sirven para
--      nada: la minimizacion del RGPD pide borrarlas.
--
--   2. Pero algunas SI sirven: la foto que se denuncio es la prueba del caso
--      (la 0028 congela su direccion, no el fichero), y la que se retiro como
--      sancion hace falta si la persona reclama (seis meses, art. 20 DSA). Y hoy
--      cualquiera podia borrar esa prueba: `avatars_delete_own` (0001) deja
--      borrar CUALQUIER fichero de tu carpeta llamando a la API de Storage, sin
--      pasar por la app. La persona denunciada destruia la prueba con dos lineas.
--
--   3. Para que borrarse la cuenta no esquivase una denuncia abierta, la 0021
--      lo bloqueaba (`HAS_OPEN_REPORTS`). El RGPD deja conservar la prueba
--      (art. 17.3.e), no retener a la persona: si nadie resolvia la denuncia, se
--      quedaba atrapada.
--
-- Lo que hace, que es lo que hacen las redes grandes a su escala: separar lo
-- que es de la persona de lo que es prueba.
--
--   * La prueba es una FOTO PROTEGIDA: la que sale en una denuncia (congelada o
--     retirada) y que ningun admin ha dado por liberada. Nadie puede borrarla,
--     ni su duena ni un admin, hasta que un admin la libera con el boton de la
--     denuncia ("Eliminar foto de la base de datos") o se borra la ruta (que se
--     lleva la denuncia). Protegerla donde esta, y no copiarla a una carpeta de
--     moderacion, es a proposito: la copia la tendria que hacer la app de quien
--     denuncia, y esa persona podria colar otra imagen como "prueba".
--   * Todo lo demas que no se usa SOBRA y se borra al momento: la app lo pide
--     (`mis_fotos_sobrantes`, `avatar_admin_sobrantes`) justo despues de cada
--     cosa que puede dejar una foto sin uso (enviar otra, aprobar, rechazar,
--     liberar una prueba, borrar una ruta) y borra lo que le devuelven. Desde
--     SQL no se puede borrar un fichero de Storage; lo que decide QUE sobra si
--     vive aqui.
--   * Borrarse la cuenta ya no se bloquea por una denuncia abierta. La denuncia
--     guarda un HMAC del correo de la persona denunciada (como los vetos de la
--     0015) y, si se registra otra vez con el mismo correo, la denuncia vuelve a
--     apuntar a la cuenta nueva: se puede sancionar igual. El HMAC se borra al
--     resolverla, y muere con la ruta.
--
-- Rehace dos funciones, partiendo de su cuerpo (regla de la 0019):
-- `match_admin_remove_photo` (0015) y `delete_my_account_blockers` (0024).

-- ---------------------------------------------------------------------------
-- Lo que se guarda
-- ---------------------------------------------------------------------------
alter table public.match_reports add column if not exists retired_avatar_url text;
alter table public.match_reports add column if not exists reported_email_hmac text;

comment on column public.match_reports.retired_avatar_url is
  'La foto que se le RETIRO desde esta denuncia. Puede no ser la congelada al '
  'denunciar (se la cambio entre medias); tambien es prueba.';
comment on column public.match_reports.reported_email_hmac is
  'HMAC del correo de la persona denunciada mientras la denuncia esta abierta: '
  'si se borra la cuenta y vuelve con el mismo correo, la denuncia la recupera.';

-- Las fotos de denuncias que un admin ya dio por no necesarias. Una fila por
-- FICHERO y no por denuncia: la misma foto puede salir en varias denuncias, y
-- liberarla es decidir sobre la imagen, no sobre un caso.
create table if not exists public.match_fotos_liberadas (
  path         text primary key,
  released_at  timestamptz not null default now(),
  released_by  uuid references public.profiles (id) on delete set null
);
alter table public.match_fotos_liberadas enable row level security;
revoke all on table public.match_fotos_liberadas from anon, authenticated;

-- ---------------------------------------------------------------------------
-- De una URL guardada a la ruta del fichero
-- ---------------------------------------------------------------------------
-- `profiles.avatar_url` y lo congelado en las denuncias guardan
-- <host>/storage/v1/object/public/avatars/<ruta> (0020, 0023). La ruta es lo
-- que se compara con `storage.objects.name`.
create or replace function public.ruta_de_avatar_url(p_url text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(substring(p_url from '/storage/v1/object/public/avatars/(.+)$'), '');
$$;

-- ---------------------------------------------------------------------------
-- Que es prueba
-- ---------------------------------------------------------------------------
-- Security definer porque la usan las policies de Storage y quien borra no
-- puede leer match_reports. Hay que concederla a `authenticated`: el USING de
-- una policy corre como quien consulta (la leccion de la 0023).
create or replace function public.avatar_protegida(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_name is not null
     and not exists (select 1 from public.match_fotos_liberadas l where l.path = p_name)
     and exists (
       select 1 from public.match_reports r
        where public.ruta_de_avatar_url(r.reported_avatar_url) = p_name
           or public.ruta_de_avatar_url(r.retired_avatar_url) = p_name
     );
$$;

revoke all on function public.avatar_protegida(text) from public, anon;
grant execute on function public.avatar_protegida(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Quien puede borrar un fichero
-- ---------------------------------------------------------------------------
-- La de la 0001 con una condicion mas: la prueba no se borra. Ni desde la app
-- ni llamando a la API a mano, que es lo que la policy cierra de verdad.
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.avatar_protegida(name)
  );

-- Nueva: un admin borra lo que sobra de cualquiera (rechazadas, sustituidas,
-- pruebas ya liberadas). Tampoco una prueba sin liberar: obliga a pasar por el
-- boton de la denuncia, que es donde consta quien decidio y cuando.
drop policy if exists avatars_delete_admin on storage.objects;
create policy avatars_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_admin()
    and not public.avatar_protegida(name)
  );

-- ---------------------------------------------------------------------------
-- Que sobra
-- ---------------------------------------------------------------------------
-- Un fichero sobra si no es la foto ni la miniatura que alguien tiene puesta,
-- no es de una solicitud pendiente y no es prueba. Una excepcion: lo recien
-- subido por una cuenta que existe y que aun no ha llegado a solicitud (la app
-- sube primero y pide despues) tiene diez minutos de gracia, o una limpieza
-- lanzada desde otro movil a la vez borraria la foto que se esta enviando.
-- Interna: la llaman las dos de abajo, que deciden de quien.
create or replace function public.avatar_ficheros_sobrantes(p_uid uuid)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'avatars'
     and (p_uid is null or (storage.foldername(o.name))[1] = p_uid::text)
     and not exists (
       select 1 from public.profiles p
        where public.ruta_de_avatar_url(p.avatar_url) = o.name
           or public.ruta_de_avatar_url(p.avatar_thumb_url) = o.name
     )
     and not exists (
       select 1 from public.avatar_requests r
        where r.status = 'pendiente' and o.name in (r.foto_path, r.thumb_path)
     )
     and not (
       coalesce(o.created_at, now()) > now() - interval '10 minutes'
       and not exists (
         select 1 from public.avatar_requests r where o.name in (r.foto_path, r.thumb_path)
       )
       -- La gracia es para quien esta subiendo, asi que hace falta que exista.
       -- Sin esto, la foto de una cuenta recien borrada (sus solicitudes se van
       -- con ella) parecia "subida a medias" y se saltaba la limpieza.
       and exists (select 1 from public.profiles p where p.id::text = (storage.foldername(o.name))[1])
       -- Y lo que un admin libero se borra ya, sea de cuando sea.
       and not exists (select 1 from public.match_fotos_liberadas l where l.path = o.name)
     )
     and not public.avatar_protegida(o.name)
   order by o.name
   limit 500;
$$;

revoke all on function public.avatar_ficheros_sobrantes(uuid) from public, anon, authenticated;

-- Lo que sobra en TU carpeta: la app lo borra despues de enviar una foto nueva.
create or replace function public.mis_fotos_sobrantes()
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return query select * from public.avatar_ficheros_sobrantes(auth.uid());
end;
$$;

-- Lo que sobra en todo el bucket: la app de un admin lo borra despues de
-- aprobar, rechazar, liberar una prueba o borrar una ruta. Mirar todo el bucket
-- y no solo a una persona recoge tambien lo que se quedo de antes de esta
-- migracion y lo que una limpieza anterior no llego a borrar (sin red).
create or replace function public.avatar_admin_sobrantes()
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();
  return query select * from public.avatar_ficheros_sobrantes(null);
end;
$$;

-- Tus ficheros que son prueba: Borrar Cuenta los deja donde estan (no puede
-- borrarlos) y no por eso tiene que fallar.
create or replace function public.mis_fotos_retenidas()
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return query
    select o.name from storage.objects o
     where o.bucket_id = 'avatars'
       and (storage.foldername(o.name))[1] = auth.uid()::text
       and public.avatar_protegida(o.name)
     order by o.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- La foto de una denuncia, en la ficha
-- ---------------------------------------------------------------------------
-- Una fila por foto de la denuncia (la congelada y, si fue otra, la retirada).
-- `otras_abiertas` es lo que avisa antes de liberarla: denuncias SIN RESOLVER,
-- aparte de esta, que tambien la tienen como prueba.
create or replace function public.match_admin_fotos_denuncia(p_report_id uuid)
returns table (foto_url text, en_uso boolean, liberada_el timestamptz, otras_abiertas integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.match_admin_require();
  if not exists (select 1 from public.match_reports r where r.id = p_report_id) then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0001';
  end if;
  return query
    with fotos as (
      select distinct u.url, public.ruta_de_avatar_url(u.url) as path
        from public.match_reports r
        cross join lateral (values (r.reported_avatar_url), (r.retired_avatar_url)) as u (url)
       where r.id = p_report_id and public.ruta_de_avatar_url(u.url) is not null
    )
    select f.url,
           exists (
             select 1 from public.profiles p
              where public.ruta_de_avatar_url(p.avatar_url) = f.path
                 or public.ruta_de_avatar_url(p.avatar_thumb_url) = f.path
           ),
           (select l.released_at from public.match_fotos_liberadas l where l.path = f.path),
           (select count(*)::integer from public.match_reports o
             where o.id <> p_report_id and o.status <> 'resuelta'
               and (public.ruta_de_avatar_url(o.reported_avatar_url) = f.path
                    or public.ruta_de_avatar_url(o.retired_avatar_url) = f.path))
      from fotos f
     order by f.url;
end;
$$;

-- Liberar una prueba: a partir de aqui el fichero sobra y la app del admin lo
-- borra. No se libera la foto que alguien tiene puesta: quitarla es una
-- sancion con motivo y aviso ("Retirar la foto"), no una limpieza.
-- Devuelve cuantas denuncias sin resolver, aparte de esta, la tenian.
create or replace function public.match_admin_liberar_foto(p_report_id uuid, p_foto_url text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
  v_path  text := public.ruta_de_avatar_url(p_foto_url);
  v_otras integer;
begin
  if v_path is null or not exists (
    select 1 from public.match_reports r
     where r.id = p_report_id
       and (public.ruta_de_avatar_url(r.reported_avatar_url) = v_path
            or public.ruta_de_avatar_url(r.retired_avatar_url) = v_path)
  ) then
    raise exception 'PHOTO_NOT_IN_REPORT' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles p
     where public.ruta_de_avatar_url(p.avatar_url) = v_path
        or public.ruta_de_avatar_url(p.avatar_thumb_url) = v_path
  ) then
    raise exception 'PHOTO_IN_USE' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_otras from public.match_reports o
   where o.id <> p_report_id and o.status <> 'resuelta'
     and (public.ruta_de_avatar_url(o.reported_avatar_url) = v_path
          or public.ruta_de_avatar_url(o.retired_avatar_url) = v_path);

  insert into public.match_fotos_liberadas (path, released_by)
  values (v_path, v_admin)
  on conflict (path) do nothing;

  -- Las liberadas cuyas denuncias ya no existen (ruta borrada) no protegen
  -- nada y solo guardan un nombre de fichero con el uid dentro: fuera.
  delete from public.match_fotos_liberadas l
   where not exists (
     select 1 from public.match_reports r
      where public.ruta_de_avatar_url(r.reported_avatar_url) = l.path
         or public.ruta_de_avatar_url(r.retired_avatar_url) = l.path
   );

  return v_otras;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retirar la foto guarda cual se retiro
-- ---------------------------------------------------------------------------
-- Cuerpo de la 0015 tal cual, con la foto retirada apuntada en la denuncia
-- ANTES de quitarla del perfil (despues ya no se sabria cual era). Sin denuncia
-- (p_report_id null, ninguna pantalla lo hace) no hay donde apuntarla y la foto
-- pasa a sobrar como cualquier otra.
create or replace function public.match_admin_remove_photo(
  p_user_id uuid,
  p_reason text,
  p_report_id uuid default null,
  p_note text default ''
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
  if p_report_id is not null then
    update public.match_reports r
       set retired_avatar_url = p.avatar_url
      from public.profiles p
     where r.id = p_report_id and p.id = p_user_id and p.avatar_url is not null;
  end if;

  update public.profiles p
     set avatar_url = null, avatar_thumb_url = null, updated_at = now()
   where p.id = p_user_id;

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'foto_retirada', btrim(coalesce(p_note, '')));

  perform public.crear_aviso(p_user_id, 'foto_retirada', null, v_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- La denuncia sigue a la persona aunque se borre la cuenta
-- ---------------------------------------------------------------------------
-- Al denunciar se guarda el HMAC de su correo. Trigger aparte y no dentro de
-- `match_report_nombres` (0028) para no rehacer esa funcion.
create or replace function public.match_report_huella()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.reported_email_hmac is null and new.reported_id is not null then
      new.reported_email_hmac := public.hmac_correo(public.correo_de(new.reported_id));
    end if;
  end if;
  -- Resuelta, ya no hay nada que esquivar: el HMAC vive lo que vive el motivo.
  if new.status = 'resuelta' then
    new.reported_email_hmac := null;
  end if;
  return new;
end;
$$;

drop trigger if exists match_report_huella on public.match_reports;
create trigger match_report_huella
  before insert or update on public.match_reports
  for each row execute function public.match_report_huella();

-- Quien se registra con el correo de alguien denunciado que se borro la cuenta
-- recupera sus denuncias abiertas. AFTER INSERT en profiles: la fila de
-- auth.users ya existe (handle_new_user la crea desde alli), asi que su correo
-- se puede leer.
create or replace function public.profiles_recupera_denuncias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hmac text := public.hmac_correo(public.correo_de(new.id));
begin
  if v_hmac is not null then
    update public.match_reports r
       set reported_id = new.id
     where r.reported_id is null
       and r.status <> 'resuelta'
       and r.reported_email_hmac = v_hmac
       -- Nunca contra quien la puso: si fuera la misma persona, la denuncia
       -- quedaria "sobre si misma" y la check de la 0009 la rechazaria.
       and r.reporter_id is distinct from new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_recupera_denuncias on public.profiles;
create trigger profiles_recupera_denuncias
  after insert on public.profiles
  for each row execute function public.profiles_recupera_denuncias();

-- Las denuncias abiertas de antes de esta migracion tambien: si no, quien
-- tenia una podria borrarse ahora que ya no se bloquea y volver limpio.
update public.match_reports r
   set reported_email_hmac = public.hmac_correo(public.correo_de(r.reported_id))
 where r.status <> 'resuelta'
   and r.reported_id is not null
   and r.reported_email_hmac is null;

-- ---------------------------------------------------------------------------
-- Y ya no impide borrarse la cuenta
-- ---------------------------------------------------------------------------
-- Cuerpo de la 0024 sin la rama HAS_OPEN_REPORTS. Quedan los dos que son de
-- organizacion y no de sancion: un admin, y quien es duena de rutas
-- (`routes.created_by` no tiene cascade).
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
  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que
-- ---------------------------------------------------------------------------
revoke all on function
  public.mis_fotos_sobrantes(),
  public.avatar_admin_sobrantes(),
  public.mis_fotos_retenidas(),
  public.match_admin_fotos_denuncia(uuid),
  public.match_admin_liberar_foto(uuid, text),
  public.match_admin_remove_photo(uuid, text, uuid, text),
  public.delete_my_account_blockers()
from public, anon;

grant execute on function
  public.mis_fotos_sobrantes(),
  public.avatar_admin_sobrantes(),
  public.mis_fotos_retenidas(),
  public.match_admin_fotos_denuncia(uuid),
  public.match_admin_liberar_foto(uuid, text),
  public.match_admin_remove_photo(uuid, text, uuid, text),
  public.delete_my_account_blockers()
to authenticated;

revoke all on function public.match_report_huella(), public.profiles_recupera_denuncias() from public, anon, authenticated;

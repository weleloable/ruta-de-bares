-- Ruta de Bares - 0028: la denuncia guarda la foto y la frase de ese momento.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0027.
-- Idempotente: se puede re-ejecutar sin romper nada.
--
-- Por que existe. La 0017 ya congela el NOMBRE de quien denuncia y de quien es
-- denunciado (`reporter_name`, `reported_name`), para que el historial se pueda
-- leer aunque la cuenta desaparezca. Faltaron las otras dos cosas que se ven en
-- un ticket: la FOTO y la FRASE.
--
-- El caso, y pasa dentro de la misma noche: denuncian a alguien por su foto de
-- perfil, esa persona se la cambia, y quien revisa abre el ticket y ve otra
-- distinta. No entiende de que le hablan, y con la 0020 la foto nueva puede
-- estar incluso aprobada. Lo mismo con la frase de la cana: es texto libre y se
-- edita en dos toques.
--
-- Se guarda al DENUNCIAR y con un trigger, no dentro de `match_report`: asi vale
-- para cualquier via que cree una denuncia sin tener que acordarse, que es el
-- mismo razonamiento que la 0015 uso para el veto de ruta. Y solo se rellena si
-- viene vacio, como hace `match_report_nombres`, para que re-ejecutar esto no
-- pise lo que ya se guardo.
--
-- Que se guarda de la foto: la URL identificadora de `profiles.avatar_url`, no
-- el fichero. Con el bucket privado (0023) esa URL no descarga nada, pero un
-- admin puede firmarla (`avatars_read` le deja leer todo), asi que el ticket la
-- sigue viendo. Y el fichero antiguo sigue en el bucket: la 0020 no borra las
-- fotos sustituidas, que aqui juega a favor.
--
-- Limite conocido: si la foto denunciada era una PENDIENTE de aprobar, lo que
-- se congela es la que tenia puesta, no la pendiente. Se denuncia lo que se ve,
-- y lo pendiente solo lo ve quien lo subio y los admins.

alter table public.match_reports add column if not exists reported_avatar_url text;
alter table public.match_reports add column if not exists reported_bio text;

comment on column public.match_reports.reported_avatar_url is
  'La foto que tenia puesta al denunciarla. Congelada para que el ticket ensene '
  'lo que se denuncio y no lo que haya ahora.';
comment on column public.match_reports.reported_bio is
  'Su frase de la cana al denunciarla, por lo mismo.';

-- Cuerpo de `match_report_nombres` (0017) tal cual, con las dos lineas nuevas.
create or replace function public.match_report_nombres()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.reporter_name, '') = '' then
    select coalesce(p.display_name, '') into new.reporter_name from public.profiles p where p.id = new.reporter_id;
  end if;
  if coalesce(new.reported_name, '') = '' then
    select coalesce(p.display_name, '') into new.reported_name from public.profiles p where p.id = new.reported_id;
  end if;
  new.reporter_name := coalesce(new.reporter_name, '');
  new.reported_name := coalesce(new.reported_name, '');

  -- Lo que anade la 0028. `is null` y no `= ''`: una frase vacia es un dato
  -- valido (la persona no escribio nada) y no hay que salir a buscarla otra vez.
  if new.reported_avatar_url is null then
    select p.avatar_url into new.reported_avatar_url from public.profiles p where p.id = new.reported_id;
  end if;
  if new.reported_bio is null then
    select coalesce(mp.bio, '') into new.reported_bio
      from public.match_profiles mp where mp.user_id = new.reported_id;
    new.reported_bio := coalesce(new.reported_bio, '');
  end if;

  return new;
end;
$$;

-- Los tickets que ya existen se quedan sin foto ni frase congeladas: no hay
-- forma de saber cual tenian entonces, y poner la de ahora seria mentir. El
-- panel lo distingue (null = no se guardo, '' = no tenia).

-- ---------------------------------------------------------------------------
-- Y el ticket las ensena
-- ---------------------------------------------------------------------------
-- Cuerpo de `match_admin_report` COPIADO DE LA BASE (0015), no reescrito: lo
-- unico que cambia son las dos expresiones de la foto y la frase, que ahora
-- prefieren lo congelado y caen a lo de ahora solo si la denuncia es anterior a
-- esta migracion. La firma se respeta entera: la app ya consume esas 26
-- columnas y `create or replace` ni siquiera dejaria cambiarla.
--
-- (Primera version de esta migracion: la reescribi de cabeza con 21 columnas
-- inventadas. La 0019 existe exactamente por eso.)
create or replace function public.match_admin_report(p_report_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  status text,
  reason text,
  detail text,
  route_id uuid,
  route_name text,
  reporter_id uuid,
  reporter_name text,
  reported_id uuid,
  reported_name text,
  reported_avatar_url text,
  reported_bio text,
  reported_active boolean,
  reported_in_route boolean,
  reported_is_admin boolean,
  reported_cana_blocked boolean,
  reported_route_banned boolean,
  reported_suspended boolean,
  mensajes integer,
  notified_at timestamptz,
  handled_by uuid,
  handled_by_name text,
  handled_at timestamptz,
  resolution text,
  handler_note text
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
  select r.id, r.created_at, r.status, r.reason, r.detail,
         r.route_id, ruta.name,
         r.reporter_id, coalesce(quien.display_name, nullif(r.reporter_name, ''), '(cuenta borrada)'),
         r.reported_id, coalesce(acusada.display_name, nullif(r.reported_name, ''), '(cuenta borrada)'),
         -- Lo que cambia la 0028: primero lo congelado al denunciar.
         coalesce(r.reported_avatar_url, acusada.avatar_url, acusada.avatar_thumb_url),
         coalesce(r.reported_bio, cana.bio, ''),
         coalesce(cana.is_active, false),
         exists (select 1 from public.route_members m
                  where m.route_id = r.route_id and m.user_id = r.reported_id),
         coalesce(acusada.role = 'admin', false),
         coalesce(cana.blocked_at is not null, false),
         exists (select 1 from public.route_bans b
                  where b.route_id = r.route_id and b.user_id = r.reported_id),
         coalesce(public.esta_suspendida(r.reported_id), false),
         (select count(*)::integer from public.match_report_messages m where m.report_id = r.id),
         r.notified_at,
         r.handled_by, admin.display_name, r.handled_at,
         r.resolution, r.handler_note
    from public.match_reports r
    left join public.profiles quien   on quien.id = r.reporter_id
    left join public.profiles acusada on acusada.id = r.reported_id
    join public.routes ruta on ruta.id = r.route_id
    left join public.match_profiles cana on cana.user_id = r.reported_id
    left join public.profiles admin on admin.id = r.handled_by
   where r.id = p_report_id;
end;
$$;

revoke all on function public.match_admin_report(uuid) from public, anon;
grant execute on function public.match_admin_report(uuid) to authenticated;

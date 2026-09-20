-- Ruta de Bares - 0027: una ruta termina, y al borrarla se lleva sus datos.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0026.
-- Idempotente: se puede re-ejecutar.
--
-- Por que existe. `match_admin_purge_route` (0009) esta escrita y **no la llama
-- nadie**: ni cron, ni tarea, ni boton. Todo lo de la cana de un evento de hace
-- meses sigue ahi. Y no es solo higiene: el HMAC del correo de un veto se
-- justifica diciendo que "muere al purgar la ruta", asi que sin purga ese dato
-- es perpetuo y el argumento se cae. La politica de privacidad ya lo promete.
--
-- La decision, y es la buena noticia: **no hace falta ninguna purga nueva, ni
-- cron, ni tarea programada**. Borrar la ruta ya se lleva por delante casi
-- todo, porque el esquema lo cascadea desde la 0001: los bares y con ellos los
-- sellos (con su GPS), la pertenencia, las invitaciones, las conexiones de la
-- cana y sus chats, los votos, las denuncias con sus pruebas, y los vetos de
-- ruta con su HMAC. Y el boton de borrar ya existe en el editor.
--
-- Lo que hace esta migracion es cerrar los tres huecos que quedaban:
--
--   1. **Que se sepa cuando una ruta ha terminado**, para poder avisar de que
--      toca borrarla. Se deduce: terminada a las 08:00 del dia siguiente al
--      evento. Deducirlo y no guardarlo evita un estado mas que mantener al
--      dia, y las 08:00 del dia siguiente resuelven lo de la medianoche (una
--      ruta de bares cruza las 12 por definicion: con `event_date < hoy` a
--      secas se marcaria terminada mientras la gente sigue sellando).
--      `finished_at` es SOLO para marcarla a mano antes de tiempo (se cancelo,
--      se acabo pronto). La regla vive en `src/features/routes/estado.ts`.
--
--   2. **Que ninguna ruta publicada se quede sin fecha**, o no termina nunca y
--      se escapa del aviso. La restriccion va NOT VALID a proposito: en un
--      proyecto que ya este en marcha puede haber rutas publicadas sin fecha, y
--      la migracion no puede fallar por eso. Lo nuevo si se comprueba, y editar
--      una vieja obliga a ponerle fecha.
--
--   3. **Que el veto de cana muera con la ruta**, como el de ruta. La 0024 lo
--      hizo global porque la cana es global, pero el acuerdo es que **los vetos
--      no se arrastran de un evento al siguiente**: cada ruta empieza de cero.
--      Con `route_id` y su cascade, el veto y su HMAC se van cuando se borra el
--      evento en el que se puso.
--
-- Lo que NO muere con una ruta, y es correcto: la SUSPENSION de cuenta
-- (`account_suspensions`), que no es de un evento sino de la persona, y el
-- registro de moderacion, que es el historial de quien organiza.

-- ---------------------------------------------------------------------------
-- 1. Terminar una ruta a mano
-- ---------------------------------------------------------------------------
-- Nullable: lo normal es que este a null y la ruta se de por terminada sola.
alter table public.routes add column if not exists finished_at timestamptz;

comment on column public.routes.finished_at is
  'Solo para marcarla a mano antes de tiempo. Lo normal es null: se deduce que '
  'termino a las 08:00 del dia siguiente a event_date (ver routes/estado.ts).';

-- ---------------------------------------------------------------------------
-- 2. Publicada exige fecha
-- ---------------------------------------------------------------------------
alter table public.routes drop constraint if exists routes_publicada_con_fecha;
alter table public.routes add constraint routes_publicada_con_fecha
  check (not is_published or event_date is not null) not valid;

-- ---------------------------------------------------------------------------
-- 3. El veto de cana muere con su ruta
-- ---------------------------------------------------------------------------
alter table public.cana_bans add column if not exists route_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cana_bans_route_id_fkey'
  ) then
    alter table public.cana_bans
      add constraint cana_bans_route_id_fkey
      foreign key (route_id) references public.routes(id) on delete cascade;
  end if;
end;
$$;

create index if not exists cana_bans_route_idx on public.cana_bans (route_id);

-- Los que ya estan puestos se quedan sin ruta: no hay forma fiable de saber de
-- donde salieron. Siguen vigentes hasta que un admin los levante desde
-- Moderacion, que es donde se ven.

-- `match_admin_deactivate` con la ruta. Cuerpo copiado del que deja la 0024,
-- anadiendo SOLO la ruta: sale de la denuncia que motivo el veto, que es la que
-- sabe en que evento paso. Sin denuncia (un veto puesto a mano) se queda a null
-- y no muere con ninguna ruta, que es lo prudente: mejor que sobreviva de mas y
-- se levante a mano que perderlo sin querer.
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
  v_ruta   uuid;
begin
  if p_report_id is not null then
    select r.route_id into v_ruta from public.match_reports r where r.id = p_report_id;
  end if;

  insert into public.match_profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  update public.match_profiles mp
     set is_active = false,
         blocked_at = now(),
         blocked_by = v_admin,
         blocked_reason = v_motivo,
         updated_at = now()
   where mp.user_id = p_user_id;

  insert into public.cana_bans (user_id, email_hmac, reason, banned_by, route_id)
  values (p_user_id, public.hmac_correo(public.correo_de(p_user_id)), v_motivo, v_admin, v_ruta)
  on conflict (user_id) do update
     set email_hmac = excluded.email_hmac,
         reason     = excluded.reason,
         banned_by  = excluded.banned_by,
         route_id   = excluded.route_id,
         created_at = now();

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'cana_desactivada', btrim(coalesce(p_note, '')));

  perform public.crear_aviso(p_user_id, 'cana_desactivada', null, v_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Y una comprobacion, para el test: que borrar una ruta se lo lleva todo
-- ---------------------------------------------------------------------------
-- Interna, solo para poder afirmar en un test lo que queda de una ruta sin
-- tener que enumerar ocho tablas en TypeScript. No la llama la app.
create or replace function public.rastro_de_ruta(p_route_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rutas',        (select count(*) from public.routes r where r.id = p_route_id),
    'bares',        (select count(*) from public.route_bars b where b.route_id = p_route_id),
    'sellos',       (select count(*) from public.stamps s
                      join public.route_bars b on b.id = s.route_bar_id where b.route_id = p_route_id),
    'miembros',     (select count(*) from public.route_members m where m.route_id = p_route_id),
    'invitaciones', (select count(*) from public.route_invites i where i.route_id = p_route_id),
    'conexiones',   (select count(*) from public.match_connections c where c.route_id = p_route_id),
    'votos',        (select count(*) from public.match_votes v where v.route_id = p_route_id),
    'denuncias',    (select count(*) from public.match_reports r where r.route_id = p_route_id),
    'vetos_ruta',   (select count(*) from public.route_bans b where b.route_id = p_route_id),
    'vetos_cana',   (select count(*) from public.cana_bans c where c.route_id = p_route_id)
  );
$$;

revoke all on function public.rastro_de_ruta(uuid) from public, anon, authenticated;

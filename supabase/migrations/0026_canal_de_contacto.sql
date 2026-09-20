-- Ruta de Bares - 0026: escribir a la organizacion, y reclamar una decision.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0025.
-- Idempotente: se puede re-ejecutar sin romper nada.
--
-- Por que existe. Cada aviso de sancion dice "si crees que es un error, habla
-- con quien organiza la ruta", y hasta ahora no habia ningun sitio donde
-- hacerlo: ni direccion, ni formulario, ni registro de lo recibido.
--
-- La ley pide TRES canales distintos y solo dos se cubren aqui:
--
--   * **DSA art. 12** (punto de contacto para quien usa el servicio): siempre
--     disponible, sin condiciones. Es el boton "Escribir a la organizacion".
--   * **DSA art. 20** (reclamar una decision): para quien fue sancionado,
--     durante SEIS MESES desde la decision. Es el boton que sale dentro de cada
--     aviso, y por eso un mensaje puede apuntar al aviso que reclama.
--   * **DSA art. 16** (avisar de contenido ilicito): tiene que estar abierto a
--     CUALQUIERA, tenga cuenta o no. Eso NO se puede hacer desde dentro de la
--     app: lo cubre el correo publicado en la politica de privacidad.
--
-- (El sistema formal del art. 20 probablemente no sea exigible: el art. 19
-- exime de esa seccion a micro y pequenas empresas. Se hace igual porque deja
-- registro de lo que se reclamo y de que se respondio, que es lo util.)
--
-- Las dos decisiones que importan:
--
--   * **NO se copia el guardian de la 0016.** `match_report` y `match_block`
--     exigen estar dentro de una ruta y sin sancion. Aqui seria exactamente al
--     reves de lo que se busca: quien tiene que poder escribir es justo la
--     cuenta SUSPENDIDA y EXPULSADA. Solo se exige tener sesion.
--   * **No la revisa quien sanciono.** `match_admin_take_message` se lo impide
--     al admin que firmo la decision reclamada, si hay otro. Con un solo admin
--     no hay alternativa, asi que se deja pasar y el ticket lo dice.
--
-- Limite de 5 al dia, como `avatar_request_submit` (0020): texto libre hacia la
-- bandeja de los admins es un vector de spam, y cada mensaje es trabajo manual.

-- ---------------------------------------------------------------------------
-- La tabla
-- ---------------------------------------------------------------------------
-- `user_id` sin clave ajena y con el nombre guardado, como el rastro de
-- moderacion (0017): una reclamacion tiene que poder leerse aunque quien la
-- puso se haya borrado la cuenta despues.
create table if not exists public.user_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  user_name   text not null default '',
  kind        text not null check (kind in ('contacto', 'reclamacion')),
  -- El aviso que se reclama. Sin clave ajena por lo mismo de arriba.
  notice_id   uuid,
  notice_action text not null default '',
  body        text not null check (length(btrim(body)) between 1 and 2000),
  status      text not null default 'pendiente'
                check (status in ('pendiente', 'en_revision', 'resuelta')),
  created_at  timestamptz not null default now(),
  handled_by  uuid references public.profiles(id) on delete set null,
  handled_at  timestamptz,
  answer      text not null default ''
);
create index if not exists user_messages_estado_idx on public.user_messages (status, created_at);
create index if not exists user_messages_persona_idx on public.user_messages (user_id, created_at);

alter table public.user_messages enable row level security;
revoke all on public.user_messages from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Escribir
-- ---------------------------------------------------------------------------
create or replace function public.send_admin_message(
  p_kind text,
  p_body text,
  p_notice_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_texto  text := btrim(coalesce(p_body, ''));
  v_hoy    integer;
  v_accion text := '';
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  -- A proposito NO se comprueba ni pertenencia a ruta ni sancion: quien mas
  -- necesita este canal es justo quien esta suspendido o expulsado.
  if p_kind not in ('contacto', 'reclamacion') then
    raise exception 'KIND_INVALID' using errcode = '22023';
  end if;
  if v_texto = '' then
    raise exception 'BODY_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(v_texto) > 2000 then
    raise exception 'BODY_TOO_LONG' using errcode = '22023';
  end if;

  select count(*) into v_hoy
    from public.user_messages m
   where m.user_id = v_uid and m.created_at > now() - interval '1 day';
  if v_hoy >= 5 then
    raise exception 'TOO_MANY_MESSAGES' using errcode = 'P0001';
  end if;

  -- Si dice que reclama una decision, tiene que ser UNA SUYA. Sin esto se
  -- podria apuntar al aviso de otra persona y sacarle la accion por el ticket.
  if p_notice_id is not null then
    select n.action into v_accion
      from public.user_notices n
     where n.id = p_notice_id and n.user_id = v_uid;
    if v_accion is null then
      raise exception 'NOTICE_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  insert into public.user_messages (user_id, user_name, kind, notice_id, notice_action, body)
  values (
    v_uid,
    coalesce((select p.display_name from public.profiles p where p.id = v_uid), ''),
    p_kind,
    p_notice_id,
    coalesce(v_accion, ''),
    v_texto
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Lo que la persona ha escrito y que se le respondio.
create or replace function public.my_admin_messages()
returns table (
  id uuid,
  kind text,
  notice_action text,
  body text,
  status text,
  answer text,
  created_at timestamptz,
  handled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return query
  select m.id, m.kind, m.notice_action, m.body, m.status, m.answer, m.created_at, m.handled_at
    from public.user_messages m
   where m.user_id = v_uid
   order by m.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leerlo desde la bandeja
-- ---------------------------------------------------------------------------
create or replace function public.admin_messages(p_solo_pendientes boolean default true)
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  kind text,
  notice_id uuid,
  notice_action text,
  body text,
  status text,
  answer text,
  created_at timestamptz,
  handled_by uuid,
  handled_by_name text,
  handled_at timestamptz,
  -- Para avisar a quien lo revise de que la decision la tomo el mismo.
  decidido_por_mi boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
begin
  return query
  select m.id, m.user_id, coalesce(nullif(m.user_name, ''), '(cuenta borrada)'),
         m.kind, m.notice_id, m.notice_action, m.body, m.status, m.answer, m.created_at,
         m.handled_by, coalesce(a.display_name, ''), m.handled_at,
         exists (
           select 1 from public.match_moderation_log l
            where l.target_id = m.user_id
              and l.admin_id = v_admin
              and m.notice_id is not null
              and l.created_at <= m.created_at
              and l.action = m.notice_action
         )
    from public.user_messages m
    left join public.profiles a on a.id = m.handled_by
   where (not p_solo_pendientes) or m.status <> 'resuelta'
   order by case m.status when 'pendiente' then 0 when 'en_revision' then 1 else 2 end,
            m.created_at;
end;
$$;

/** Cuantos esperan, para la burbujita. */
create or replace function public.admin_message_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();
  return (select count(*)::integer from public.user_messages m where m.status <> 'resuelta');
end;
$$;

-- Se RECLAMA al abrirlo, como una denuncia (0013): con dos admins en la misma
-- bandeja, si no, los dos se ponen con lo mismo.
create or replace function public.admin_take_message(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
  v_filas integer;
begin
  update public.user_messages m
     set status = 'en_revision', handled_by = v_admin, handled_at = now()
   where m.id = p_id and m.status = 'pendiente';
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

-- Responder cierra el mensaje Y genera un aviso: el circulo se cierra donde la
-- persona ya sabe mirar. El art. 20 pide que se le comunique la decision.
create or replace function public.admin_answer_message(p_id uuid, p_answer text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin   uuid := public.match_admin_require();
  v_texto   text := public.exigir_motivo(p_answer);
  v_persona uuid;
begin
  select m.user_id into v_persona from public.user_messages m where m.id = p_id;
  if not found then
    raise exception 'MESSAGE_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.user_messages m
     set status = 'resuelta', answer = v_texto, handled_by = v_admin, handled_at = now()
   where m.id = p_id;

  -- Si la cuenta ya no existe no hay a quien avisar, pero la respuesta queda
  -- registrada igual: es la prueba de que se atendio.
  if v_persona is not null then
    perform public.crear_aviso(v_persona, 'respuesta_organizacion', null, v_texto);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- El aviso nuevo
-- ---------------------------------------------------------------------------
-- `user_notices.action` tiene una lista cerrada; sin esto, responder revienta.
-- Los siete de antes, copiados de la restriccion que hay en la base, mas el
-- nuevo. (Escritos de memoria salia 'suspension_levantada', que no existe: la
-- buena es 'cuenta_reactivada'. Es el fallo que explica la 0019.)
alter table public.user_notices drop constraint if exists user_notices_action_check;
alter table public.user_notices add constraint user_notices_action_check
  check (action in (
    'foto_retirada', 'cana_desactivada', 'expulsada_de_ruta', 'cuenta_suspendida',
    'cana_reactivada', 'veto_de_ruta_retirado', 'cuenta_reactivada',
    'respuesta_organizacion'
  ));

revoke all on function public.send_admin_message(text, text, uuid), public.my_admin_messages(),
                      public.admin_messages(boolean), public.admin_message_count(),
                      public.admin_take_message(uuid), public.admin_answer_message(uuid, text)
  from public, anon;
grant execute on function public.send_admin_message(text, text, uuid), public.my_admin_messages(),
                          public.admin_messages(boolean), public.admin_message_count(),
                          public.admin_take_message(uuid), public.admin_answer_message(uuid, text)
  to authenticated;

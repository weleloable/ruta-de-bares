-- Ruta de Bares - 0005: "Tirate una cana", el tinder cervecero de cada ruta.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0002.
-- Idempotente como las anteriores: se puede re-ejecutar.
--
-- Reglas y decisiones de producto: docs/TIRATE-UNA-CANA.md.
--
-- Mismo patron que claim_stamp: la app no lee ni escribe ninguna tabla match_*
-- (salvo los dos catalogos). Todo pasa por funciones SECURITY DEFINER que
-- comprueban quien llama, asi que las reglas no se saltan ni con la clave
-- publicable en la mano. Las funciones match_require_* y match_lock_* son
-- internas: no se pueden llamar desde la API.
--
-- Codigos de error (el cliente los traduce en src/features/match/reglas.ts):
--   NOT_AUTHENTICATED, NOT_PARTICIPANT, MATCH_NOT_ACTIVE, MATCH_PROFILE_MISSING,
--   ADULT_CONFIRMATION_REQUIRED, BIO_REQUIRED, BIO_TOO_LONG, TOO_MANY_TAGS,
--   TAG_NOT_FOUND, INVALID_VOTE, INVALID_TARGET, TARGET_UNAVAILABLE,
--   CONNECTION_NOT_FOUND, CONNECTION_CLOSED, CONNECTION_UNAVAILABLE,
--   GIF_NOT_FOUND, BUZZ_TOO_SOON, TEXT_LOCKED, TEXT_EMPTY, TEXT_TOO_LONG,
--   TEXT_LIMIT_REACHED, QUESTION_ALREADY_PENDING, QUESTION_ALREADY_ANSWERED,
--   QUESTION_TOO_SOON, QUESTION_LIMIT_REACHED, NO_PENDING_QUESTION,
--   CANNOT_ANSWER_OWN_QUESTION, INVALID_ANSWER

-- ---------------------------------------------------------------------------
-- Contrato con la pertenencia a rutas
-- ---------------------------------------------------------------------------
-- "Quien participa en una ruta" lo construye otra linea de trabajo (cada
-- usuario solo ve la ruta a la que le han invitado). Esta funcion es la unica
-- pregunta que la feature le hace: su firma no se cambia.
--
-- Solo se crea si no existe, en vez de create or replace: si la migracion de
-- pertenencia se aplica ANTES que esta, un replace aqui pisaria su version
-- buena con la provisional. La provisional deja participar a todo el mundo en
-- las rutas publicadas, que es lo que la app ensena hoy.
do $$
begin
  if to_regprocedure('public.is_route_participant(uuid, uuid)') is null then
    execute $f$
      create function public.is_route_participant(p_route_id uuid, p_user_id uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        -- PROVISIONAL (0005): la sustituye la migracion de pertenencia a rutas.
        select p_user_id is not null and exists (
          select 1 from public.routes r where r.id = p_route_id and r.is_published
        );
      $body$
    $f$;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists public.match_profiles (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  is_active          boolean not null default false,
  bio                text not null default '' check (char_length(bio) <= 120),
  adult_confirmed_at timestamptz,
  first_activated_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Catalogo de etiquetas. PROVISIONAL: la lista real se decide mas adelante y
-- nunca debe incluir categorias sensibles (orientacion, salud, religion).
create table if not exists public.match_tags (
  id         text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  label      text not null check (length(btrim(label)) between 1 and 40),
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

insert into public.match_tags (id, label, sort_order) values
  ('etiqueta-1', 'Etiqueta 1', 1),
  ('etiqueta-2', 'Etiqueta 2', 2),
  ('etiqueta-3', 'Etiqueta 3', 3),
  ('etiqueta-4', 'Etiqueta 4', 4),
  ('etiqueta-5', 'Etiqueta 5', 5),
  ('etiqueta-6', 'Etiqueta 6', 6),
  ('etiqueta-7', 'Etiqueta 7', 7),
  ('etiqueta-8', 'Etiqueta 8', 8)
on conflict (id) do nothing;

create table if not exists public.match_profile_tags (
  user_id uuid not null references public.match_profiles (user_id) on delete cascade,
  tag_id  text not null references public.match_tags (id) on delete cascade,
  primary key (user_id, tag_id)
);

-- Catalogo de GIFs. Solo identificadores: los ficheros van dentro de la app
-- (assets/gifs, src/features/match/gifs.ts). Un mensaje guarda el id, nunca
-- una URL libre, para que nadie cuele una imagen cualquiera ni un pixel de
-- rastreo en el chat de otra persona.
create table if not exists public.match_gifs (
  id         text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  label      text not null check (length(btrim(label)) between 1 and 40),
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

insert into public.match_gifs (id, label, sort_order) values
  ('salud', 'Salud', 1),
  ('chin-chin', 'Chin chin', 2),
  ('otra-ronda', 'Otra ronda', 3),
  ('espuma', 'Espuma', 4),
  ('te-invito', 'Te invito', 5),
  ('guino', 'Guino', 6),
  ('bailecito', 'Bailecito', 7),
  ('burbujas', 'Burbujas', 8)
on conflict (id) do nothing;

-- Votos por ruta: cada ruta es un evento y empieza de cero.
create table if not exists public.match_votes (
  route_id   uuid not null references public.routes (id) on delete cascade,
  voter_id   uuid not null references public.profiles (id) on delete cascade,
  target_id  uuid not null references public.profiles (id) on delete cascade,
  value      text not null check (value in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (route_id, voter_id, target_id),
  constraint match_votes_not_self check (voter_id <> target_id)
);

-- UNA fila por pareja y ruta, no una por cada vez que conectan: el estado de
-- la pregunta de la cerveza pertenece a la pareja. Si fuera por conexion,
-- quitar y volver a dar me gusta serviria para volver a preguntar.
-- user_a < user_b para que la pareja (A, B) y (B, A) sea la misma fila.
create table if not exists public.match_connections (
  id                   uuid primary key default gen_random_uuid(),
  route_id             uuid not null references public.routes (id) on delete cascade,
  user_a               uuid not null references public.profiles (id) on delete cascade,
  user_b               uuid not null references public.profiles (id) on delete cascade,
  is_open              boolean not null default true,
  opened_at            timestamptz not null default now(),
  closed_at            timestamptz,
  question_state       text not null default 'none'
                       check (question_state in ('none', 'pending', 'postponed', 'accepted', 'rejected')),
  question_asked_by    uuid references public.profiles (id) on delete set null,
  question_asked_at    timestamptz,
  question_answered_at timestamptz,
  postpone_count       integer not null default 0 check (postpone_count between 0 and 2),
  constraint match_connections_pair_order check (user_a < user_b),
  constraint match_connections_pair_key unique (route_id, user_a, user_b)
);

create index if not exists match_connections_route_user_b_idx on public.match_connections (route_id, user_b);

-- Lo que es de cada lado de la conexion. En filas aparte y no en columnas
-- a/b: los limites (2 textos, 1 zumbido cada 30 s) se comprueban y se gastan
-- con un solo UPDATE ... WHERE, sin carreras entre dos envios a la vez.
create table if not exists public.match_connection_members (
  connection_id uuid not null references public.match_connections (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  last_read_at  timestamptz not null default '-infinity',
  last_buzz_at  timestamptz,
  texts_sent    integer not null default 0 check (texts_sent between 0 and 2),
  primary key (connection_id, user_id)
);

create table if not exists public.match_messages (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.match_connections (id) on delete cascade,
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('gif', 'buzz', 'question', 'answer', 'text')),
  gif_id        text references public.match_gifs (id),
  answer        text check (answer in ('yes', 'no', 'later')),
  body          text check (char_length(body) between 1 and 120),
  -- clock_timestamp y no now(): now() es la hora de INICIO de la transaccion,
  -- y dos mensajes (o un mensaje y una lectura) en la misma transaccion
  -- empatarian. Con la hora real, orden y "no leidos" no dependen de eso.
  created_at    timestamptz not null default clock_timestamp(),
  constraint match_messages_shape check (
    (kind = 'gif' and gif_id is not null and answer is null and body is null)
    or (kind = 'text' and body is not null and gif_id is null and answer is null)
    or (kind = 'answer' and answer is not null and gif_id is null and body is null)
    or (kind in ('buzz', 'question') and gif_id is null and answer is null and body is null)
  )
);

create index if not exists match_messages_connection_idx on public.match_messages (connection_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------
alter table public.match_profiles           enable row level security;
alter table public.match_tags               enable row level security;
alter table public.match_profile_tags       enable row level security;
alter table public.match_gifs               enable row level security;
alter table public.match_votes              enable row level security;
alter table public.match_connections        enable row level security;
alter table public.match_connection_members enable row level security;
alter table public.match_messages           enable row level security;

-- Sin ninguna policy en las tablas privadas, y ademas sin privilegios: aunque
-- alguien anada una policy por error, ni se leen los votos que te han dado ni
-- los chats ajenos. Los admins tampoco (is_admin no aparece en esta migracion).
revoke all on table
  public.match_profiles,
  public.match_profile_tags,
  public.match_votes,
  public.match_connections,
  public.match_connection_members,
  public.match_messages
from anon, authenticated;

-- Los catalogos no son de nadie: se leen tal cual, pero no se escriben.
revoke all on table public.match_tags, public.match_gifs from anon, authenticated;
grant select on table public.match_tags, public.match_gifs to authenticated;

drop policy if exists match_tags_select on public.match_tags;
create policy match_tags_select on public.match_tags
  for select to authenticated
  using (is_active);

drop policy if exists match_gifs_select on public.match_gifs;
create policy match_gifs_select on public.match_gifs
  for select to authenticated
  using (is_active);

-- ---------------------------------------------------------------------------
-- Funciones internas
-- ---------------------------------------------------------------------------
create or replace function public.match_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.match_profiles mp where mp.user_id = p_user_id and mp.is_active
  );
$$;

-- Quien llama tiene que tener sesion, participar en la ruta y tener la feature
-- activada: nadie mira la grilla sin dejarse ver.
create or replace function public.match_require_member(p_route_id uuid)
returns uuid
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
  if not public.is_route_participant(p_route_id, v_uid) then
    raise exception 'NOT_PARTICIPANT' using errcode = 'P0001';
  end if;
  if not public.match_is_active(v_uid) then
    raise exception 'MATCH_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- Cerrojo por pareja. Votar, responder y enviar lo toman siempre ANTES de
-- bloquear la fila de la conexion: con un solo orden no hay interbloqueos, y
-- dos votos cruzados a la vez no dejan una conexion abierta con un No me gusta.
create or replace function public.match_lock_pair(p_route_id uuid, p_user_a uuid, p_user_b uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  select pg_advisory_xact_lock(
    hashtextextended(p_route_id::text || ':' || p_user_a::text || ':' || p_user_b::text, 0)
  );
$$;

-- Devuelve la conexion si quien llama puede usarla ahora mismo. Con p_lock la
-- deja bloqueada hasta el final de la transaccion.
-- CONNECTION_NOT_FOUND tanto si no existe como si es de otras dos personas:
-- distinguirlo diria que esa conexion existe.
create or replace function public.match_require_connection(p_connection_id uuid, p_lock boolean)
returns public.match_connections
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_conn  public.match_connections%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_conn from public.match_connections c where c.id = p_connection_id;
  if not found or v_uid not in (v_conn.user_a, v_conn.user_b) then
    raise exception 'CONNECTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_lock then
    perform public.match_lock_pair(v_conn.route_id, v_conn.user_a, v_conn.user_b);
    select * into v_conn from public.match_connections c where c.id = p_connection_id for update;
  end if;

  if not v_conn.is_open then
    raise exception 'CONNECTION_CLOSED' using errcode = 'P0001';
  end if;
  if not public.is_route_participant(v_conn.route_id, v_uid) then
    raise exception 'NOT_PARTICIPANT' using errcode = 'P0001';
  end if;
  if not public.match_is_active(v_uid) then
    raise exception 'MATCH_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  -- La otra persona ha pausado la feature o ya no esta en la ruta: la
  -- conexion sigue guardada (desactivar es una pausa) pero no se usa.
  v_other := case when v_conn.user_a = v_uid then v_conn.user_b else v_conn.user_a end;
  if not public.match_is_active(v_other) or not public.is_route_participant(v_conn.route_id, v_other) then
    raise exception 'CONNECTION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  return v_conn;
end;
$$;

-- Cerrar = "como si nunca os hubierais dado me gusta" para el chat: se borra.
-- Lo que no se borra es el estado de la pregunta ni los textos gastados.
create or replace function public.match_close_connection(p_connection_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.match_connections c
     set is_open = false, closed_at = now()
   where c.id = p_connection_id;
  delete from public.match_messages m where m.connection_id = p_connection_id;
  update public.match_connection_members cm
     set last_read_at = '-infinity'
   where cm.connection_id = p_connection_id;
end;
$$;

create or replace function public.match_save_bio_and_tags(p_user_id uuid, p_bio text, p_tag_ids text[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_bio  text := btrim(coalesce(p_bio, ''));
  v_tags text[];
begin
  if v_bio = '' then
    raise exception 'BIO_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(v_bio) > 120 then
    raise exception 'BIO_TOO_LONG' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct t), '{}') into v_tags
    from unnest(coalesce(p_tag_ids, '{}')) as t;
  if cardinality(v_tags) > 5 then
    raise exception 'TOO_MANY_TAGS' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(v_tags) as t
     where not exists (select 1 from public.match_tags mt where mt.id = t and mt.is_active)
  ) then
    raise exception 'TAG_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.match_profiles mp
     set bio = v_bio, updated_at = now()
   where mp.user_id = p_user_id;
  delete from public.match_profile_tags pt where pt.user_id = p_user_id;
  insert into public.match_profile_tags (user_id, tag_id)
  select p_user_id, t from unnest(v_tags) as t;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfil cervecero
-- ---------------------------------------------------------------------------
create or replace function public.match_get_profile()
returns table (
  is_active            boolean,
  bio                  text,
  tag_ids              text[],
  adult_confirmed      boolean,
  has_activated_before boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  return query
  select coalesce(mp.is_active, false),
         coalesce(mp.bio, ''),
         coalesce(
           (select array_agg(pt.tag_id order by pt.tag_id)
              from public.match_profile_tags pt where pt.user_id = v_uid),
           '{}'::text[]
         ),
         mp.adult_confirmed_at is not null,
         mp.first_activated_at is not null
    from (select v_uid as id) yo
    left join public.match_profiles mp on mp.user_id = yo.id;
end;
$$;

-- Activar. La primera vez exige confirmar la mayoria de edad y presentarse
-- (frase obligatoria, etiquetas opcionales). Despues basta con llamarla sin
-- nada mas: desactivar es una pausa y el perfil se conserva.
create or replace function public.match_activate(
  p_adult_confirmed boolean default false,
  p_bio text default null,
  p_tag_ids text[] default null
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
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  insert into public.match_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_perfil from public.match_profiles mp where mp.user_id = v_uid for update;

  if v_perfil.adult_confirmed_at is null and not coalesce(p_adult_confirmed, false) then
    raise exception 'ADULT_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;
  if v_perfil.first_activated_at is null or p_bio is not null then
    perform public.match_save_bio_and_tags(v_uid, p_bio, p_tag_ids);
  end if;

  update public.match_profiles mp
     set is_active = true,
         adult_confirmed_at = coalesce(mp.adult_confirmed_at, now()),
         first_activated_at = coalesce(mp.first_activated_at, now()),
         updated_at = now()
   where mp.user_id = v_uid;
end;
$$;

create or replace function public.match_deactivate()
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
  update public.match_profiles mp
     set is_active = false, updated_at = now()
   where mp.user_id = v_uid;
end;
$$;

create or replace function public.match_update_profile(p_bio text, p_tag_ids text[] default null)
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
  if not exists (
    select 1 from public.match_profiles mp
     where mp.user_id = v_uid and mp.first_activated_at is not null
  ) then
    raise exception 'MATCH_PROFILE_MISSING' using errcode = 'P0001';
  end if;
  perform public.match_save_bio_and_tags(v_uid, p_bio, p_tag_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grilla y votos
-- ---------------------------------------------------------------------------
-- Solo nombre, foto, frase y etiquetas: ni correo, ni rol, ni ubicacion, ni
-- sellos. Tu voto si; el de la otra persona nunca (solo se nota como
-- connection_id cuando hay me gusta mutuo).
-- Orden: sin votar primero y, dentro, un orden aleatorio pero estable para
-- cada persona (el hash no cambia entre recargas). Nunca por cercania.
create or replace function public.match_grid(p_route_id uuid)
returns table (
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  bio           text,
  tag_ids       text[],
  my_vote       text,
  connection_id uuid,
  unread_count  integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.match_require_member(p_route_id);
begin
  return query
  select p.id,
         p.display_name,
         p.avatar_url,
         mp.bio,
         coalesce(
           (select array_agg(pt.tag_id order by pt.tag_id)
              from public.match_profile_tags pt where pt.user_id = p.id),
           '{}'::text[]
         ),
         v.value,
         c.id,
         coalesce((
           select count(*)::integer
             from public.match_messages m
             join public.match_connection_members yo
               on yo.connection_id = m.connection_id and yo.user_id = v_uid
            where m.connection_id = c.id
              and m.sender_id <> v_uid
              and m.created_at > yo.last_read_at
         ), 0)
    from public.match_profiles mp
    join public.profiles p on p.id = mp.user_id
    left join public.match_votes v
      on v.route_id = p_route_id and v.voter_id = v_uid and v.target_id = p.id
    left join public.match_connections c
      on c.route_id = p_route_id and c.is_open
     and c.user_a = least(v_uid, p.id) and c.user_b = greatest(v_uid, p.id)
   where mp.is_active
     and p.id <> v_uid
     and public.is_route_participant(p_route_id, p.id)
   order by (v.value is null) desc, md5(v_uid::text || p.id::text || p_route_id::text);
end;
$$;

-- Guarda el voto y abre o cierra la conexion en la misma transaccion.
create or replace function public.match_vote(p_route_id uuid, p_target_id uuid, p_value text)
returns table (my_vote text, connection_id uuid)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := public.match_require_member(p_route_id);
  v_a     uuid;
  v_b     uuid;
  v_other text;
  v_conn  public.match_connections%rowtype;
begin
  if p_value is null or p_value not in ('like', 'dislike') then
    raise exception 'INVALID_VOTE' using errcode = '22023';
  end if;
  if p_target_id is null or p_target_id = v_uid then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  if not public.match_is_active(p_target_id) or not public.is_route_participant(p_route_id, p_target_id) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_a := least(v_uid, p_target_id);
  v_b := greatest(v_uid, p_target_id);
  perform public.match_lock_pair(p_route_id, v_a, v_b);

  insert into public.match_votes (route_id, voter_id, target_id, value)
  values (p_route_id, v_uid, p_target_id, p_value)
  on conflict (route_id, voter_id, target_id)
  do update set value = excluded.value, updated_at = now();

  select mv.value into v_other
    from public.match_votes mv
   where mv.route_id = p_route_id and mv.voter_id = p_target_id and mv.target_id = v_uid;

  select * into v_conn
    from public.match_connections c
   where c.route_id = p_route_id and c.user_a = v_a and c.user_b = v_b
     for update;

  if p_value = 'like' and v_other = 'like' then
    if v_conn.id is null then
      insert into public.match_connections (route_id, user_a, user_b)
      values (p_route_id, v_a, v_b)
      returning * into v_conn;
      insert into public.match_connection_members (connection_id, user_id)
      values (v_conn.id, v_a), (v_conn.id, v_b);
    elsif not v_conn.is_open then
      update public.match_connections c
         set is_open = true, opened_at = now(), closed_at = null
       where c.id = v_conn.id;
    end if;
    return query select p_value, v_conn.id;
  else
    if v_conn.id is not null and v_conn.is_open then
      perform public.match_close_connection(v_conn.id);
    end if;
    return query select p_value, null::uuid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chats
-- ---------------------------------------------------------------------------
-- Primero lo que espera tu respuesta, luego lo que espera a la otra persona y
-- despues el resto por ultima actividad.
create or replace function public.match_inbox(p_route_id uuid)
returns table (
  connection_id     uuid,
  other_user_id     uuid,
  display_name      text,
  avatar_url        text,
  question_state    text,
  question_asked_by uuid,
  last_kind         text,
  last_sender_id    uuid,
  last_at           timestamptz,
  unread_count      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.match_require_member(p_route_id);
begin
  return query
  select c.id,
         o.id,
         o.display_name,
         o.avatar_url,
         c.question_state,
         c.question_asked_by,
         ultimo.kind,
         ultimo.sender_id,
         coalesce(ultimo.created_at, c.opened_at),
         coalesce((
           select count(*)::integer
             from public.match_messages m
             join public.match_connection_members yo
               on yo.connection_id = m.connection_id and yo.user_id = v_uid
            where m.connection_id = c.id
              and m.sender_id <> v_uid
              and m.created_at > yo.last_read_at
         ), 0)
    from public.match_connections c
    join public.profiles o
      on o.id = case when c.user_a = v_uid then c.user_b else c.user_a end
    join public.match_profiles omp
      on omp.user_id = o.id and omp.is_active
    left join lateral (
      select m.kind, m.sender_id, m.created_at
        from public.match_messages m
       where m.connection_id = c.id
       order by m.created_at desc, m.id desc
       limit 1
    ) ultimo on true
   where c.route_id = p_route_id
     and c.is_open
     and v_uid in (c.user_a, c.user_b)
     and public.is_route_participant(p_route_id, o.id)
   order by (c.question_state = 'pending' and c.question_asked_by is distinct from v_uid) desc,
            (c.question_state = 'pending') desc,
            coalesce(ultimo.created_at, c.opened_at) desc;
end;
$$;

-- Todo lo que la pantalla de chat necesita para saber que se puede hacer.
-- server_now va aparte para que las esperas (30 min, 30 s) se calculen con el
-- reloj del servidor y no con el del movil.
create or replace function public.match_get_connection(p_connection_id uuid)
returns table (
  connection_id        uuid,
  route_id             uuid,
  other_user_id        uuid,
  display_name         text,
  avatar_url           text,
  question_state       text,
  question_asked_by    uuid,
  question_asked_at    timestamptz,
  question_answered_at timestamptz,
  postpone_count       integer,
  my_texts_sent        integer,
  other_texts_sent     integer,
  my_last_buzz_at      timestamptz,
  server_now           timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_conn  public.match_connections%rowtype := public.match_require_connection(p_connection_id, false);
  v_other uuid;
begin
  v_other := case when v_conn.user_a = v_uid then v_conn.user_b else v_conn.user_a end;
  return query
  select v_conn.id,
         v_conn.route_id,
         o.id,
         o.display_name,
         o.avatar_url,
         v_conn.question_state,
         v_conn.question_asked_by,
         v_conn.question_asked_at,
         v_conn.question_answered_at,
         v_conn.postpone_count,
         yo.texts_sent,
         otro.texts_sent,
         yo.last_buzz_at,
         now()
    from public.profiles o
    join public.match_connection_members yo
      on yo.connection_id = v_conn.id and yo.user_id = v_uid
    join public.match_connection_members otro
      on otro.connection_id = v_conn.id and otro.user_id = v_other
   where o.id = v_other;
end;
$$;

-- Mensajes nuevos desde p_after, y marca como leido. El cliente pide con algo
-- de solape y descarta repetidos por id: un mensaje insertado antes puede
-- confirmarse despues de otro, y sin solape el polling se lo saltaria.
create or replace function public.match_fetch_messages(p_connection_id uuid, p_after timestamptz default null)
returns table (
  id            uuid,
  connection_id uuid,
  sender_id     uuid,
  kind          text,
  gif_id        text,
  answer        text,
  body          text,
  created_at    timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_conn public.match_connections%rowtype := public.match_require_connection(p_connection_id, false);
begin
  update public.match_connection_members cm
     set last_read_at = clock_timestamp()
   where cm.connection_id = v_conn.id and cm.user_id = v_uid;

  return query
  select m.id, m.connection_id, m.sender_id, m.kind, m.gif_id, m.answer, m.body, m.created_at
    from public.match_messages m
   where m.connection_id = v_conn.id
     and m.created_at > coalesce(p_after, '-infinity'::timestamptz)
   order by m.created_at, m.id
   limit 500;
end;
$$;

create or replace function public.match_send_gif(p_connection_id uuid, p_gif_id text)
returns setof public.match_messages
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_conn public.match_connections%rowtype := public.match_require_connection(p_connection_id, true);
begin
  if not exists (select 1 from public.match_gifs g where g.id = p_gif_id and g.is_active) then
    raise exception 'GIF_NOT_FOUND' using errcode = 'P0001';
  end if;
  return query
  insert into public.match_messages (connection_id, sender_id, kind, gif_id)
  values (v_conn.id, v_uid, 'gif', p_gif_id)
  returning *;
end;
$$;

-- Un zumbido cada 30 s por persona y conexion. Se comprueba y se gasta en el
-- mismo UPDATE: dos toques seguidos no cuelan dos zumbidos.
create or replace function public.match_send_buzz(p_connection_id uuid)
returns setof public.match_messages
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_conn public.match_connections%rowtype := public.match_require_connection(p_connection_id, true);
begin
  update public.match_connection_members cm
     set last_buzz_at = now()
   where cm.connection_id = v_conn.id
     and cm.user_id = v_uid
     and (cm.last_buzz_at is null or cm.last_buzz_at <= now() - interval '30 seconds');
  if not found then
    raise exception 'BUZZ_TOO_SOON' using errcode = 'P0001';
  end if;
  return query
  insert into public.match_messages (connection_id, sender_id, kind)
  values (v_conn.id, v_uid, 'buzz')
  returning *;
end;
$$;

-- Texto solo tras el Si, y 2 mensajes de hasta 120 caracteres por persona
-- (decision D7). Los textos gastados no vuelven al cerrar y reabrir.
create or replace function public.match_send_text(p_connection_id uuid, p_body text)
returns setof public.match_messages
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_conn public.match_connections%rowtype := public.match_require_connection(p_connection_id, true);
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_conn.question_state <> 'accepted' then
    raise exception 'TEXT_LOCKED' using errcode = 'P0001';
  end if;
  if v_body = '' then
    raise exception 'TEXT_EMPTY' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 120 then
    raise exception 'TEXT_TOO_LONG' using errcode = 'P0001';
  end if;

  update public.match_connection_members cm
     set texts_sent = cm.texts_sent + 1
   where cm.connection_id = v_conn.id
     and cm.user_id = v_uid
     and cm.texts_sent < 2;
  if not found then
    raise exception 'TEXT_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  return query
  insert into public.match_messages (connection_id, sender_id, kind, body)
  values (v_conn.id, v_uid, 'text', v_body)
  returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- La pregunta de la cerveza
-- ---------------------------------------------------------------------------
-- Cualquiera de los dos pregunta; una sola pregunta viva. Tras "dentro de un
-- rato" se puede volver a preguntar pasados 30 min, y como mucho hay 2
-- aplazamientos: despues ya no se pregunta mas en esta pareja (D4, D5).
create or replace function public.match_ask_beer(p_connection_id uuid)
returns setof public.match_messages
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_conn public.match_connections%rowtype := public.match_require_connection(p_connection_id, true);
begin
  if v_conn.question_state = 'pending' then
    raise exception 'QUESTION_ALREADY_PENDING' using errcode = 'P0001';
  end if;
  if v_conn.question_state in ('accepted', 'rejected') then
    raise exception 'QUESTION_ALREADY_ANSWERED' using errcode = 'P0001';
  end if;
  if v_conn.question_state = 'postponed' then
    if v_conn.postpone_count >= 2 then
      raise exception 'QUESTION_LIMIT_REACHED' using errcode = 'P0001';
    end if;
    if now() < v_conn.question_answered_at + interval '30 minutes' then
      raise exception 'QUESTION_TOO_SOON' using errcode = 'P0001';
    end if;
  end if;

  update public.match_connections c
     set question_state = 'pending',
         question_asked_by = v_uid,
         question_asked_at = now()
   where c.id = v_conn.id;

  return query
  insert into public.match_messages (connection_id, sender_id, kind)
  values (v_conn.id, v_uid, 'question')
  returning *;
end;
$$;

-- Solo responde quien recibio la pregunta.
--   yes   -> se desbloquea el texto.
--   later -> se podra volver a preguntar (ver match_ask_beer).
--   no    -> se cierra la conexion y se borra el chat. El voto de quien dice
--            No pasa a No me gusta y el de quien pregunto se queda como estaba
--            (D2): asi no vuelven a conectar al instante.
create or replace function public.match_answer_beer(p_connection_id uuid, p_answer text)
returns table (question_state text, is_open boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_conn  public.match_connections%rowtype := public.match_require_connection(p_connection_id, true);
  v_other uuid;
begin
  if p_answer is null or p_answer not in ('yes', 'no', 'later') then
    raise exception 'INVALID_ANSWER' using errcode = '22023';
  end if;
  if v_conn.question_state <> 'pending' then
    raise exception 'NO_PENDING_QUESTION' using errcode = 'P0001';
  end if;
  if v_conn.question_asked_by = v_uid then
    raise exception 'CANNOT_ANSWER_OWN_QUESTION' using errcode = 'P0001';
  end if;

  v_other := case when v_conn.user_a = v_uid then v_conn.user_b else v_conn.user_a end;

  if p_answer = 'no' then
    update public.match_connections c
       set question_state = 'rejected', question_answered_at = now()
     where c.id = v_conn.id;
    update public.match_votes mv
       set value = 'dislike', updated_at = now()
     where mv.route_id = v_conn.route_id and mv.voter_id = v_uid and mv.target_id = v_other;
    perform public.match_close_connection(v_conn.id);
    return query select 'rejected'::text, false;
    return;
  end if;

  update public.match_connections c
     set question_state = case when p_answer = 'yes' then 'accepted' else 'postponed' end,
         question_answered_at = now(),
         postpone_count = c.postpone_count + case when p_answer = 'later' then 1 else 0 end
   where c.id = v_conn.id;

  insert into public.match_messages (connection_id, sender_id, kind, answer)
  values (v_conn.id, v_uid, 'answer', p_answer);

  return query
  select case when p_answer = 'yes' then 'accepted' else 'postponed' end, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que
-- ---------------------------------------------------------------------------
-- Postgres da EXECUTE a PUBLIC por defecto y Supabase ademas a anon: se quita
-- en todas y se da solo a authenticated en las de la API.
revoke all on function public.is_route_participant(uuid, uuid) from public, anon;
grant execute on function public.is_route_participant(uuid, uuid) to authenticated;

revoke all on function
  public.match_is_active(uuid),
  public.match_require_member(uuid),
  public.match_lock_pair(uuid, uuid, uuid),
  public.match_require_connection(uuid, boolean),
  public.match_close_connection(uuid),
  public.match_save_bio_and_tags(uuid, text, text[])
from public, anon, authenticated;

revoke all on function
  public.match_get_profile(),
  public.match_activate(boolean, text, text[]),
  public.match_deactivate(),
  public.match_update_profile(text, text[]),
  public.match_grid(uuid),
  public.match_vote(uuid, uuid, text),
  public.match_inbox(uuid),
  public.match_get_connection(uuid),
  public.match_fetch_messages(uuid, timestamptz),
  public.match_send_gif(uuid, text),
  public.match_send_buzz(uuid),
  public.match_send_text(uuid, text),
  public.match_ask_beer(uuid),
  public.match_answer_beer(uuid, text)
from public, anon;

grant execute on function
  public.match_get_profile(),
  public.match_activate(boolean, text, text[]),
  public.match_deactivate(),
  public.match_update_profile(text, text[]),
  public.match_grid(uuid),
  public.match_vote(uuid, uuid, text),
  public.match_inbox(uuid),
  public.match_get_connection(uuid),
  public.match_fetch_messages(uuid, timestamptz),
  public.match_send_gif(uuid, text),
  public.match_send_buzz(uuid),
  public.match_send_text(uuid, text),
  public.match_ask_beer(uuid),
  public.match_answer_beer(uuid, text)
to authenticated;

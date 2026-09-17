-- Ruta de Bares - 0006: miniatura de la foto de perfil.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0005.
-- Idempotente: se puede re-ejecutar.
--
-- Por que existe: la grilla de "Tirate una cana" pinta la foto de todas las
-- personas de la ruta a la vez. Hasta ahora la app subia la foto tal cual la
-- saco el movil (medido con fotos reales: ~2,9 MB y 3000+ px de ancho), asi
-- que abrir la pestana en una ruta de 200 personas eran ~574 MB de descarga,
-- cuando la casilla mide 133 pt (400 px en una pantalla de 3x). Ahora la app
-- sube tambien una miniatura de 400 px (~19 KB) y es la que devuelven la
-- grilla, la bandeja de chats y la cabecera del chat.
--
-- avatar_thumb_url puede ser NULL (fotos subidas antes de esta migracion):
-- todo lo que la usa cae en avatar_url, asi que nadie se queda sin foto.

alter table public.profiles add column if not exists avatar_thumb_url text;

-- ---------------------------------------------------------------------------
-- Las funciones que pintan varias fotos a la vez devuelven la miniatura
-- ---------------------------------------------------------------------------
-- Cambia la forma de la tabla devuelta, y eso Postgres no lo deja con
-- create or replace: hay que soltar la funcion antes.
drop function if exists public.match_grid(uuid);

create or replace function public.match_grid(p_route_id uuid)
returns table (
  user_id          uuid,
  display_name     text,
  avatar_url       text,
  avatar_thumb_url text,
  bio              text,
  tag_ids          text[],
  my_vote          text,
  connection_id    uuid,
  unread_count     integer
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
         -- La foto grande sigue viajando: la ficha de la persona se abre desde
         -- la misma fila y la ensena a pantalla completa.
         p.avatar_url,
         coalesce(p.avatar_thumb_url, p.avatar_url),
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

drop function if exists public.match_inbox(uuid);

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
         -- En la lista de chats la foto se ve a 52 pt: la miniatura sobra.
         coalesce(o.avatar_thumb_url, o.avatar_url),
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

drop function if exists public.match_get_connection(uuid);

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
         -- La cabecera del chat la pinta a 36 pt.
         coalesce(o.avatar_thumb_url, o.avatar_url),
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

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que (drop function se lleva por delante los permisos)
-- ---------------------------------------------------------------------------
revoke all on function
  public.match_grid(uuid),
  public.match_inbox(uuid),
  public.match_get_connection(uuid)
from public, anon;

grant execute on function
  public.match_grid(uuid),
  public.match_inbox(uuid),
  public.match_get_connection(uuid)
to authenticated;

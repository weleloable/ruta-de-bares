-- Ruta de Bares - 0011: saber que chats no has abierto nunca.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0010.
-- Idempotente: se puede re-ejecutar sin romper nada.
--
-- Por que existe: la pestana Cana avisa con una burbujita cuando hay algo que
-- mirar, y "hay algo que mirar" incluye una conexion recien abierta, aunque
-- nadie haya escrito todavia. Eso no se podia saber: `unread_count` cuenta
-- mensajes de la otra persona posteriores a tu ultima lectura, y en un chat
-- vacio son cero.
--
-- La pista ya estaba en la tabla: `match_connection_members.last_read_at` vale
-- '-infinity' hasta que abres el chat por primera vez (match_fetch_messages lo
-- pone a la hora real). Solo hacia falta sacarlo.

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
  unread_count      integer,
  never_opened      boolean
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
         ), 0),
         coalesce((
           select yo.last_read_at = '-infinity'::timestamptz
             from public.match_connection_members yo
            where yo.connection_id = c.id and yo.user_id = v_uid
         ), true)
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
     and not public.match_hay_bloqueo(v_uid, o.id)
   order by (c.question_state = 'pending' and c.question_asked_by is distinct from v_uid) desc,
            (c.question_state = 'pending') desc,
            coalesce(ultimo.created_at, c.opened_at) desc;
end;
$$;

revoke all on function public.match_inbox(uuid) from public, anon;
grant execute on function public.match_inbox(uuid) to authenticated;

-- Ruta de Bares - 0051: La Cana ensena quien es moderador (admin).
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0050.
-- Idempotente: se puede re-ejecutar sin romper nada (`drop function if exists`
-- y se vuelve a crear con sus permisos).
--
-- Que hace. `match_grid()` (la lista de gente con La Cana activada en la ruta,
-- que tambien alimenta la ficha) devuelve una columna nueva, `es_admin`: solo
-- un si/no, para pintar la estrella y la etiqueta "Moderador". El rol en si no
-- sale de aqui. Es la `match_grid()` de la 0040 con esa columna al final: nada
-- mas cambia (misma visibilidad, mismos bloqueos, mismo orden).

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
  unread_count     integer,
  es_admin         boolean
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
         ), 0),
         p.role = 'admin'
    from public.match_profiles mp
    join public.match_route_activations a on a.user_id = mp.user_id and a.route_id = p_route_id
    join public.profiles p on p.id = mp.user_id
    left join public.match_votes v
      on v.route_id = p_route_id and v.voter_id = v_uid and v.target_id = p.id
    left join public.match_connections c
      on c.route_id = p_route_id and c.is_open
     and c.user_a = least(v_uid, p.id) and c.user_b = greatest(v_uid, p.id)
   where p.id <> v_uid
     and public.is_route_participant(p_route_id, p.id)
     and not public.match_hay_bloqueo(v_uid, p.id)
   order by (v.value is null) desc, md5(v_uid::text || p.id::text || p_route_id::text);
end;
$$;

revoke all on function public.match_grid(uuid) from public, anon;
grant execute on function public.match_grid(uuid) to authenticated;

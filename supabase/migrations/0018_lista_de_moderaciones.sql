-- Ruta de Bares - 0018: la lista de a quien se ha moderado y que sigue vigente.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0017.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Sus sentencias no dan error al repetirse, pero definen funciones que una
-- migracion POSTERIOR rehizo: volver a pegarla las devuelve a esta version,
-- en silencio y sin avisar. Ya paso una vez (re-ejecutar la 0006 dejo a
-- match_require_target sin la comprobacion de bloqueos, o sea que la gente
-- bloqueada volvia a poder interactuar). Aqui quedan obsoletas:
--   * match_admin_moderaciones() la rehace la 0024
--
-- Por que existe: hasta ahora un veto solo se podia retirar desde el ticket de
-- la denuncia que lo origino. Si esa denuncia se resolvio hace meses, o la
-- persona se borro la cuenta (y con ella la denuncia), el veto se quedaba
-- puesto sin ninguna pantalla desde la que quitarlo. Eso choca con el art. 20
-- del DSA, que da seis meses para reclamar: si nadie puede deshacerlo, el
-- derecho a reclamar no vale nada.
--
-- Ademas no solo interesan los vetos: quien organiza tiene que poder ver de un
-- vistazo a quien se le ha tocado algo -- una foto retirada, una cana apagada,
-- una expulsion -- aunque ya no quede nada vigente. Por eso esta funcion
-- devuelve las dos cosas: lo que sigue puesto (y se puede levantar) y lo que se
-- hizo en su dia (historial, que no se levanta porque ya paso).
--
-- Sustituye a match_admin_bans() de la 0015, que solo listaba vetos y que no
-- llegaron a usar ninguna pantalla.

drop function if exists public.match_admin_bans();

create or replace function public.match_admin_moderaciones()
returns table (
  -- 'cuenta' | 'ruta' | 'cana' son vetos VIGENTES y se pueden levantar;
  -- 'accion' es historial y no se levanta.
  tipo       text,
  -- null si esa persona se borro la cuenta: el nombre se guardo al sancionar.
  user_id    uuid,
  user_name  text,
  route_id   uuid,
  route_name text,
  motivo     text,
  accion     text,
  cuando     timestamptz
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
  select 'cana'::text, mp.user_id, coalesce(p.display_name, '(cuenta borrada)'),
         null::uuid, ''::text, mp.blocked_reason, ''::text, mp.blocked_at
    from public.match_profiles mp
    left join public.profiles p on p.id = mp.user_id
   where mp.blocked_at is not null

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

revoke all on function public.match_admin_moderaciones() from public, anon;
grant execute on function public.match_admin_moderaciones() to authenticated;

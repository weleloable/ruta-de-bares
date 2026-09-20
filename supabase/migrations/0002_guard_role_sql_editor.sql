-- Ruta de Bares - 0002: el SQL Editor y la service_role pueden cambiar roles.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0001.
-- Idempotente: se puede re-ejecutar sin romper nada.
--
-- Por que existe: en la 0001, guard_profile_role() solo deja cambiar `role` si
-- public.is_admin(), que mira auth.uid(). En el SQL Editor no hay JWT, asi que
-- auth.uid() es NULL y el `update ... set role = 'admin'` de docs/SETUP.md
-- fallaba siempre con ROLE_CHANGE_FORBIDDEN: no habia forma de crear el primer
-- admin. No se edita la 0001 porque puede estar ya aplicada en produccion.
--
-- El trigger on_profile_update NO se toca: sigue apuntando a esta funcion por
-- nombre, y `create or replace` cambia el cuerpo sin desactivarlo ni un instante.

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Rol con el que entro la peticion. Ojo: dentro de SECURITY DEFINER
  -- `current_user` es el duenio de la funcion (postgres), no quien llama, asi
  -- que no sirve para esto. `current_setting('role')` si conserva el SET ROLE
  -- de quien llama: vale 'none' si nadie hizo SET ROLE.
  v_rol_peticion text := current_setting('role');
  v_backend      boolean;
begin
  -- Quien puede cambiar `role` sin ser admin, y por que cada via es segura:
  --
  -- 1) service_role. PostgREST se conecta como `authenticator` y en cada
  --    peticion hace SET ROLE al rol que dice el JWT firmado; si no hay JWT,
  --    a `anon`. Solo un JWT firmado con el secreto del proyecto (la clave
  --    secreta / service_role, que nunca sale del panel ni de las Edge
  --    Functions) produce role = 'service_role'. Ese rol ya salta RLS entero,
  --    asi que dejarle cambiar `role` no le da nada que no tuviera.
  --    https://docs.postgrest.org/en/stable/references/auth.html#user-impersonation
  --    https://supabase.com/docs/guides/database/postgres/roles
  --
  --    Se mira el GUC `role` y NO request.jwt.claims ->> 'role' a proposito:
  --    request.jwt.claims es un parametro personalizado que cualquier rol puede
  --    escribir con set_config() sin privilegio ninguno; `role` exige ser
  --    miembro del rol destino, y Postgres prohibe cambiarlo dentro de una
  --    funcion SECURITY DEFINER ("cannot set parameter role within
  --    security-definer function"), asi que ninguna RPC puede fabricarlo.
  --
  -- 2) Conexion directa de un superusuario de Supabase sin identidad de
  --    usuario: el SQL Editor del panel ejecuta como `postgres` (lo dice la
  --    doc de roles citada arriba), sin SET ROLE y sin JWT. Las tres
  --    condiciones hacen falta a la vez:
  --    - session_user in (postgres, supabase_admin): session_user es con quien
  --      se abrio la conexion y SECURITY DEFINER no lo cambia. Una peticion de
  --      la API siempre tiene session_user = authenticator, y Auth/Storage
  --      tienen sus propios usuarios (supabase_auth_admin, ...), que quedan
  --      fuera. Tener la contrasenia de `postgres` ya es ser duenio de la base.
  --    - rol 'none': si el SQL Editor esta suplantando a un usuario (selector
  --      de rol del panel -> SET ROLE authenticated), se comporta como la app
  --      y el cambio se rechaza, que es lo que se quiere probar al suplantar.
  --    - auth.uid() is null: sin usuario final en juego. Si hay un sub en los
  --      claims, manda is_admin() como para cualquier usuario.
  v_backend :=
    v_rol_peticion = 'service_role'
    or (
      v_rol_peticion = 'none'
      and session_user in ('postgres', 'supabase_admin')
      and auth.uid() is null
    );

  if new.role is distinct from old.role
     and not public.is_admin()
     and not v_backend then
    raise exception 'ROLE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

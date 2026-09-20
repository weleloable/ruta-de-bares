-- Ruta de Bares - 0023: el bucket de fotos deja de ser publico.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0022.
-- Idempotente: se puede re-ejecutar.
--
-- ¡ORDEN IMPORTANTE! Desplegar ANTES la web (o la build de EAS) que firma las
-- URL, y pegar esto DESPUES. Al revés, una version vieja del cliente pide
-- `.../object/public/avatars/...` a un bucket que ya no sirve nada, y todo el
-- mundo se queda sin fotos hasta que actualice. Al derecho no se rompe nada: el
-- cliente nuevo firma, y firmar funciona igual con el bucket publico.
--
-- Por que existe. `avatars` era `public = true`, o sea que Storage servia
-- cualquier fichero por su URL SIN mirar ninguna policy. Comprobado: abriendo la
-- foto de alguien sin sesion y sin clave devolvia `200 image/jpeg`. Y no habia
-- que adivinar la URL: la cuadricula de la cana las reparte, asi que cualquiera
-- que este (o haya estado) en una ruta tenia una lista de enlaces permanentes a
-- las caras de todos los demas, que ademas sobrevivian al borrado de la cuenta.
-- Era el unico agujero explotable por alguien SIN cuenta.
--
-- Como queda. El bucket pasa a privado y la foto se pide con una URL FIRMADA de
-- vida corta (15 min, `createSignedUrl` desde el cliente). Firmar SI pasa por la
-- policy de abajo, asi que quien decide es Postgres, como todo lo demas de esta
-- app. No hace falta ninguna Edge Function: la regla se puede escribir en SQL.
--
-- La parte delicada: NO reabrir lo que cerro la 0020. Esa migracion acoto
-- `avatars_read` a la carpeta propia porque la API de Storage aplica esa policy
-- al LISTAR, y con `to public` cualquiera con la clave publicable enumeraba los
-- nombres de las fotos PENDIENTES de todo el mundo. Si aqui se abriera la
-- lectura a "la carpeta de alguien de mi ruta" a secas, eso volveria: un
-- companero podria listar tu carpeta y ver la foto que mandaste a revision y la
-- que te rechazaron.
--
-- Por eso la regla no habla de carpetas sino de FICHEROS CONCRETOS: de otra
-- persona solo se lee el fichero que es HOY su foto aprobada (o su miniatura),
-- el que apunta `profiles.avatar_url` / `avatar_thumb_url`. Lo pendiente, lo
-- rechazado y lo sustituido siguen siendo ilegibles para cualquiera que no sea
-- su duenio o un admin. Listar la carpeta de un companero devuelve, como mucho,
-- esas dos fotos, que son las que ya se le ven en la app.
--
-- Los admins leen todo: tienen que poder revisar una foto pendiente
-- (`app/admin/foto/`), que es justo lo que nadie mas puede ver.
--
-- Lo que NO cambia, a proposito: `profiles.avatar_url` sigue guardando la URL
-- con forma `.../object/public/avatars/<ruta>`, que ya no descarga nada. Pasa a
-- ser un IDENTIFICADOR del que el cliente saca la ruta para firmar
-- (`rutaDesdeUrlPublica`, el unico sitio que conoce ese formato). Cambiar el
-- formato obligaria a tocar la validacion de `avatar_admin_decide` (0020) y a
-- migrar las filas existentes; no compensa hoy.

-- ---------------------------------------------------------------------------
-- Quien puede leer que fichero
-- ---------------------------------------------------------------------------
-- Interna, no se llama desde la API: ¿el fichero `p_name` es la foto aprobada (o
-- la miniatura) de alguien con quien comparto ruta?
--
-- Se compara con right() y no con LIKE porque '_' es un comodin de LIKE y
-- aparece en las rutas, igual que razona `avatar_url_coincide` (0020).
create or replace function public.avatar_visible_para_mi(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
      join public.route_members suyo on suyo.user_id = p.id
      join public.route_members mio  on mio.route_id = suyo.route_id
     where mio.user_id = auth.uid()
       and p.id::text = (storage.foldername(p_name))[1]
       and (
            (p.avatar_url is not null
             and right(p.avatar_url, length(p_name)) = p_name)
         or (p.avatar_thumb_url is not null
             and right(p.avatar_thumb_url, length(p_name)) = p_name)
       )
  );
$$;

-- `security definer` porque lee route_members y profiles, y el USING de una
-- policy se evalua como el rol que consulta: sin esto, `authenticated` no ve las
-- filas de route_members de los demas y el join sale vacio siempre. Es el mismo
-- motivo por el que la 0012 hizo definer a `is_route_participant`.
--
-- Y por eso mismo hay que CONCEDERLE ejecucion a `authenticated`: el USING corre
-- como el, asi que revocarsela deja la policy fallando con "permission denied"
-- para todo el mundo (lo cazo el test al escribirla). Que se pueda llamar
-- suelta no da nada nuevo: responde "¿este fichero es la foto que ya se le ve a
-- alguien de mi ruta?", y esas URL se las reparte la propia cuadricula. Probar
-- nombres al azar no sirve, llevan 12 caracteres aleatorios.
revoke all on function public.avatar_visible_para_mi(text) from public, anon;
grant execute on function public.avatar_visible_para_mi(text) to authenticated;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      -- La tuya, toda: incluidas las pendientes y las rechazadas.
      (storage.foldername(name))[1] = auth.uid()::text
      -- Un admin lo ve todo: sin esto no puede revisar una foto pendiente.
      or public.is_admin()
      -- De los demas, solo la foto que ya se les ve en la app.
      or public.avatar_visible_para_mi(name)
    )
  );

-- ---------------------------------------------------------------------------
-- Y el interruptor
-- ---------------------------------------------------------------------------
-- Una linea, y reversible (`set public = true` lo deshace). Es donde se
-- comprueba si quedo algun sitio del cliente pidiendo la URL publica: si algo
-- se ve sin foto tras aplicar esto, es eso.
update storage.buckets set public = false where id = 'avatars';

# Backend (Supabase)

Todo el backend de Ruta de Bares vive en un proyecto de [Supabase](https://supabase.com)
(Postgres + Auth + API autogenerada). No hay servidor propio que mantener.

## Por qué Supabase

El dominio es relacional (rutas → bares → sellos, con reglas de permiso por
fila: admin ve todo, usuario ve la ruta activa y el progreso del grupo) y eso
encaja de forma natural con Postgres + Row Level Security, sin tener que
traducir esas reglas a reglas de Firestore. Además da auth, API REST/RPC
autogenerada y realtime en un único proyecto gratuito, así que no hace falta
escribir ni desplegar un backend propio para esta app. Alternativa
descartada: Firebase/Firestore — mismo coste de entrada, pero un modelo NoSQL
que hace más torpe expresar "el admin puede escribir, el grupo solo lee su
propio progreso" y no da SQL para las consultas de progreso agregado.

## Poner en marcha un proyecto nuevo

1. Crea un proyecto en [supabase.com](https://supabase.com/dashboard) (plan gratuito de sobra para esto).
2. En **SQL Editor**, pega y ejecuta el contenido de
   [`migrations/0001_init.sql`](migrations/0001_init.sql). Crea las tablas,
   las policies de RLS y la función `redeem_stamp`.
3. En **Project Settings → API**, copia `Project URL` y `anon public key` a
   tu `.env` (ver `.env.example` en la raíz del repo).
4. En **Authentication → Providers**, deja Email activado (es el que usa la
   app). Si no quieres exigir confirmación por correo durante las pruebas,
   desactiva "Confirm email" en Authentication → Settings.

## Convertir tu cuenta en administrador

El primer usuario que se registra es un usuario normal (`role = 'user'`), a
propósito: no hay ningún email hardcodeado en el esquema. Para convertirte en
admin, regístrate desde la app y luego, en el **SQL Editor** de Supabase:

```sql
update public.profiles set role = 'admin' where email = 'tu-email@ejemplo.com';
```

Cierra sesión y vuelve a entrar en la app para que se recargue tu perfil (verás
la pestaña "Admin").

## Modelo de datos

- `routes` — una fila por año. `is_active` marca la que ven los usuarios.
- `bars` — bares de una ruta, con horario y posición. Solo los admins pueden
  leer/escribir esta tabla directamente (tiene `qr_secret`). Los usuarios
  normales leen `bars_public`, una vista sin esa columna.
- `seals` — un sello por `(bar_id, user_id)`. Nadie inserta en esta tabla
  directamente: todo pasa por `redeem_stamp(route_id, bar_id, secret)`, que
  valida el secreto escaneado del QR en el servidor antes de sellar.
- `profiles` / `profiles_public` — igual patrón: la tabla completa (con
  email y rol) es privada; la vista pública solo expone el nombre, para que
  el grupo pueda ver el progreso de los demás sin ver su email.

Ver los comentarios en [`migrations/0001_init.sql`](migrations/0001_init.sql)
para el razonamiento de cada policy.

## Cómo se genera y valida un sello

1. Un admin crea un bar en la app: se genera `qr_secret` automáticamente
   (`gen_random_bytes(16)`).
2. En la pantalla "QR" del admin, la app codifica
   `{ v: 1, routeId, barId, secret }` en base64 y lo pinta como QR
   (`src/screens/admin/AdminBarQrScreen.tsx`). Ese QR se imprime y se deja en
   el bar.
3. Un usuario escanea el QR con la pestaña "Sellar". La app decodifica el
   payload (`src/lib/qr.ts`) y llama a `redeem_stamp`.
4. `redeem_stamp` (SECURITY DEFINER) comprueba que el bar pertenece a la ruta
   activa y que el secreto coincide, y si es así inserta el sello. Es
   idempotente: escanear dos veces el mismo QR no falla ni duplica.

Si necesitas invalidar el QR de un bar (se ha filtrado o impreso mal),
regenera el secreto a mano en el SQL Editor:

```sql
update public.bars set qr_secret = encode(gen_random_bytes(16), 'hex') where id = '<bar-id>';
```

y vuelve a generar/imprimir su QR desde la app.

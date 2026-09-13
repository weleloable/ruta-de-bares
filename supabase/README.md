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
   las policies de RLS y la función `check_in`.
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
  Un trigger impide activarla con menos de 5 bares.
- `bars` — entre 5 y 20 bares por ruta (un trigger impide superar 20), con
  horario y posición GPS. Solo los admins pueden leer/escribir esta tabla
  directamente (para poder montar rutas de años futuros sin activarlas).
  Los usuarios normales leen `bars_public`.
- `seals` — un sello por `(bar_id, user_id)`. Nadie inserta en esta tabla
  directamente: todo pasa por `check_in(route_id, bar_id, lat, lng)`, que
  recalcula la distancia real en el servidor antes de sellar.
- `profiles` / `profiles_public` — la tabla completa (con email y rol) es
  privada; la vista pública solo expone el nombre, para que el grupo pueda
  ver el progreso de los demás sin ver su email.

Ver los comentarios en [`migrations/0001_init.sql`](migrations/0001_init.sql)
para el razonamiento de cada policy.

## Cómo se valida un sello (check-in por GPS)

1. Con la pestaña "Sellar" abierta, la app pide permiso de ubicación y
   vigila la posición del móvil (`src/screens/CheckInScreen.tsx`).
2. En cada actualización de posición, calcula la distancia a cada bar de la
   ruta (`src/lib/geo.ts`) y si está dentro de su horario
   (`src/lib/schedule.ts`). Esto es solo para pintar el feedback en
   pantalla ("a 34m", "fuera de horario"): no basta para sellar.
3. Cuando un bar está a &lt;=10m y dentro de su horario, la app llama a
   `check_in(route_id, bar_id, lat, lng)` con las coordenadas que acaba de
   leer del GPS.
4. `check_in` (SECURITY DEFINER) **recalcula la distancia con sus propios
   cálculos**, usando la posición del bar guardada en la base de datos y
   las coordenadas recibidas — nunca confía en que el cliente diga "estoy
   cerca". También comprueba la hora local (`Europe/Madrid`) contra el
   horario del bar. Solo si ambas condiciones se cumplen, sella. Es
   idempotente: entrar dos veces en el radio del mismo bar no duplica ni
   falla.

**Límite conocido**: el servidor no puede verificar que las coordenadas que
manda el móvil son reales — una app de ubicación falsa (mock location)
podría saltarse el check. Es una limitación aceptada para una ruta de
grupo, no un sistema anti-fraude; el check-in solo funciona con la app en
primer plano (ver limitaciones de ubicación en segundo plano de Expo más
abajo).

## Por qué solo funciona en primer plano

El sellado por GPS necesita la pestaña "Sellar" abierta: Expo Go no permite
registrar tareas de ubicación en segundo plano, y hacerlo en un build
propio exigiría el permiso "ubicación todo el tiempo" (mucha fricción para
los usuarios) y gastaría más batería. Si más adelante hace falta sellar con
la app cerrada, la vía es un build nativo con EAS Build + `expo-task-manager`
+ `Location.startLocationUpdatesAsync`, y volver a evaluar el permiso con
Julien antes de pedirlo.

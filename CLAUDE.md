@AGENTS.md

# Ruta de Bares — contexto rapido

App movil (Expo/React Native) para organizar una ruta de bares tipo "compostelana":
cada bar de la ruta tiene un hueco que se sella al llegar. Solo se entra por
invitacion, no hay registro abierto. Detalle completo en [README.md](README.md)
y [docs/SETUP.md](docs/SETUP.md) — esto es el resumen para arrancar rapido.

## Funcionalidades clave

- **4 pestanas** (`app/(tabs)/`): Sellos (compostelana), Ruta (mapa Google con
  los bares numerados y el trazado), Editor (solo admins: crear rutas, anadir
  bares, horarios, publicar), Mi perfil (+ panel de invitaciones para admins).
- **Sellar un bar** exige tres cosas a la vez: ruta publicada, dentro de la
  ventana horaria del bar, y dentro del radio (`radius_m`) por geocerca
  haversine. Las tres se comprueban **en el servidor** (`claim_stamp` en
  Postgres); el cliente (`src/features/stamps/rules.ts`) es solo un espejo
  para la UI ("te faltan 40 m"), nunca la autoridad.
- **Invitaciones de un solo uso**: un admin genera un link desde el panel;
  la DB guarda el sha256 del token, nunca el token. El canje usa `UPDATE ...
  WHERE used_at IS NULL` para que dos aperturas simultaneas no den dos cuentas.
- **Admins se crean a mano en Supabase**, nunca desde una pantalla de la app
  (no hay superficie de ataque para escalar privilegio).

## Stack

- Expo SDK 57 + React Native 0.86 + TypeScript estricto. **Docs versionadas**:
  https://docs.expo.dev/versions/v57.0.0/ — Expo cambio mucho, no uses memoria
  de versiones anteriores (ver [AGENTS.md](AGENTS.md)).
- Expo Router para navegacion (la carpeta `app/` ES el mapa de rutas).
- Supabase: Postgres + RLS, Auth, Storage, Edge Functions (Deno).
- react-native-maps con Google Maps (modulo nativo → no funciona en Expo Go,
  hace falta development build via EAS).
- Sesion en `expo-secure-store`, troceada a mano (ver mas abajo, decisiones raras).

## Estructura

```
app/                      pantallas (Expo Router)
  (auth)/                 login, canje de invitacion
  (tabs)/                 las 4 pestanas
  editor/[routeId]/       lista de bares de una ruta + formulario de bar
src/
  features/<dominio>/     reglas + llamadas a datos + componentes por dominio
                           (auth, routes, stamps, invites, profile)
  components/             UI compartida (StampSeal, ui.tsx)
  lib/                    cliente Supabase, secure-session-store, tema, fechas
  types/database.ts       espejo TS del esquema SQL
supabase/
  migrations/0001_init.sql  tablas, RLS, claim_stamp, bucket avatars
  migrations/0002_*.sql     el SQL Editor y service_role pueden cambiar roles
  functions/                create-invite, redeem-invite (Edge Functions)
docs/SETUP.md             puesta en marcha completa + checklist de verificacion
tests/                    tests que no encajan en un feature (p.ej. migration.test.ts)
```

Tablas: `profiles`, `routes`, `route_bars`, `stamps`, `invites`. Todas con RLS.

## Comandos

```bash
npm install
cp .env.example .env                # EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY / _GOOGLE_MAPS_API_KEY
npx expo start --dev-client         # Expo Go NO sirve (mapa nativo)

npm run check           # typecheck + tests + check:functions — correr antes de cualquier PR
npm test                # node --test sobre src/**/*.test.ts y tests/**/*.test.ts, sin Jest
npm run typecheck       # tsc --noEmit (app) + tsconfig.tests.json
npm run check:functions # typecheck de las Edge Functions con Deno (via npx)
npm run doctor          # expo-doctor

eas build --profile development --platform android   # development build (obligatorio por el mapa nativo)
eas env:set --name EXPO_PUBLIC_... --environment development   # las env vars no viajan solas a EAS
supabase functions deploy redeem-invite --no-verify-jwt        # obligatorio en esta funcion, no es un fallo
```

Deploy = 1) pegar en el SQL Editor de Supabase cada fichero de
`supabase/migrations/` en orden (`0001_init.sql`, `0002_guard_role_sql_editor.sql`),
2) desplegar las dos Edge Functions, 3) build con EAS. Paso a paso
en [docs/SETUP.md](docs/SETUP.md).

## Convenciones

- **Instalar dependencias siempre con `npx expo install <paquete>`**, nunca
  `npm install <paquete>` (ver "decisiones raras" — choque de versiones de React).
- Comentarios en español, explican el **por qué**, no el qué. Se documenta el
  motivo de un guardarraíl o un orden de operaciones, no lo obvio.
- Tests colocados junto al codigo (`archivo.ts` + `archivo.test.ts`), no en un
  directorio `__tests__/` aparte. `node --test` directo sobre `.ts`, sin Jest
  ni Babel — Node borra los tipos solo.
- Estructura por dominio en `src/features/<dominio>/`: `api.ts` (llamadas a
  Supabase), `*.ts` (reglas puras, testeables sin red), componentes si hacen falta.
- **El servidor manda.** Cualquier regla de negocio con dinero/seguridad de por
  medio (sellar, invitar) vive primero en SQL; la copia en TypeScript es solo
  para la UI y debe decir explícitamente que es un espejo (ver `rules.ts`).
- Rutas de import con alias `@/*` → `src/*` (`tsconfig.json`).

## Decisiones raras / workarounds (ir anotando aqui las nuevas)

- **`react-dom` fijado a `19.2.3` en `overrides`**: `expo-router` arrastra
  `react-dom` para soporte web, y la resolución normal de npm elige una
  versión que pide `react@^19.3.0`, incompatible con el `react@19.2.3` que
  fija Expo 57. Por eso además `npm install <paquete>` suelto rompe con
  ERESOLVE — hay que usar `npx expo install`.
- **Sesion de Supabase troceada en `expo-secure-store`** (`src/lib/secure-session-store.ts`):
  SecureStore avisa (y en Android puede fallar) por encima de 2048 bytes por
  valor, y una sesión de Supabase los supera. Se parte en trozos de 1800 bytes
  y se escribe un manifiesto **al final**: si la app muere a mitad de escritura,
  el manifiesto sigue apuntando a la sesión completa anterior o no existe,
  nunca a una sesión a medio escribir.
- **`app.config.ts` en vez de `app.json`**: la API key de Google Maps se lee
  de `process.env` para que nunca quede hardcodeada en git.
- **`redeem-invite` se despliega con `--no-verify-jwt`**: quien canjea una
  invitación todavía no tiene cuenta, así que no puede tener JWT. No es un
  agujero — la autorización real es el token de un solo uso, validado por su
  sha256 contra la tabla `invites` dentro de la función.
- **Claves de Supabase en formato nuevo** (`sb_publishable_...` / `sb_secret_...`),
  no el antiguo `anon`/`service_role`. Ver equivalencia en `docs/SETUP.md`.
- **`guard_profile_role` deja cambiar `role` al SQL Editor y a la `service_role`**
  (`0002_guard_role_sql_editor.sql`): `is_admin()` mira `auth.uid()`, que es
  NULL en el SQL Editor, y sin esta via no se podia crear el primer admin. Se
  decide por `current_setting('role')` + `session_user`, nunca por
  `request.jwt.claims` (cualquiera lo escribe con `set_config`). Probado contra
  Postgres real en `tests/migration-0002.test.ts` (PGlite).
- **Deploy de migraciones = pegar cada fichero de `supabase/migrations/` en
  orden** en el SQL Editor. No se edita una migracion ya publicada: se anade la
  siguiente.
- **`tests/migration.test.ts` parsea el SQL real** con `pg-query-emscripten`
  (el parser de Postgres compilado a wasm) para comprobar invariantes de RLS
  y de `claim_stamp` que no se pueden perder por un refactor descuidado.

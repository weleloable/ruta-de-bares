@AGENTS.md

# Ruta de Bares — contexto rapido

App movil (Expo/React Native) para organizar una ruta de bares tipo "compostelana":
cada bar de la ruta tiene un hueco que se sella al llegar. Solo se entra por
invitacion, no hay registro abierto. Detalle completo en [README.md](README.md)
y [docs/SETUP.md](docs/SETUP.md) — esto es el resumen para arrancar rapido.

## Funcionalidades clave

- **Pestanas** (`app/(tabs)/`): Sellos (compostelana), Ruta (mapa con los
  bares numerados y el trazado: Google en nativo, OpenStreetMap en web), Editor
  (solo admins: crear rutas, anadir bares tocando el mapa, horarios, publicar),
  Mi perfil (+ editor de rutas y panel de invitaciones para admins).
- **App instalable (PWA)**: la web se instala desde el navegador en Android e
  iPhone, sin APK ni tienda. Ver seccion 8 de `docs/SETUP.md`.
- **Sellar un bar** exige cuatro cosas a la vez: ser miembro de la ruta, ruta
  publicada, dentro de la ventana horaria del bar, y dentro del radio
  (`radius_m`) por geocerca haversine. Las cuatro se comprueban **en el
  servidor** (`claim_stamp` en Postgres); el cliente
  (`src/features/stamps/rules.ts`) es solo un espejo para la UI ("te faltan
  40 m"), nunca la autoridad.
- **El alta es abierta y las invitaciones son POR RUTA** (migracion 0004).
  Cualquiera se registra; una cuenta nueva no ve NADA hasta que canjea una
  invitacion a una ruta concreta (`route_members`). Un enlace sirve para varias
  personas hasta agotar `max_uses` o caducar (2/4/8 h). Todo vive en Postgres:
  `create_route_invite()` y `redeem_route_invite()`, sin Edge Functions.
  El canje bloquea la fila con `FOR UPDATE` para que dos simultaneos no se
  salten el tope, y es idempotente (canjear dos veces no gasta dos plazas).
- **El token de invitacion se guarda EN CLARO**, al contrario que las viejas
  invitaciones de cuenta. Es deliberado: el historial tiene que poder volver a
  enseñar el enlace. Lo unico que los protege es la policy `route_invites_admin`,
  asi que esa policy es critica y tiene test propio.
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
- En web: Leaflet + react-leaflet con teselas de OpenStreetMap (sin clave), y
  PWA con `public/manifest.json` y `public/sw.js`. Se publica en GitHub Pages
  en cada push a `master` (`.github/workflows/deploy-web.yml`).
- Sesion en `expo-secure-store`, troceada a mano (ver mas abajo, decisiones raras).

## Estructura

```
app/                      pantallas (Expo Router)
  (auth)/                 login, registro (alta abierta)
  (tabs)/                 Sellos, Ruta y Cana; Perfil sin boton abajo
  cana/                   presentacion, ficha, chat, bloqueados, mis datos, condiciones
  invitacion.tsx          canje de una invitacion a una ruta (publica: ver AuthGate)
  invitaciones.tsx        panel de admin para crear invitaciones
  editor/[routeId]/       lista de bares de una ruta + formulario de bar
src/
  features/<dominio>/     reglas + llamadas a datos + componentes por dominio
                           (auth, routes, stamps, invites, profile, pwa)
  components/             UI compartida (StampSeal, ui.tsx, RutaMapa, SelectorPosicion
                           con variantes .web.tsx)
  lib/                    cliente Supabase, secure-session-store, tema, fechas,
                           coordenadas y encuadre (logica pura del mapa), mapaWeb (Leaflet)
  types/database.ts       espejo TS del esquema SQL
public/                   solo web: index.html, manifest.json, sw.js, icons/
supabase/
  migrations/0001_init.sql  tablas, RLS, claim_stamp, bucket avatars
  migrations/0002_*.sql     el SQL Editor y service_role pueden cambiar roles
  migrations/0003_*.sql     nombre visible unico, sin espacios, <= 30 caracteres
  migrations/0004_*.sql     invitaciones POR RUTA + alta abierta + route_members
  migrations/0005_*.sql     "Tirate una cana": tablas match_* y sus funciones
  migrations/0006_*.sql     la cana sin No me gusta: Me gusta y Visto
  migrations/0007_*.sql     miniatura de la foto de perfil para las listas
  migrations/0008_*.sql     la cana se queda solo con la pregunta de la cerveza
  migrations/0009_*.sql     bloquear y denunciar, con el contrato del panel de admins
  migrations/0010_*.sql     consentimiento guardado, y descargar o borrar tus datos
  migrations/0011_*.sql     saber que chats no has abierto nunca (burbujita)
  migrations/0012_*.sql     la cana usa route_members en vez de la regla provisional
                            (NO hay Edge Functions: todo son funciones de Postgres)
docs/SETUP.md             puesta en marcha completa + checklist de verificacion
tests/                    tests que no encajan en un feature (p.ej. migration.test.ts)
```

Tablas: `profiles`, `routes`, `route_bars`, `stamps`, `route_invites`,
`route_members`. Todas con RLS. (`invites`, de 0001, la borra la 0004.)

## Comandos

```bash
npm install
cp .env.example .env                # EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY / _GOOGLE_MAPS_API_KEY
npx expo start --dev-client         # Expo Go NO sirve (mapa nativo)

npm run check           # typecheck + tests — correr antes de cualquier PR
npm test                # node --test sobre src/**/*.test.ts y tests/**/*.test.ts, sin Jest
npm run typecheck       # tsc --noEmit (app) + tsconfig.tests.json
npm run doctor          # expo-doctor

eas build --profile development --platform android   # development build (obligatorio por el mapa nativo)
eas env:set --name EXPO_PUBLIC_... --environment development   # las env vars no viajan solas a EAS
```

Deploy = 1) pegar en el SQL Editor de Supabase cada fichero de
`supabase/migrations/` en orden (`0001_init.sql`, `0002_guard_role_sql_editor.sql`,
`0003_nombre_unico.sql`, `0004_invitaciones_por_ruta.sql` — esta ultima borra la
tabla `invites` y cambia quien ve que, leer su cabecera antes),
2) activar el registro publico en Supabase Auth (lo exige la 0004), 3) build con
EAS. Ya no hay Edge Functions que desplegar. Paso a paso en
[docs/SETUP.md](docs/SETUP.md).

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

- **"Tirate una cana"** (`docs/TIRATE-UNA-CANA.md`, migraciones 0005 a 0012):
  tinder cervecero por ruta, en la pestana Cana. Las tablas `match_*` no tienen
  privilegios para la app y todo pasa por funciones `SECURITY DEFINER`, asi que
  un `supabase.from('match_votes')` ni compila. Ni los admins leen los chats.
- **La cana pregunta por la pertenencia con `is_route_participant(ruta, persona)`**
  (0012): la 0004 del remoto decide con `route_members` y expone
  `is_route_member(ruta)`, que mira `auth.uid()`; la cana necesita preguntar
  tambien por otras personas (pintar la grilla, votar, abrir un chat), asi que
  conserva la firma de dos argumentos y lee la misma tabla.

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
- **Las invitaciones no usan Edge Functions, son funciones de Postgres**
  (`0004`): `create_route_invite()` genera el token con `gen_random_bytes(32)`
  de pgcrypto y `redeem_route_invite()` lo canjea. Se hizo así porque quita una
  pieza entera del despliegue (ya no hace falta la CLI de Supabase ni Deno) y
  porque la regla vive donde manda. Verificado que PGlite soporta pgcrypto, así
  que se puede probar contra Postgres real en los tests.
- **El token de invitación se guarda en claro y su única protección es la RLS**
  (`0004`): hacía falta para que el historial pueda volver a enseñar el enlace.
  Es un cambio consciente respecto a las invitaciones de cuenta de `0001`, que
  guardaban el sha256; entonces una fuga repartía CUENTAS, ahora como mucho deja
  colarse en una ruta unas horas y ocupando plaza del tope.
- **El enlace de invitacion es una URL https de la web, no un deep link**
  (`buildInviteUrl` en `src/features/invites/link.ts`,
  `https://weleloable.github.io/ruta-de-bares/invitacion?token=...`).
  `rutadebares://` no es pulsable en todos los chats y no abre nada sin la app
  nativa; https abre siempre la PWA. NO abre la app nativa: Android exige
  `assetlinks.json` en la raiz del dominio y una pagina de proyecto de Pages no
  lo controla. `WEB_APP_URL` debe coincidir con `WEB_BASE_URL` del workflow
  (lo vigila `tests/deploy-web.test.ts`). El token pendiente de quien abre el
  enlace sin sesion se refleja en `localStorage` (24 h, un solo uso) porque
  confirmar el correo recarga la pagina y la memoria del modulo se pierde.
  `AuthGate` solo LEE el pendiente (su efecto se repite con cada evento de
  sesion de supabase-js; consumirlo ahi lo perdia); lo borra `/invitacion`.
  Requiere que la Site URL de Supabase Auth sea la web (ver `docs/SETUP.md`).
- **`redeem_route_invite()` bloquea la fila con `FOR UPDATE`**: sin eso, dos
  canjes simultáneos leen el mismo recuento y el tope de plazas se pasa por uno.
  Ojo: eso NO está probado, PGlite es de una sola conexión y no puede abrir dos
  transacciones a la vez. Está anotado como tal en `tests/migration-0004.test.ts`.
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
- **Nombre visible unico** (`0003_nombre_unico.sql`): sin distinguir
  mayusculas, sin espacios, <= 30 caracteres. La parte delicada no es la regla
  sino que el alta no falle si el nombre por defecto (el prefijo del email, o
  el que se escribe en la invitacion) ya esta cogido: `handle_new_user` corre
  en la misma transaccion que la creacion de la cuenta, asi que un choque ahi
  tumbaria el alta entera. En vez de eso el propio trigger prueba "-2", "-3"...
  hasta encontrar uno libre. Probado contra Postgres real (PGlite) en
  `tests/migration-0003.test.ts`.
- **Mapa web con Leaflet + OpenStreetMap, nativo con Google** (`*.web.tsx` +
  `src/lib/mapaWeb.ts`): Leaflet toca `window` al importarse y tumbaria la app
  nativa. Solo se importa desde variantes `.web.*`; lo vigila
  `tests/leaflet-solo-web.test.ts`. La atribucion de OSM va en la cabecera de
  la pestana Ruta porque el carrusel tapa las esquinas del mapa.
- **Cuando se reencuadra el mapa lo decide `crearControlEncuadre`**
  (`src/lib/encuadre.ts`): nunca con el mapa oculto (pestana en `display:none`),
  nunca al volver a la pestana sin algo pendiente, y las medidas de cabecera y
  carrusel solo encuadran la primera vez. `ruta.tsx` mide ALTOS, no posiciones
  (en web `onLayout` no avisa si un elemento solo se mueve) e ignora lecturas de
  0. Dos redes: `npm run verificar:web` monta el mapa web en Chrome headless y
  mide en pixeles que no se mueve (la prueba de verdad, ~1 min, correr antes de
  subir cambios al mapa); `tests/encuadre-cableado.test.ts` es una red rapida y
  PARCIAL que lee el codigo en cada commit (la unica automatica para nativo).
- **PWA: el service worker (`public/sw.js`) NO cachea la app**, solo una pagina
  de "sin conexion": cachear HTML/JS deja a la gente en la version vieja tras
  cada despliegue. Subir `VERSION` al cambiarlo.
- **Manifest e icono de iOS se enlazan en tiempo de ejecucion**
  (`src/lib/pwa.web.ts`), no en `public/index.html`: Expo no reescribe
  ese fichero con `experiments.baseUrl`, y la ruta difiere entre localhost (`/`)
  y GitHub Pages (`/ruta-de-bares/`).
- **Export web local en Windows**: `MSYS_NO_PATHCONV=1` delante de
  `WEB_BASE_URL=/ruta-de-bares`, o la shell de Windows lo convierte en una ruta de disco.
- **`tests/migration.test.ts` parsea el SQL real** con `pg-query-emscripten`
  (el parser de Postgres compilado a wasm) para comprobar invariantes de RLS
  y de `claim_stamp` que no se pueden perder por un refactor descuidado.

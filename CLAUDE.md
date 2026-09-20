@AGENTS.md

# Ruta de Bares — contexto rapido

App movil (Expo/React Native) para organizar una ruta de bares tipo "compostelana":
cada bar de la ruta tiene un hueco que se sella al llegar. Solo se entra por
invitacion, no hay registro abierto. Detalle completo en [README.md](README.md)
y [docs/SETUP.md](docs/SETUP.md) — esto es el resumen para arrancar rapido.

## Funcionalidades clave

- **Pestanas** (`app/(tabs)/`): Sellos (compostelana; SIN boton en la barra de
  abajo, se entra por el boton con su icono en la cabecera de Ruta), Ruta (mapa con los
  bares numerados y el trazado: Google en nativo, OpenStreetMap en web), Editor
  (solo admins: crear rutas, anadir bares de un catalogo cerrado, radio y
  horario de cada parada, publicar), Mi perfil (+ editor de rutas y panel de
  invitaciones para admins).
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
  cana/                   presentacion, ficha, chat, bloqueados, condiciones
  admin/                  bandeja de alertas de administracion, ficha de una denuncia
                          (alerta/) y decidir una foto de perfil (foto/)
  avisos.tsx              lo que se te ha sancionado y por que (art. 17 DSA)
  mis-datos.tsx           descargar o borrar tus datos; se entra desde Mi perfil
  contacto.tsx            escribir a la organizacion y reclamar una decision
  privacidad.tsx          que datos se recogen y como ejercer tus derechos (publica)
  invitacion.tsx          canje de una invitacion a una ruta (publica: ver AuthGate)
  invitaciones.tsx        panel de admin para crear invitaciones
  editor/[routeId]/       lista de bares de una ruta + formulario de bar
src/
  features/<dominio>/     reglas + llamadas a datos + componentes por dominio
                           (auth, routes, stamps, invites, profile, pwa, match, admin, notices)
  components/             UI compartida (StampSeal, ui.tsx, Desplegable, RutaMapa,
                           SelectorPosicion con variantes .web.tsx)
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
  migrations/0013_*.sql     lo que le faltaba al panel: reclamar, leer y contar
  migrations/0014_*.sql     expulsar de una ruta desde la bandeja de alertas
  migrations/0015_*.sql     los vetos aguantan y a la persona se le dice por que
  migrations/0016_*.sql     denunciar y bloquear exigen estar dentro y sin sancion
  migrations/0017_*.sql     el rastro de moderacion sobrevive al borrado de cuenta
  migrations/0018_*.sql     la lista de a quien se ha moderado (y que sigue puesto)
  migrations/0019_*.sql     arregla activar la cana, que la 0015 rompio
  migrations/0020_*.sql     la foto de perfil nueva pasa por revision de un admin
  migrations/0021_*.sql     borrar tu propia cuenta (delete_my_account)
  migrations/0022_*.sql     ni anon ni authenticated pueden vaciar una tabla
  migrations/0023_*.sql     el bucket de fotos es privado: URL firmadas
  migrations/0024_*.sql     el veto de cana aguanta solo (HMAC) y deja borrarse
  migrations/0025_*.sql     exportar TODOS tus datos, no solo los de la cana
  migrations/0026_*.sql     escribir a la organizacion y reclamar una decision
                            (NO hay Edge Functions: todo son funciones de Postgres)
docs/SETUP.md             puesta en marcha completa + checklist de verificacion
tests/                    tests que no encajan en un feature (p.ej. migration.test.ts)
```

Tablas: `profiles`, `routes`, `route_bars`, `stamps`, `route_invites`,
`route_members`, `avatar_requests`, `cana_bans`, `user_messages`. Todas con RLS. (`invites`, de 0001, la borra la 0004.)

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

- **"Tirate una cana"** (`docs/TIRATE-UNA-CANA.md`, migraciones 0005 a 0019):
  tinder cervecero por ruta, en la pestana Cana. Las tablas `match_*` no tienen
  privilegios para la app y todo pasa por funciones `SECURITY DEFINER`, asi que
  un `supabase.from('match_votes')` ni compila. Ni los admins leen los chats.
- **"Alertas de administracion" pinta ALERTAS, no denuncias** (`app/admin/`,
  `src/features/admin/alertas.ts`): hoy la unica fuente son las denuncias de la
  cana, pero la seccion nace para que quepa lo siguiente (invitaciones agotadas,
  una ruta sin publicar el dia del evento). La pantalla no sabe de
  `match_reports`; anadir otra fuente es anadir un `tipo` y su conversion en
  `alertas.ts`. El ticket se RECLAMA al abrirlo (`match_admin_take`, 0013) en
  vez de con un boton: con dos admins en la misma bandeja, si no, los dos se
  ponen con la misma denuncia. Y esconder el boton de Mi perfil a quien no es
  admin es comodidad: quien protege es `match_admin_require()` en Postgres.
- **Sancionar NO es borrar la cuenta, es suspenderla** (0015): borrarla haria
  imposible comunicarselo (`profiles` cae en cascada desde `auth.users`, y sin
  cuenta no puede entrar a leer nada) y la dejaria sin a quien reclamar. Quien
  esta suspendida entra, lee su aviso, reclama y puede llevarse o borrar sus
  datos; nada mas. La escalera es: retirar foto -> desactivar cana -> expulsar
  de la ruta -> suspender la cuenta.
- **Un veto no se puede esquivar, y se pone en un trigger** (0015): la puerta
  es `route_members_veto`, un BEFORE INSERT sobre `route_members`, y no un
  `if` dentro de `redeem_route_invite`. Asi vale para CUALQUIER via que meta a
  alguien en una ruta sin tocar codigo del remoto, y no se puede olvidar.
  Expulsar sin veto no servia de nada: el enlace es multiuso y circula por el
  grupo, asi que la persona volvia a canjearlo.
- **El veto de ruta guarda un HMAC del correo** (0015), no el correo ni un
  sha256 pelado: el espacio de correos es pequeno y un hash a secas se
  revierte por fuerza bruta. Sirve para que borrarse la cuenta y registrarse
  otra vez con el mismo correo no salte el veto esa misma noche. La clave la
  genera la propia migracion en `app_secrets` y no sale de la base. **Muere al
  purgar la ruta** (`match_admin_purge_route`): dura lo que dura el motivo por
  el que existe, que es lo que hace defendible conservarlo tras una peticion
  de supresion (art. 17.3 RGPD y art. 32 LOPDGDD, bloqueo de datos).
- **Toda sancion exige un motivo y genera un aviso** (`user_notices`, 0015):
  el art. 17 del DSA obliga a decir QUE se ha decidido y POR QUE en cuanto se
  restringe el servicio. El servidor lo exige (`REASON_REQUIRED`), no solo la
  pantalla. Son DOS textos distintos: `p_reason` se le ensena a la persona,
  `p_note` es interna y se queda en `match_moderation_log`. Y por eso TODOS
  los vetos se pueden levantar: el art. 20 da seis meses para reclamar, y una
  sancion que nadie puede deshacer deja ese derecho en nada.
- **A un admin no se le veta** (`TARGET_IS_ADMIN`), o un resbalon en la
  pantalla dejaria la ruta sin quien la lleva.
- **Al anadirle algo a una funcion SQL, se parte de su cuerpo, no de la
  memoria** (0019): la 0015 tenia que meterle dos comprobaciones a
  `match_activate` y la reescribio entera de cabeza. Resultado: llamaba a
  `match_set_tags`, que no existe (la buena es `match_save_bio_and_tags(uid,
  bio, tags)`, que guarda frase y etiquetas juntas), con lo que activar la
  cana por primera vez reventaba. No lo cogio ningun test porque todos
  pasaban `p_tag_ids => null` y perfiles ya activados: la rama de la frase y
  las etiquetas solo entra la PRIMERA vez (`first_activated_at is null`).
- **`match_report` y `match_block` exigen estar dentro y sin sancion** (0016):
  eran las dos unicas funciones de la cana que no comprobaban nada de quien
  llamaba. Comprobado contra la API: una cuenta recien SUSPENDIDA seguia
  denunciando y bloqueando a la gente de la ruta de la que se la echo, porque
  los uuid los tenia de cuando estaba dentro (salen en las respuestas y en la
  URL de una ficha). NO se exige que quien esta denunciado siga en la ruta:
  denunciar lo que hizo antes de irse tiene que poder hacerse.
- **El rastro de moderacion NO se borra con la cuenta** (0017): las claves
  ajenas son `set null` y no `cascade`, y se guarda el nombre visible de
  entonces (`target_name`, `reported_name`) con un trigger, para que el
  historial se pueda leer. Antes, quien se borraba la cuenta se llevaba por
  delante sus apuntes, las denuncias sobre el y su suspension: la sancion mas
  dura se esquivaba borrandose la cuenta mientras que el veto de ruta, menor,
  aguantaba. La suspension guarda ahora tambien el HMAC del correo y **se
  borra al levantarla**: el dato vive lo que vive la sancion.
- **Un veto se retira desde `app/admin/moderacion.tsx`**, no solo desde el
  ticket (0018): la denuncia que lo puso puede estar cerrada hace meses o
  haber desaparecido con la cuenta, y el art. 20 del DSA da seis meses para
  reclamar. Esa pantalla lista tambien lo que se hizo y ya no esta vigente
  (una foto retirada), que es lo que se pregunta al revisar a alguien.
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
- **Los bares salen de un catalogo en codigo, no de la BBDD**
  (`src/features/routes/catalogo.ts`): el editor ya no deja escribir nombre ni
  marcar posicion a mano, se elige de una lista cerrada de 14 bares de Alcala.
  Se hizo asi porque un admin tecleando coordenadas colocaba bares mal y creaba
  el mismo bar con tres nombres distintos. Esta en codigo y no en Postgres
  porque era una prueba local y no se queria tocar el esquema; si el catalogo
  crece o lo edita alguien que no despliega, ahi es donde deja de valer.
  Al guardar se COPIA a `route_bars`, asi que una ruta ya creada no depende del
  catalogo. Consecuencia: el logo no se guarda, se recupera casando el nombre
  (`buscarPorNombre`), y renombrar un bar en el catalogo deja sin logo a los
  que ya estaban guardados con el nombre viejo.
- **El plus code de Google Maps es interno y nunca se enseña**
  (`direccionVisible` en `catalogo.ts`): es de donde salen `lat`/`lng`, no una
  direccion para el usuario. Se filtra AL PINTAR y no solo al guardar porque
  los bares creados antes lo llevan escrito en `route_bars.address`, y esa
  tabla no se toca. Cuatro pantallas lo pintan: si aparece una quinta, tiene
  que pasar por el filtro.
- **Los bares propios viven en el DISPOSITIVO, no en Supabase**
  (`catalogoStore.ts` + `catalogoPropio.ts`, AsyncStorage / localStorage en
  web): el admin puede anadir un bar que no esta en la lista cerrada (nombre,
  ubicacion en el mapa, imagen del sello) y queda disponible para futuras
  rutas. Se hizo asi porque la prueba no toca el esquema. LIMITE REAL: otro
  movil, otro navegador u otro admin no ven esos bares, y lo que llega a
  `route_bars` es nombre y posicion pero NO la imagen, asi que los jugadores
  veran un sello con iniciales. Para compartirlos hace falta una tabla y un
  bucket en Postgres (cambio de esquema: decision pendiente, no se ha tocado).
  La imagen va como data URL de 256 px dentro del propio JSON y no como ruta:
  en nativo la ruta del picker es cache que el sistema borra, y en web es un
  `blob:` que muere al recargar. No hay forma de editar ni borrar un bar propio
  desde la app todavia.
- **La foto de perfil nueva la aprueba un admin** (`0020`): subirla crea una
  solicitud (`avatar_requests`, via `avatar_request_submit()`) y la foto
  anterior se sigue viendo hasta que se aprueba en Alertas de administracion
  (`avatar_admin_decide()`); rechazar exige un motivo que la persona lee en Mi
  perfil. Un admin se auto-aprueba y las fotos ya puestas no se tocan. Nadie
  escribe `avatar_url` a mano: `guard_profile_avatar()` lo rechaza salvo
  backend, y se decide por `current_user` (lista blanca postgres / supabase_admin
  / service_role), el contrario del razonamiento de `guard_profile_role`, porque
  aqui la pregunta es "¿lo hace una funcion mia o la API directamente?". El
  trigger NO es security definer a proposito: si lo fuera veria siempre al
  duenio. Solo envian fotos quienes estan en alguna ruta y con un maximo de 5 al
  dia (los admins, sin limite): el alta es abierta y cada solicitud es trabajo
  manual. La MINIATURA es un fichero aparte que sube la persona y el servidor no
  puede saber si es una version de la foto grande, asi que la pantalla del admin
  ensena las dos; es la unica proteccion y por eso hay un test que la vigila.
- **Una foto enviada a revision no se puede sobrescribir** (`0020`): sin esto se
  aprueba una foto y luego se reemplaza el fichero por otro, porque el bucket
  es publico y la 0001 dejaba actualizar y borrar los propios. Se quita
  `avatars_update_own` y `avatars_write_own` rechaza un nombre "en uso": el de
  cualquier solicitud Y el de la foto que la persona YA tiene puesta (las
  anteriores a la 0020 no tienen solicitud; un critico las reemplazo borrando y
  subiendo de nuevo antes de esta segunda condicion). Por eso la app sube con
  `upsert: false` y con nombre nuevo cada vez (`nombresFicheroAvatar`).
  `avatars_read` pasa de `to public` a solo la carpeta propia: la API de
  Storage aplicaba esa policy al listar y cualquiera con la clave publicable veia
  los nombres de las fotos pendientes. La URL publica sigue sirviendo el fichero
  sin policy (bucket publico); hay que comprobarlo tras aplicar (SETUP.md, punto 8).
  Limites conocidos: la foto pendiente es legible por URL si se conoce el nombre
  (sufijo aleatorio, no adivinable), y los ficheros de solicitudes sustituidas o
  rechazadas se quedan en el bucket.
  **Riesgo abierto, sin poder probarlo aqui**: si Storage solo comprueba el
  permiso de INSERT al FIRMAR una URL de subida (`createSignedUploadUrl` con
  `upsert`) y no al subir con el token (~2 h), un miembro con mala intencion
  podria sobrescribir una foto ya aprobada. Lo cierra de verdad un bucket privado
  + copia al publico al aprobar, que pide una Edge Function (quitadas a
  proposito). Probar en un Supabase real antes de decidir si merece la pieza.
  Tres rondas de critico adversario no encontraron nada mas demostrable.
- **Borrar cuenta es `delete_my_account()` (0021), y las fotos las borra la app
  ANTES** (`deleteMyAccount` en `profile/api.ts`): Storage no se deja borrar por
  SQL y, ya borrada la cuenta, nadie podria. Coste asumido: si falla la llamada
  final (sin red), quedan la cuenta sin fotos y un reintento posible; lo
  contrario dejaria fotos publicas colgando sin arreglo. `Storage.remove` no da
  error cuando una policy le impide borrar: se cuenta lo devuelto y se relista.
  Se lleva todo lo que cuelga de `profiles` en cascada, y NO el rastro de
  moderacion ni el veto (0015, 0017): si borrarse limpiase eso, una sancion se
  esquivaria con un clic. `delete_my_account_blockers()` dice cuando NO se puede
  y la app lo pregunta ANTES de tocar las fotos: `ADMIN_CANNOT_DELETE` y
  `OWNS_ROUTES` (`routes.created_by` no tiene cascade), y dos que solo dejan
  de bloquear cuando un admin actua, `HAS_OPEN_REPORTS` (denuncia sin resolver
  sobre ti) y `CANA_BLOCKED` (0015): la 0017 solo protege una sancion YA puesta,
  asi que sin esto borrarse y volver con el mismo correo las esquivaba (lo
  encontro un critico adversario, reproducido). Es retencion temporal y sin
  datos nuevos (art. 17.3.e RGPD), la alternativa era guardar un HMAC mas. El
  enlace se ensena a todos: quien no puede lo lee en un mensaje.
  Un array de SQL se construye con `array_append(v, 'X'::text)`: `v || 'X'` con
  un literal sin tipo lo lee como literal de array y revienta (lo cazo el test).
- **La solicitud guarda rutas, no URL** (`0020`): la URL publica depende del
  proyecto y desde SQL no se conoce, y aceptar una de un usuario dejaria apuntar
  el perfil a otro sitio cuyo contenido cambia cuando quiere. Las URL las pasa
  el admin (de confianza) al aprobar, y el servidor comprueba que tengan la
  forma `<host>/storage/v1/object/public/avatars/<ruta>`, sin query ni
  fragmento. El HOST no se puede comprobar desde SQL: ese tramo es confianza en
  el admin. La bandeja saca las pendientes primero y las mas viejas antes, para
  que muchas cuentas nuevas no entierren lo que lleva mas tiempo esperando.
- **El credito de OpenStreetMap se queda, pero sin enlace** (`ruta.tsx`): la
  licencia de OSM y las condiciones de sus teselas exigen atribucion VISIBLE, asi
  que el texto "Mapa: © OpenStreetMap" de la cabecera de Ruta no se puede quitar.
  Lo que se quito es que fuera pulsable: junto al boton de Sellos, un toque
  torcido abria la web de OpenStreetMap y sacaba a la gente de la app. Las
  directrices de OSM piden que el credito enlace a su pagina de copyright "cuando
  se pueda"; si algun dia hace falta cumplirlo del todo, el sitio es una pantalla
  de creditos (p. ej. en Mi perfil), no la cabecera del mapa. El mapa del
  editor (`SelectorPosicion.web.tsx`) conserva el control de Leaflet con enlace:
  es solo para admins y no hay boton al lado.
- **No hay campanita ni pantalla de notificaciones; hay un punto rojo** en la
  esquina del boton de Mi perfil de `BarraSuperior` (`Notificaciones.tsx` +
  `notificaciones/reglas.ts`). Se enciende con cualquier notificacion de tres
  fuentes ya existentes: avisos de la cana, avisos de moderacion sin leer y,
  solo para admins, alertas pendientes (denuncias y fotos). NO cuenta la foto
  rechazada de Mi perfil: no tiene estado "leida" y el punto no se apagaria
  nunca. Es un proveedor por encima del Stack (como `AvisosCana`) para que se vea
  desde cualquier pestana; se refresca cada 60 s, al volver del segundo plano y
  en cada cambio de pantalla (asi se apaga al salir de Avisos). Una peticion de
  refresco que llega mientras se pregunta se REPITE, no se descarta: si se
  descartase, el punto seguiria rojo tras marcar los avisos como leidos.
  Ese reintento leia el closure VIEJO y por eso a los admins el punto tardaba
  60 s en encenderse: `isAdmin` es false al arrancar (el perfil llega despues de
  la sesion) y al pasar a true la primera consulta seguia en vuelo. Se arregla
  leyendo `isAdmin` de una **referencia** y poniendolo ademas en las
  dependencias del efecto; las dos mitades hacen falta.
- **El bucket de fotos es PRIVADO y se pinta con URL firmadas** (`0023`,
  `src/features/profile/avatarFirmado.ts`): era `public = true`, o sea que
  Storage servia cualquier foto por su URL SIN mirar policy, y la cuadricula de
  la cana reparte esas URL. Comprobado: sin sesion y sin clave devolvia
  `200 image/jpeg`; ahora, `400`. La policy `avatars_read` no habla de carpetas
  sino de FICHEROS: de otra persona solo se lee el que es HOY su foto aprobada o
  su miniatura (`avatar_visible_para_mi`, que compara con `right()` porque '_' es
  comodin de LIKE). Si hablase de carpetas reabriria lo que cerro la 0020, que
  es que un companero liste tus fotos PENDIENTES y RECHAZADAS. Hay test para eso.
  La funcion es `security definer` (lee `route_members` de otros) y hay que
  **concederle ejecucion a `authenticated`**: el USING de una policy corre como
  el rol que consulta, asi que revocarsela deja la policy fallando para todos.
  `profiles.avatar_url` sigue guardando la URL `.../object/public/avatars/...`,
  que ya no descarga nada: pasa a ser un IDENTIFICADOR del que
  `rutaDesdeUrlPublica` saca la ruta, y es el unico sitio que conoce ese formato.
  Firma `AvatarCana` por dentro, asi que sus seis pantallas no cambiaron; lo
  vigila `tests/avatares-firmados.test.ts`, que falla si alguien vuelve a meter
  un `avatar_url` en un `uri:` (no daria error, daria un hueco en blanco).
  **Al desplegar, la app va ANTES que la migracion**: al reves, una version vieja
  pide la URL publica y todo el mundo se queda sin fotos.
- **El veto de cana guarda un HMAC del correo, igual que el de ruta** (`0024`,
  tabla `cana_bans`): la 0021 habia elegido `CANA_BLOCKED` como impedimento para
  borrar la cuenta, con buen motivo (el veto vive en `match_profiles`, que cae
  en cascada), pero eso dejaba el escalon MAS BAJO de la sancion bloqueando el
  derecho de supresion y sin plazo. Ahora el veto sobrevive por su cuenta y
  `CANA_BLOCKED` ya no impide nada. `match_admin_lift_cana` levanta tambien
  cuando NO hay fila viva: una cuenta nueva con el mismo correo solo tiene el
  HMAC, y sin eso ese veto heredado no habria forma de retirarlo (art. 20 DSA).
  Y `match_admin_moderaciones` lee la rama 'cana' de `cana_bans` y no de
  `match_profiles`, o el veto desaparece de la lista justo al borrarse la cuenta.
- **`export_my_data()` es la exportacion de verdad; `match_export_my_data` es
  solo el trozo de la cana** (`0025`): la segunda se sigue llamando desde la
  primera en vez de copiarse, para que no acaben separandose. Salen el correo,
  los sellos CON coordenadas y **el HMAC del correo**: decir en la politica que
  se guarda y esconderlo al pedir los datos seria lo peor de los dos mundos. NO
  sale el texto de una denuncia abierta sobre ti ni quien la puso (art. 15.4:
  son datos de un tercero, y una invitacion a las represalias).
- **El canal de contacto NO copia el guardian de la 0016** (`0026`,
  `send_admin_message`): denunciar y bloquear exigen estar dentro de una ruta y
  sin sancion; aqui seria al reves de lo que se busca, porque quien mas necesita
  escribir es la cuenta suspendida y expulsada. Solo se exige sesion, y tiene
  test propio. Dos entradas al mismo sitio: Mi perfil (art. 12 DSA, siempre
  visible) y dentro de cada aviso restrictivo (art. 20, con el id del aviso
  pegado). El art. 16 —avisar teniendo o no cuenta— NO se puede cubrir desde la
  app: lo cubre el correo de la politica. Responder genera un aviso
  (`respuesta_organizacion`), y si la decision reclamada la tomo quien mira el
  ticket, se avisa pero no se bloquea (con un solo admin no habria alternativa).
- **`/privacidad` es publica en AuthGate**, como `/invitacion`: el art. 13 del
  RGPD obliga a informar ANTES de recoger los datos y el registro se hace sin
  sesion, asi que exigirla mandaba el enlace al login (paso, y el primer test no
  lo cazo por mirar solo que AuthGate existiera). El responsable y el correo son
  provisionales, viven en `src/features/legal/responsable.ts` con un flag
  `PENDIENTE`, y mientras siga a true la pantalla avisa de que es un borrador.

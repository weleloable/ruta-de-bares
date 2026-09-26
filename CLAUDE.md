@AGENTS.md

# Ruta de Bares — contexto rapido

App movil (Expo/React Native) para organizar una ruta de bares tipo "compostelana":
cada bar de la ruta tiene un hueco que se sella al llegar. Solo se entra por
invitacion, no hay registro abierto. Detalle completo en [README.md](README.md)
y [docs/SETUP.md](docs/SETUP.md) — esto es el resumen para arrancar rapido.

## Funcionalidades clave

- **Pestanas** (`app/(tabs)/`), en el orden de la barra de abajo: Ruta (mapa con los
  bares numerados y el trazado: Google en nativo, OpenStreetMap en web; en su
  cabecera, a la derecha, los enlaces de Instagram y Social, `EnlacesRuta`),
  Sellos (compostelana; es a donde lleva `/` y el enlace de invitacion), Caña.
  Mi perfil no tiene boton abajo (se entra por el avatar de la barra superior). Editor
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
  (tabs)/                 Ruta, Sellos y Cana (ese orden); Perfil sin boton abajo
  cana/                   presentacion, ficha, chat, bloqueados, condiciones
  admin/                  bandeja de alertas de administracion, ficha de una denuncia
                          (alerta/) y decidir una foto de perfil (foto/)
  avisos.tsx              lo que se te ha sancionado y por que (art. 17 DSA)
  contacto.tsx            escribir a la organizacion y reclamar una decision
  privacidad.tsx          que datos se recogen, quien los ve y descargarlos
                          (publica; "Ver lo que guardamos" fue app/mis-datos.tsx;
                          el TEXTO vive en src/features/legal/politica.ts)
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
  migrations/0027_*.sql     una ruta termina, y borrarla se lleva sus datos
  migrations/0028_*.sql     la denuncia congela la foto y la frase de entonces
  migrations/0029_*.sql     catalogo de etiquetas real, ya no son placeholders
  migrations/0030_*.sql     las 30 etiquetas, en primera persona y de cultura pop
  migrations/0031_*.sql     la descarga de datos trae lo que dio Google al entrar
  migrations/0032_*.sql     fotos que sobran se borran; la denunciada es prueba
  migrations/0033_*.sql     que admin ya vio el aviso de una ruta terminada
                            (NO hay Edge Functions: todo son funciones de Postgres)
docs/SETUP.md             puesta en marcha completa + checklist de verificacion
tests/                    tests que no encajan en un feature (p.ej. migration.test.ts)
```

Tablas: `profiles`, `routes`, `route_bars`, `stamps`, `route_invites`,
`route_members`, `avatar_requests`, `cana_bans`, `user_messages`, `match_fotos_liberadas`,
`admin_rutas_terminadas_vistas`. Todas con RLS. (`invites`, de 0001, la borra la 0004.)

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
- **"Continuar con Google" es OAuth de Supabase con PKCE, sin SDK de Google**
  (`features/auth/google.ts` nativo y `google.web.ts`, `BotonGoogle.tsx`): un
  solo cliente "Web" de Google Cloud sirve web y movil, porque en el movil se
  abre el navegador del sistema (`expo-web-browser`, modulo nativo: development
  build nuevo) y Supabase hace de intermediario; asi no hay cliente de Android
  ni SHA-1. El cliente pasa a `flowType: 'pkce'` y `detectSessionInUrl` solo en
  web (`lib/supabase.ts`). Se AÑADE al correo y contrasena, no lo sustituye
  (WhatsApp y Telegram bloquean Google en su navegador integrado, y ahi se
  reparten las invitaciones). No se importa el nombre ni la foto de Google: el
  nombre visible sigue saliendo del correo (`handle_new_user`) y la foto pasa
  por la revision de un admin (0020); la politica de privacidad lo cuenta. Sin
  migracion. Hasta configurar Google Cloud y Supabase (`docs/SETUP.md`, 9) el
  boton llega a Supabase y esta contesta "provider is not enabled".
  `app/auth-callback.tsx` existe solo para que Android no pinte "no encontrada".
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
- **Los iconos no se editan a mano, los genera `scripts/generar-iconos.py`**
  (Pillow) desde `assets/marca/`: `logo-10.png` (RxB) para el icono nativo,
  el adaptativo de Android, la PWA, el favicon, el login y la pagina sin
  conexion de `sw.js`; `logo-11.png` (el pato) SOLO para la barra superior,
  a proposito. Los originales vienen con esquinas blancas de maqueta: el
  script recorta el aro y lo monta sobre crema liso, porque el movil pone su
  propia mascara y asomarian cunas blancas. `tests/iconos.test.ts` lo vigila.
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
  (sufijo aleatorio, no adivinable). (Los ficheros de solicitudes sustituidas o
  rechazadas se quedaban en el bucket; desde la 0032 se borran al momento.)
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
  **Hoy solo quedan `ADMIN_CANNOT_DELETE` y `OWNS_ROUTES`**: la 0024 quito
  `CANA_BLOCKED` y la 0032 quito `HAS_OPEN_REPORTS` (se eligio al final la
  alternativa del HMAC; ver la entrada de la 0032).
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
  Lo que se quito es que fuera pulsable: junto a los botones de la cabecera (antes el de Sellos, ahora los enlaces), un toque
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
- **Borrar una ruta ES la purga, y no hay cron** (`0027`): el esquema ya
  cascadea desde la 0001 (bares -> sellos con su GPS, pertenencia, invitaciones,
  conexiones y chats, votos, denuncias, veto de ruta con su HMAC), y la 0027
  anade que el veto de cana tambien muera ahi (`cana_bans.route_id`). Los vetos
  NO se arrastran de un evento al siguiente: cada ruta empieza de cero, y el
  HMAC vive lo que vive la ruta. Lo que NO muere con una ruta: la suspension de
  cuenta (es de la persona) y el registro de moderacion. Si nadie pulsa Borrar,
  los datos se quedan. Recordatorios: el aviso del editor y, desde la 0033, un
  aviso arriba de Alertas de administracion para todos los admins.
- **"Terminada" no se guarda, se deduce del cierre del ULTIMO bar**
  (`routes/estado.ts`): el ultimo por `sort_order`, no el que cierra mas tarde.
  `closes_at` es `timestamptz`, asi que la medianoche no le afecta — y ese era
  el problema de la primera version, que usaba `event_date` (un `date`) y
  marcaba la ruta terminada a las 00:01 con la gente todavia sellando. Queda
  como red "08:00 del dia siguiente" SOLO para una ruta sin bares.
  `routes.finished_at` es solo para terminarla a mano antes de tiempo. Y
  publicar exige fecha, o la ruta no termina nunca y se escapa del aviso.
- **Una migracion se pega UNA VEZ: casi la mitad NO son idempotentes** aunque
  lo dijeran. Cuando una define una funcion que otra POSTERIOR rehace, volver a
  pegar la vieja la degrada en silencio (paso con la 0006 y
  `match_require_target`, que perdio la comprobacion de bloqueos). Cada cabecera
  dice ahora la verdad y nombra que funciones suyas quedaron obsoletas y quien
  las rehizo; `tests/migraciones-cabeceras.test.ts` lo recalcula en cada
  ejecucion, asi que anadir una migracion que pise a otra hace fallar la
  cabecera de aquella.
- **Del parser de SQL se pide UNA instancia POR LLAMADA**
  (`pg-query-emscripten`): `parse()` seguido de `parsePlpgsql()` sobre la misma
  revienta el wasm y **se lleva el proceso de test por delante**, sin mensaje
  util. `tests/migration-0020.test.ts` era el unico que la reutilizaba y
  aguantaba de milagro: salto al anadirle 16 bytes de comentario a la 0020.
- **"La Caña" es el nombre del servicio desde ahora, con articulo pegado**:
  sustituye a "Tirate una cana"/"la cana" en todo el texto de cara al usuario
  (no en rutas, identificadores ni comentarios internos). Trampa gramatical: no
  se puede escribir "tu La Caña" ni "su La Caña" (dos articulos chocan), asi
  que en construcciones posesivas se usa "Caña" sin articulo ("tu Caña", "su
  Caña"); en el resto, "La Caña" completa. El chip de la barra inferior se
  queda en "Caña" a secas por espacio (cinco pestanas); la cabecera de la
  pantalla y el resto del texto sí dicen "La Caña" entera. Los usos idiomaticos
  de "una caña"/"la caña" como la cerveza literal ("ofrécele una caña", "¿Una
  caña?", "tomar una caña") NO se tocan: son juego de palabras con el nombre,
  no el nombre.
- **`app/(tabs)/_layout.tsx`: el header de las pestanas leia `options.title` y
  no `options.headerTitle`**, pese a que el comentario ya decia "nombre corto
  abajo y completo en la cabecera". Bug real, encontrado al comprobar en
  pantalla que la cabecera de Cana decia "Caña" en vez de "La Caña": el
  `headerTitle` de esa pestana llevaba puesto desde siempre y nunca se leia en
  ningun sitio. Arreglado para que el header prefiera `headerTitle` (si es
  string) y caiga a `title` si no lo hay.
- **Politica de privacidad y mecanica de La Caña, en pantallas separadas**
  (`cana/condiciones.tsx` explica SOLO como funciona y las normas;
  `privacidad.tsx` tiene la seccion "La Caña" con que dato ve quien). Vivian
  mezcladas en condiciones.tsx. Cada pantalla enlaza a la otra.
- **No hay borrado parcial de "los datos de la cana" en Mis datos**: por ley
  basta con poder borrar TODO (Borrar Cuenta, Mi perfil, 0021); una via de
  borrado parcial ademas de esa no es una obligacion legal y confundia con dos
  botones de "borrar" en pantallas distintas. Quien quiera separarse solo de La
  Caña sin perder su compostelana la DESACTIVA (pausa, no borra nada) desde su
  pestana; `match_delete_my_data` y `deleteMyMatchData()` se quedan en el
  codigo (no rompen nada al seguir ahi), simplemente ya no los llama ninguna
  pantalla.
- **El catalogo de etiquetas de La Caña ya no es el placeholder de la 0005**
  (`0029`): la 0005 sembro "Etiqueta 1".."Etiqueta 8" con una nota EXPLICITA de
  que era provisional y de que nunca debian tocar categorias especiales del
  art. 9 del RGPD (orientacion, salud, religion, ideologia). La 0029 solo
  actualiza el `label` por `id` fijo (no toca los ids, no son visibles en
  ningun sitio): rasgos de comportamiento en la ruta, nunca de identidad.
- **"Mis datos" ya no es una pantalla propia: es el recuadro "Ver lo que
  guardamos" dentro de `privacidad.tsx`** (`app/mis-datos.tsx` borrado). Habia
  dos pantallas casi iguales enlazadas entre si (una decia que se recogia, la
  otra dejaba descargarlo) y dos botones distintos en Mi perfil. Ahora un solo
  boton, "Política de privacidad y datos", lleva a una sola pantalla que
  explica la politica Y deja descargar, en el hueco donde antes estaba el
  boton "Cómo funciona La Caña" (que se quito: el enlace en sentido contrario,
  de condiciones a privacidad, se queda).
- **En `privacidad.tsx`, "que se recoge", "para que" y "quien lo ve" van en
  UNA sola seccion, dato por dato** ("Qué se recoge, para qué y quién puede
  verlo"), no en dos o tres separadas: separarlas deja un hueco entre leer que
  se guarda un dato y leer, mucho despues, que no lo ve nadie. Lo de La Caña
  no tiene su propia seccion: es "Además, si activas La Caña" DENTRO de esa
  misma seccion. Las sanciones (huella de correo) van ANTES que cuanto tiempo
  se conserva, porque explican por que existe ese dato antes de decir cuanto
  dura.
- **El catalogo de etiquetas de La Caña tiene 30**, no 8 (`0029`, editada
  porque aun no estaba comiteada cuando se amplio: no es una migracion ya
  publicada). Misma regla que antes: comportamiento en la ruta, nunca
  identidad, nada del art. 9 del RGPD.
- **Las etiquetas van en PRIMERA persona** (`0030`): las elige cada cual para
  presentarse, asi que se escriben como las diria ella ("Me apunto a...", "De
  cañas con..."), no como una ficha en tercera ("Le pone chupitos"). La 0030
  reescribe las 30 sobre los MISMOS ids, para que quien ya tenia una marcada la
  conserve. Nada que presuponga el genero ("Therian" a secas, no "Therian
  desde shequetito"). Limite de 40 caracteres (check de la 0005): una mas
  larga revienta la migracion entera al pegarla; lo vigila
  `tests/migration-0030.test.ts` contra Postgres real. Van en **orden
  alfabetico**, guardado en `sort_order` (la app ya ordena por esa columna) y
  calculado con el orden del español sin contar "¡" ni "...": anadir una
  etiqueta obliga a renumerar, o cae al final.
- **La politica de privacidad se publica TAMBIEN como HTML estatico**
  (`scripts/generar-privacidad.mjs`, paso del workflow de Pages ->
  `dist/privacidad/index.html`). Google, para verificar el "Continuar con
  Google", exige la politica en el cuerpo de una pagina HTML que responda 200
  (support.google.com/cloud/answer/13806988). Comprobado contra la web
  publicada: `/ruta-de-bares/privacidad` respondia **404** (la servia
  `404.html`, el fallback de la app de una sola pagina) y el HTML no llevaba ni
  una linea de la politica, que la pinta JavaScript. El texto vive en UN solo
  sitio, `src/features/legal/politica.ts`, sin imports (Node exige `.ts` en
  cada import y la app no lo admite), y lo pintan la pantalla y el script: dos
  copias acabarian diciendo cosas distintas. `tests/privacidad-estatica.test.ts`
  comprueba que la pagina lleva cada frase de la app. Consecuencia asumida:
  recargar `/privacidad` en el navegador ensena la pagina estatica y no la
  pantalla de la app; descargar tus datos solo se puede dentro de la app. La
  URL que va en Google Cloud es la de la barra final, `.../privacidad/`. La
  politica cubre lo que pide Google (que se lee de Google y para que, con quien
  se comparte, como se protege, cuanto dura, los usos prohibidos de Uso
  Limitado, avisar si cambia) y se enlaza tambien desde la pantalla de entrada,
  que es la portada y donde se crea la cuenta al entrar con Google la primera
  vez. Lo unico que falta para pasar la verificacion es el responsable y el
  correo (`PENDIENTE` en `legal/responsable.ts`): Google no acepta borradores.
- **La descarga de datos trae lo del sistema de acceso** (`0031`): con Google,
  Supabase guarda correo, nombre, foto e identificador de la cuenta de Google
  en `auth.identities` y `raw_user_meta_data`, la politica lo dice, y
  `export_my_data()` no lo leia. Sale en la clave `acceso`; nunca la
  contrasena cifrada ni tokens, que viven en otras columnas que no se tocan.
  El PGlite de los tests (`tests/pglite-supabase.ts`) tiene ahora un
  `auth.identities` minimo para poder probarlo. La descarga dice ademas, en
  `sobre_las_fotos`, que `avatar_url` IDENTIFICA la foto y no la descarga (el
  bucket es privado desde la 0023): quien quiera la imagen la pide por
  "Escribir a la organizacion". Se decidio asi en vez de meter enlaces firmados.
- **Fotos: lo que sobra se borra al momento; la foto de una denuncia es PRUEBA**
  (`0032`, `profile/fotosSobrantes.ts`). Tres cosas encadenadas:
  1. **Sobra** lo que no es la foto/miniatura puesta de nadie, ni de una
     solicitud pendiente, ni prueba: sustituidas, rechazadas, huerfanas. QUE
     sobra lo decide Postgres (`mis_fotos_sobrantes`, `avatar_admin_sobrantes`)
     y la app borra lo que le devuelven, justo despues de enviar una foto,
     aprobar, rechazar, liberar una prueba o borrar una ruta (`deleteRoute`).
     No hay cron: la de un admin mira todo el bucket, asi que lo que una
     limpieza no llego a borrar lo recoge la siguiente. Lo recien subido tiene
     10 min de gracia (se sube antes de pedir) SOLO si la cuenta existe y no
     esta liberado: sin esas dos condiciones, la foto de una cuenta recien
     borrada se saltaba la limpieza (lo cazo la prueba contra la API real, no
     los tests; ahora hay test).
  2. **Prueba** es la foto que sale en una denuncia (la congelada al denunciar,
     0028, o la retirada desde ella, `retired_avatar_url`) mientras ningun admin
     la libere (`match_fotos_liberadas`, una fila por FICHERO: la misma foto
     puede estar en varias denuncias). Se protege DONDE ESTA con la policy de
     borrado (`avatar_protegida`), no copiandola: la copia la tendria que hacer
     la app de quien denuncia, que podria colar otra imagen. **Cierra un
     agujero**: `avatars_delete_own` (0001) dejaba borrar cualquier fichero
     propio por la API, asi que la persona denunciada destruia la prueba. Ni un
     admin borra una prueba sin liberarla antes: el boton "Eliminar foto de la
     base de datos" de la ficha (`match_admin_liberar_foto`) avisa si hay otras
     denuncias abiertas con esa foto y no deja liberar una foto EN USO (eso es
     "Retirar la foto", con motivo y aviso). Borrar la ruta se lleva las
     denuncias y la prueba pasa a sobrar.
  3. **Borrarse la cuenta ya no se bloquea por una denuncia abierta** (fuera
     `HAS_OPEN_REPORTS`): el RGPD deja conservar la prueba, no retener a la
     persona. La denuncia guarda un HMAC del correo (`reported_email_hmac`,
     trigger `match_report_huella`) y si alguien se registra con ese correo la
     denuncia vuelve a apuntarle (`profiles_recupera_denuncias`). El HMAC se
     borra al resolverla y muere con la ruta. Borrar Cuenta se salta las
     pruebas (`mis_fotos_retenidas`, `fotosABorrar`) en vez de fallar.
  Probado contra la API real de Storage en local (no solo PGlite): las policies
  de Storage las aplica su servidor y es ahi donde tienen que valer.
- **Una ruta terminada avisa a TODOS los admins arriba de Alertas de
  administracion** (`0033`, `admin/rutasTerminadas.ts`): "La ruta «X» ha
  terminado. Hay que borrarla antes del D: quedan N dias. Al borrarla, tambien
  se borraran todos los datos de la gente que participo en ella." (esa ultima
  frase la eligio el usuario, tal cual). Cuentan DIAS_CONSERVACION dias desde
  `terminoEl` (routes/estado.ts: marcada a mano o cierre del ultimo bar, lo mismo
  que usa el editor). Es un banner y NO una alerta de la lista: una ruta no se
  reclama ni se resuelve, solo desaparece al borrarla. El aviso se queda hasta
  entonces; lo que se apaga al verlo una vez es el PUNTO ROJO, por admin y en
  la base (`admin_rutas_terminadas_vistas`, cae con la ruta), para que no
  vuelva a salir en otro movil. Se suma dentro de `contarAlertas()`, asi el
  punto rojo y la burbuja de Mi perfil se apagan a la vez. `rutasTerminadas.ts`
  no importa nada en tiempo de ejecucion (node --test no resuelve rutas sin
  extension): recibe `terminoEl` ya calculado y el formateador de fecha.

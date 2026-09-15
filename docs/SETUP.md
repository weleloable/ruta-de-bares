# Puesta en marcha

De cero a la app corriendo en un movil. Unos 30 minutos la primera vez, casi
todo esperando a que compile.

Al final hay una **lista de verificacion**: no des el montaje por bueno hasta
que los seis puntos pasen.

---

## 1. Base de datos

En tu proyecto de Supabase, **SQL Editor > New query**. Pega y ejecuta
**cada migracion entera, en orden**, una query por fichero:

1. [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
   y **Run**.
2. [`supabase/migrations/0002_guard_role_sql_editor.sql`](../supabase/migrations/0002_guard_role_sql_editor.sql)
   y **Run**. Sin esta, el punto 3 falla con `ROLE_CHANGE_FORBIDDEN`.

La 0001 crea las cinco tablas (`profiles`, `routes`, `route_bars`, `stamps`,
`invites`), las politicas de RLS, la funcion `claim_stamp` y el bucket
`avatars`. La 0002 deja que el propio SQL Editor (y la `service_role`) cambien
el rol de un perfil; un usuario de la app sigue sin poder. Las dos se pueden
volver a ejecutar sin romper nada.

## 2. Cerrar el registro publico

Este paso es el que hace que la app sea solo por invitacion. Si te lo saltas,
cualquiera puede crearse una cuenta.

**Project Settings > Authentication > User Signups**: apaga
**"Allow new users to sign up"** y guarda.

Si en algun momento activas un proveedor OAuth (Google, GitHub), desactiva
tambien el registro en cada uno: **Authentication > Providers**. Un proveedor
abierto es otra puerta de alta.

Que esto no rompe el canje de invitaciones: la funcion `redeem-invite` crea la
cuenta con la API de administracion (`auth.admin.createUser`) usando la
`service_role`, que no pasa por el endpoint publico de registro. El punto 3 de
la lista de verificacion comprueba justo eso.

## 3. Tu cuenta de administrador

Las cuentas de administrador se crean **fuera de la app**, a mano. Es
deliberado: no hay ninguna pantalla que conceda el rol `admin`, asi que no hay
ninguna pantalla que puedan atacar.

1. **Authentication > Users > Add user > Create new user**.
2. Correo y contrasena. Marca **Auto Confirm User**.
3. Vuelve al **SQL Editor** y asciende esa cuenta:

```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = 'tu@correo.com');
```

Para quitarle el rol a alguien, lo mismo con `role = 'user'`.

Un usuario normal no puede ascenderse solo: el trigger `guard_profile_role`
rechaza cualquier cambio de `role` que venga de la app y no de un admin. Solo
lo dejan pasar el SQL Editor (conexion directa como `postgres`, sin sesion de
usuario) y la `service_role`.

**Si el `update` falla con `ROLE_CHANGE_FORBIDDEN`**: no has ejecutado la 0002
(punto 1). Ejecutala y repite el `update`.

**Si el `update` dice `UPDATE 0`**: esa cuenta no tiene fila en `profiles`
(se creo antes de ejecutar la 0001). El bloque de abajo la crea.

**Si todavia no puedes aplicar la 0002** en ese proyecto, este bloque hace lo
mismo en una sola transaccion. Apaga el trigger solo mientras dura: si algo
falla, el `rollback` lo deja encendido como estaba.

```sql
begin;

insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1)
  from auth.users
 where email = 'tu@correo.com'
on conflict (id) do nothing;

alter table public.profiles disable trigger on_profile_update;

update public.profiles
   set role = 'admin', updated_at = now()
 where id = (select id from auth.users where email = 'tu@correo.com');

alter table public.profiles enable trigger on_profile_update;

commit;
```

`alter table` toma un bloqueo exclusivo sobre `profiles` hasta el `commit`, asi
que ninguna peticion de la app se cuela con el trigger apagado.

## 4. Desplegar las dos Edge Functions

Necesitas la [CLI de Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
supabase login
supabase link --project-ref TU_REF          # la ref sale de la url del dashboard

supabase functions deploy create-invite
supabase functions deploy redeem-invite --no-verify-jwt
```

El `--no-verify-jwt` de la segunda es imprescindible y no es un agujero: quien
canjea una invitacion todavia no tiene cuenta, asi que no puede tener JWT. Lo
que autoriza la llamada es el token de un solo uso, que la funcion valida
comparando su sha256 con la tabla `invites`. Si prefieres dejarlo fijado en el
repositorio en vez de en el comando, ya esta escrito en
[`supabase/config.toml`](../supabase/config.toml).

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase sola en el
entorno de las funciones. No hay que configurar ningun secreto a mano.

## 5. Variables de la app

```bash
cp .env.example .env
```

Rellena:

| Variable | Donde sale |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<project-id>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase > Project Settings > API Keys (la que empieza por `sb_publishable_`) |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Cloud > APIs & Services > Credentials |

`.env` esta en `.gitignore`. No lo subas.

La clave **publicable** (`sb_publishable_...`) es publica por diseno: va dentro
del binario y cualquiera puede extraerla. Lo que protege los datos es RLS, no el
secreto de esa clave. La clave **secreta** (`sb_secret_...`, antes
`service_role`) **no aparece en ningun sitio de este repositorio** y no debe
salir nunca del panel de Supabase ni de las Edge Functions.

Si tu proyecto todavia usa el formato antiguo, la equivalencia es
`anon` -> publicable y `service_role` -> secreta. Sirven igual en las mismas
posiciones.

### La clave de Google Maps

En [Google Cloud Console](https://console.cloud.google.com/):

1. Crea un proyecto.
2. **APIs & Services > Library**: habilita **Maps SDK for Android** y
   **Maps SDK for iOS**.
3. **Credentials > Create credentials > API key**.
4. Restringela. Android: nombre de paquete `com.weleloable.rutadebares` mas la
   huella SHA-1 de tu keystore (`eas credentials` te la ensena). iOS: bundle id
   `com.weleloable.rutadebares`.

Sin restringir funciona igual, pero la clave viaja dentro de la app y cualquiera
puede sacarla y gastarte la cuota.

## 6. Development build

El mapa es un modulo nativo con la clave de Google dentro, asi que Expo Go no
sirve. Hay que compilar una vez; despues el codigo JavaScript se recarga solo
como siempre.

```bash
npm install
npx expo install --check       # comprueba que las versiones encajan con SDK 57

npm install -g eas-cli
eas login
eas build --profile development --platform android
```

**Las variables no viajan solas.** `.env` esta en `.gitignore`, asi que EAS no
lo recibe. Las tres `EXPO_PUBLIC_*` tienen que existir tambien en la nube, o el
build sale sin clave de Google y sin Supabase:

```bash
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value "https://TU-PROYECTO.supabase.co" --environment development --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "sb_publishable_..." --environment development --visibility plaintext
eas env:set --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value "AIza..." --environment development --visibility plaintext
```

Repite con `--environment production` cuando saques la version definitiva.
`plaintext` es lo correcto aqui: las tres acaban dentro del binario de todas
formas, y marcarlas como secretas solo las esconde de ti, no del que descompile
la app. Lo que nunca se sube es la `service_role`.

Instala el APK que te da EAS y arranca el servidor:

```bash
npx expo start --dev-client
```

Solo hay que volver a compilar cuando cambian las dependencias nativas o
`app.config.ts`. Para el resto, recarga y ya.

## 7. Publicar la web en GitHub Pages

La version web vive en <https://weleloable.github.io/ruta-de-bares/> y se
publica sola en cada push a `master` con
[`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml).

Lo que hace el workflow:

1. Comprueba que existen las dos variables de Supabase. Si falta alguna, se
   para con un error que dice cual, antes de compilar nada.
2. `npm ci` y `npx expo export --platform web --output-dir dist` con
   `WEB_BASE_URL=/ruta-de-bares`. `app.config.ts` convierte eso en
   `experiments.baseUrl`, que prefija los assets y los enlaces del router.
   Sin la variable no hay prefijo, asi que `npx expo start --web` sigue en
   `http://localhost:8081/` y los builds nativos no cambian.
3. Copia `index.html` a `404.html`: Pages no conoce las rutas de la app, y al
   recargar `/ruta-de-bares/invitacion` sirve `404.html`, que carga la app y el
   router pinta la pantalla correcta. Anade tambien `.nojekyll`.
4. Sube `dist` como artefacto y lo despliega con `actions/deploy-pages`.

Configuracion del repositorio, una sola vez:

| Donde | Que |
| --- | --- |
| **Settings > Secrets and variables > Actions > Variables** | `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, los mismos valores que en `.env`. Variables, no secretos: acaban dentro del JavaScript publico igual. La de Google Maps no hace falta en web. |
| **Settings > Pages > Build and deployment > Source** | **GitHub Actions** |
| **Settings > General > Danger Zone** | El repositorio tiene que ser **publico** si la cuenta es del plan gratuito: Pages en repos privados es de pago. |

Para publicar sin hacer push: **Actions > Publicar web > Run workflow**, o
`gh workflow run deploy-web.yml`.

**Limitacion de las invitaciones.** Los enlaces que se comparten son
`rutadebares://invitacion?token=...` y solo abren la app instalada. Desde la
web se pueden crear invitaciones, pero abrir el enlace en un navegador no lleva
a la web. Quien use la web tiene que ir a la pantalla de invitacion y pegar el
codigo, que el mensaje compartido ya incluye.

## 8. Mapa en la web y app instalable

La web tiene el mismo mapa que el movil, pero con **OpenStreetMap** en vez de
Google: gratis, sin clave y sin tarjeta. No hay nada que configurar.

- **Pestana Ruta**: bares numerados, linea discontinua en el orden de la ruta,
  circulo del radio del bar elegido y punto azul de "estas aqui" si el
  navegador ya tiene permiso de ubicacion. Abrir el mapa nunca pregunta por la
  ubicacion (se pide al sellar). **En iPhone el punto azul puede no salir**:
  Safari suele contestar "preguntar" al consultar el permiso aunque ya se haya
  concedido, y la app no lanza la pregunta solo para pintar el punto. Sellar
  funciona igual.
- **Editor de bar**: se toca el mapa o se arrastra el pin, con el circulo del
  radio dibujado. Tambien "Usar mi ubicacion" (para dar de alta el bar estando
  dentro) y el campo de coordenadas para pegar las de Google Maps.

**Antes de subir cambios al mapa web**, `npm run verificar:web`: monta el mapa
en Chrome headless y comprueba en pixeles que no se reencuadra al cambiar la
medida de la cabecera, al cambiar de pestana ni al recargar los mismos bares,
y que si reencuadra cuando cambian. Necesita Chrome (o la variable `CHROME`) y
tarda de 20 s a 1 min segun la cache del export.

Codigo: `src/components/RutaMapa.web.tsx`, `src/components/SelectorPosicion.web.tsx`
y `src/lib/mapaWeb.ts`. Metro elige los `.web.tsx` al bundlear para web, asi
que ni `react-native-maps` entra en la web ni Leaflet en el movil
(`tests/web-sin-mapas.test.ts` y `tests/leaflet-solo-web.test.ts` lo vigilan).

### Instalarla en el movil

No hace falta APK ni tienda: la web es una **PWA** y se instala desde el navegador.

| Movil | Como |
| --- | --- |
| **Android** (Chrome) | *Mi perfil > Instalar la app > Instalar app*, o menu de Chrome > "Instalar aplicacion" |
| **iPhone / iPad** | Abrir en **Safari** > boton Compartir > "Anadir a pantalla de inicio" |

La tarjeta *Instalar la app* de Mi perfil detecta el dispositivo: si el
navegador permite instalar con un toque ensena el boton; si no (iPhone, otros
navegadores), ensena los pasos. Una vez instalada se abre a pantalla completa
con el icono del sello "RB".

Piezas: `public/manifest.json`, `public/icons/`, `public/sw.js` y
`src/features/pwa/`. Dos decisiones que no son obvias:

- **El service worker no cachea la app.** Todo va a la red; solo guarda una
  pagina de "sin conexion". Un service worker que cachea HTML y JS deja a la
  gente con la version vieja tras cada despliegue. Si se cambia `sw.js`, subir
  `VERSION` dentro del fichero.
- **El manifest y el icono de iOS los enlaza la app al arrancar**, no
  `public/index.html`: Expo no reescribe ese fichero con el `baseUrl`
  (`/ruta-de-bares`), asi que un enlace fijo fallaria en GitHub Pages o en
  localhost. La ruta sale de `experiments.baseUrl` en tiempo de ejecucion.

Los iconos salen del sello del login; el origen a 1024 px esta en
`assets/icono-web.png`.

---

## Lista de verificacion

Hasta que estos seis puntos pasen, el montaje no esta terminado.

1. **Entras como admin.** Abres la app con el correo del punto 3 y ves cuatro
   pestanas, incluida **Editor**.
2. **Una ruta publicada aparece.** Creas una ruta, le anades dos bares con sus
   horas, la publicas, y sale en **Sellos** y en **Ruta** con la linea uniendo
   los pines.
3. **El registro publico esta cerrado pero la invitacion funciona.** Desde
   **Mi perfil > Invitaciones** creas un enlace, lo abres en otro movil y creas
   una cuenta. Si falla con "signups not allowed", la funcion `redeem-invite`
   no esta desplegada o esta desplegada con `verify_jwt` activado.
4. **El invitado NO ve el editor.** Esa cuenta nueva ve tres pestanas, no
   cuatro.
5. **El enlace no vale dos veces.** Vuelve a abrir el mismo enlace: tiene que
   decir que ya se ha usado.
6. **La geocerca muerde.** Intenta sellar un bar estando lejos: te dice a
   cuantos metros estas y el boton no deja. Prueba tambien fuera de la ventana
   horaria: te dice cuanto falta para que abra.

Los puntos 3, 5 y 6 son los que de verdad hay que probar: son las tres reglas
que sostienen todo lo demas.

---

## Problemas conocidos

**`npm install <paquete>` falla con ERESOLVE.** Usa siempre
`npx expo install <paquete>`. El arbol tiene un `react-dom` fijado a `19.2.3`
por `overrides` en `package.json`, porque `expo-router` arrastra `react-dom`
para web y la version que npm elige por su cuenta pide `react@^19.3.0`, que
choca con el `react@19.2.3` de Expo 57.

**El mapa sale gris.** Falta `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, o la clave no
tiene habilitado el SDK de esa plataforma, o cambiaste el `.env` sin recompilar.
La clave entra por el config plugin de `react-native-maps`, asi que vive en el
binario: cambiarla exige `eas build` otra vez, no basta con recargar.

**"Faltan EXPO_PUBLIC_SUPABASE_URL..." al arrancar.** Creaste el `.env` con
Metro ya corriendo. `npx expo start --clear`.

**Sellar dice `TOO_FAR_...` estando dentro del bar.** El GPS en interiores se
va con facilidad. Sube `radius_m` de ese bar en el editor; el maximo que acepta
el esquema son 2000 m.

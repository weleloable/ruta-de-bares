# Ruta de Bares 🍻

App movil para organizar una ruta de bares y llevar la cuenta de los sellos,
al estilo de la compostelana del Camino.

Cualquiera puede crearse una cuenta, pero **solo ves las rutas a las que te
han invitado**.

## Las cuatro pestanas

| Pestana | Quien la ve | Que hace |
| --- | --- | --- |
| **Sellos** | todos | La compostelana: un hueco por bar, se rellena al sellar |
| **Ruta** | todos | Mapa con los bares numerados y el trazado que los une (Google Maps en la app nativa, OpenStreetMap en la web) |
| **Editor** | solo admins | Crear rutas, anadir bares tocando el mapa (o pegando coordenadas en web), ordenarlos, fijar horarios, publicar |
| **Mi perfil** | todos | Foto, nombre, entrar en una ruta con un enlace o un codigo, y para admins el editor de rutas y el panel de invitaciones |

## Como se consigue un sello

El usuario pulsa **Sellar** y el servidor comprueba cuatro cosas antes de
concederlo:

1. Es miembro de esa ruta (le invitaron y canjeo la invitacion).
2. La ruta esta publicada.
3. Es la hora: `now()` cae dentro de la ventana `opens_at` - `closes_at` de ese bar.
4. Esta alli: la distancia haversine a las coordenadas del bar no pasa de su
   `radius_m`.

Las cuatro viven en la funcion `claim_stamp` de Postgres, y es el **unico** camino
para crear un sello: la tabla `stamps` no tiene politica de `INSERT` y al rol
`authenticated` se le ha revocado el privilegio. El cliente no puede inventarse
sellos ni con la clave en la mano.

`src/features/stamps/rules.ts` repite esas reglas en TypeScript, pero solo para
la interfaz: para decir "te faltan 40 m" o "abre en 25 min" sin ir al servidor.
Si las dos discrepan, manda el SQL.

## Como entra la gente

- **Cuenta**: cualquiera se registra con correo y contrasena. Una cuenta recien
  creada no ve ninguna ruta: el registro no da acceso a nada.
- **Ruta**: un admin genera un enlace desde **Mi perfil > Invitaciones**
  eligiendo la ruta, cuantas horas dura (2, 4 u 8) y cuantas plazas tiene. El
  mismo enlace sirve para todo el grupo hasta agotar las plazas o caducar.
- **Administradores**: la cuenta se asciende a mano con una linea de SQL en el
  panel de Supabase. No hay ninguna pantalla que conceda el rol.

Quien canjea entra en `route_members`, que es lo unico que hace visible una
ruta. Anular un enlace lo mata para los que vengan, pero no echa a quien ya
entro. Todo esto son dos funciones de Postgres (`create_route_invite` y
`redeem_route_invite`), no hay Edge Functions.

## Stack

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) + React Native 0.86, TypeScript estricto
- [Expo Router](https://docs.expo.dev/router/introduction/) para la navegacion
- [Supabase](https://supabase.com/) para auth, Postgres con RLS y Storage
- [react-native-maps](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) con Google Maps
- En web: [Leaflet](https://leafletjs.com/) + [react-leaflet](https://react-leaflet.js.org/) con teselas de OpenStreetMap, y app instalable (PWA): ver seccion 8 de [docs/SETUP.md](docs/SETUP.md)
- Sesion en el keystore del sistema via `expo-secure-store`, troceada porque
  una sesion de Supabase pasa del limite de 2048 bytes por valor

## Estructura

```
app/                      pantallas (Expo Router; la carpeta ES el mapa de rutas)
  (auth)/                 login y registro
  (tabs)/                 las cuatro pestanas
  editor/[routeId]/       lista de bares de una ruta y formulario de bar
src/
  features/<dominio>/     reglas, llamadas a datos y componentes de cada dominio
  components/             piezas de interfaz compartidas
  lib/                    cliente de Supabase, tema, fechas, utilidades
  types/database.ts       espejo en TypeScript del esquema SQL
supabase/
  migrations/0001_init.sql  tablas, RLS, claim_stamp, bucket de avatares
docs/SETUP.md             puesta en marcha, de cero a la app corriendo
```

## Empezar

Lee [docs/SETUP.md](docs/SETUP.md). Resumido:

```bash
npm install
cp .env.example .env            # y rellena los tres valores
npx expo start --dev-client     # necesita un development build, no Expo Go
```

El mapa es un modulo nativo con la clave de Google dentro, asi que Expo Go no
vale. El build se hace una vez con `eas build --profile development`.

La version web se publica sola en <https://weleloable.github.io/ruta-de-bares/>
en cada push a `master` (ver "Publicar la web en GitHub Pages" en [docs/SETUP.md](docs/SETUP.md)).

## Tests

```bash
npm test         # ~250 tests, sin red, en segundos
npm run typecheck
npm run check    # typecheck + tests + funciones (gate de cada commit)
npm run doctor   # expo-doctor: versiones y dependencias nativas
npm run verificar:web     # mapa web en Chrome headless: comprueba en pixeles que no se reencuadra de mas (20 s - 1 min)
```

Los tests corren con `node --test` sobre los ficheros `.ts` directamente (Node
24 borra los tipos solo), sin Jest ni transpilacion. Cubren lo que puede fallar
en silencio: la geocerca, las ventanas horarias, el troceado de la sesion, el
parseo de enlaces de invitacion y la validacion del editor.

`tests/migration.test.ts` pasa `0001_init.sql` por el parser **real** de
Postgres (`pg-query-emscripten`, el mismo codigo C compilado a wasm) y ademas
comprueba las invariantes que no se pueden perder por descuido: RLS activo en
las cinco tablas, ninguna via de `INSERT` en `stamps`, y que `claim_stamp`
siga levantando sus cuatro errores. Lo que NO comprueba es el comportamiento
en caliente: eso es la lista de verificacion de [docs/SETUP.md](docs/SETUP.md).

## Instalar dependencias

Siempre con `npx expo install <paquete>`, nunca `npm install <paquete>`.
Ver "Problemas conocidos" en [docs/SETUP.md](docs/SETUP.md).

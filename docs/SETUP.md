# Puesta en marcha

De cero a la app corriendo en un movil. Unos 30 minutos la primera vez, casi
todo esperando a que compile.

Al final hay una **lista de verificacion**: no des el montaje por bueno hasta
que los seis puntos pasen.

---

## 1. Base de datos

En tu proyecto de Supabase, **SQL Editor > New query**. Pega y ejecuta
**cada migracion entera, en orden**, una query por fichero.

> **Cada migracion se pega UNA SOLA VEZ y nunca se vuelve a pegar.** No da
> error al repetirse, y ahi esta el peligro: la mitad definen funciones que una
> migracion posterior rehizo, asi que re-ejecutar una vieja **devuelve esas
> funciones a su version antigua en silencio**. Ya paso: relanzar la 0006 dejo a
> `match_require_target` sin la comprobacion de bloqueos, o sea que la gente
> bloqueada volvia a poder interactuar, y no se vio hasta comparar el md5 de la
> funcion. La cabecera de cada fichero dice si se puede repetir y que funciones
> suyas quedaron obsoletas. Si te pierdes, sigue por la siguiente sin aplicar:
> aplicar de menos se arregla; aplicar de mas, no.


1. [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
   y **Run**.
2. [`supabase/migrations/0002_guard_role_sql_editor.sql`](../supabase/migrations/0002_guard_role_sql_editor.sql)
   y **Run**. Sin esta, el punto 3 falla con `ROLE_CHANGE_FORBIDDEN`.
3. [`supabase/migrations/0003_nombre_unico.sql`](../supabase/migrations/0003_nombre_unico.sql)
   y **Run**. Hace el "Nombre de bartalla" unico (sin distinguir mayusculas),
   sin espacios y de hasta 30 caracteres.
4. [`supabase/migrations/0004_invitaciones_por_ruta.sql`](../supabase/migrations/0004_invitaciones_por_ruta.sql)
   y **Run**. Cambia el modelo de acceso entero: ver el aviso de abajo antes de
   pegarla.
5. [`supabase/migrations/0005_tirate_una_cana.sql`](../supabase/migrations/0005_tirate_una_cana.sql)
   y **Run**. Tirate una cana: tablas `match_*` y sus funciones.
6. [`supabase/migrations/0006_cana_visto.sql`](../supabase/migrations/0006_cana_visto.sql)
   y **Run**. Quita el "No me gusta": solo Me gusta y Visto.
7. [`supabase/migrations/0007_avatar_miniatura.sql`](../supabase/migrations/0007_avatar_miniatura.sql)
   y **Run**. Miniatura de la foto de perfil para las listas.
8. [`supabase/migrations/0008_cana_solo_la_pregunta.sql`](../supabase/migrations/0008_cana_solo_la_pregunta.sql)
   y **Run**. Retira GIFs y zumbidos: solo la pregunta de la cerveza.
9. [`supabase/migrations/0009_cana_bloqueos_denuncias.sql`](../supabase/migrations/0009_cana_bloqueos_denuncias.sql)
   y **Run**. Bloquear y denunciar, con las funciones del panel de administracion.
10. [`supabase/migrations/0010_cana_consentimiento_y_datos.sql`](../supabase/migrations/0010_cana_consentimiento_y_datos.sql)
   y **Run**. Consentimiento al activar, y descargar o borrar tus datos.
11. [`supabase/migrations/0011_cana_chat_sin_abrir.sql`](../supabase/migrations/0011_cana_chat_sin_abrir.sql)
   y **Run**. Marca los chats que nunca has abierto (la burbujita de la pestana).
12. [`supabase/migrations/0012_cana_pertenencia_real.sql`](../supabase/migrations/0012_cana_pertenencia_real.sql)
   y **Run**. La cana pasa a usar `route_members` en vez de la regla provisional.
13. [`supabase/migrations/0013_cana_alertas_admin.sql`](../supabase/migrations/0013_cana_alertas_admin.sql)
   y **Run**. Reclamar, leer y contar denuncias para la bandeja de alertas.
14. [`supabase/migrations/0014_admin_expulsar_de_ruta.sql`](../supabase/migrations/0014_admin_expulsar_de_ruta.sql)
   y **Run**. Expulsar de una ruta desde la bandeja, sin borrar la cuenta.
15. [`supabase/migrations/0015_vetos_y_avisos.sql`](../supabase/migrations/0015_vetos_y_avisos.sql)
   y **Run**. Los vetos aguantan, y toda sancion exige motivo y avisa a la
   persona. Genera una clave en `app_secrets`: **no se borra ni se regenera**,
   o los vetos puestos dejarian de reconocer el correo.
16. [`supabase/migrations/0016_denunciar_exige_estar_dentro.sql`](../supabase/migrations/0016_denunciar_exige_estar_dentro.sql)
   y **Run**. Denunciar y bloquear exigen estar en la ruta y no estar sancionada.
17. [`supabase/migrations/0017_el_rastro_sobrevive.sql`](../supabase/migrations/0017_el_rastro_sobrevive.sql)
   y **Run**. El expediente de moderacion deja de borrarse con la cuenta.
18. [`supabase/migrations/0018_lista_de_moderaciones.sql`](../supabase/migrations/0018_lista_de_moderaciones.sql)
   y **Run**. La lista de a quien se ha moderado, para poder retirar un veto.
19. [`supabase/migrations/0019_activar_la_cana_arreglado.sql`](../supabase/migrations/0019_activar_la_cana_arreglado.sql)
   y **Run**. Arregla activar la cana por primera vez, que la 0015 rompio.
20. [`supabase/migrations/0020_foto_perfil_con_revision.sql`](../supabase/migrations/0020_foto_perfil_con_revision.sql)
   y **Run**. La foto de perfil nueva ya no se pone al momento: la aprueba un
   admin desde **Alertas de administracion**. No toca las fotos que ya estan
   puestas. Para que cuentas vacias no llenen la bandeja (el alta es abierta),
   solo pueden enviar fotos quienes estan en alguna ruta, con un maximo de 5 al
   dia; un admin no tiene ese limite. **Ojo con el orden**: si despliegas la app antes de pegarla, subir
   una foto falla (la funcion no existe) y la bandeja de alertas avisa de que
   no puede leer las fotos; pegala primero. Cambia tres cosas del bucket
   `avatars` que conviene conocer: ya no se puede sobrescribir un fichero
   enviado ni la foto que ya tienes puesta (se quita la policy de UPDATE y no
   se admite reusar un nombre); ya no se puede **listar** el bucket con la
   clave publicable, solo tu propia carpeta (antes cualquiera veia los nombres
   de las fotos pendientes de todos); y los nombres de foto llevan un sufijo
   aleatorio, porque la foto pendiente sigue siendo legible por URL hasta que
   se aprueba (un bucket publico sirve por URL sin policy; eso lo cierra la
   0023, que hace el bucket privado).
21. [`supabase/migrations/0021_borrar_mi_cuenta.sql`](../supabase/migrations/0021_borrar_mi_cuenta.sql)
   y **Run**. Crea `delete_my_account()` y `delete_my_account_blockers()`, que
   usa **Mi perfil > Borrar Cuenta**: borra la cuenta y todo lo que cuelga de
   ella (sellos, pertenencia a rutas, perfil, votos, chats y bloqueos de la
   cana...). Lo que NO borra es el rastro de moderacion (registro, denuncias en
   las que participo, veto de ruta y suspension, ver 0015 y 0017): si borrarse
   la cuenta lo limpiase, una sancion se esquivaria con un clic. **No deja
   borrar** (y lo dice antes de tocar nada) a: administradores (se quitan a
   mano en Supabase), quien creo alguna ruta, y quien tiene una denuncia sin
   resolver, que se desbloquea al resolverla. (Tener la cana desactivada
   tambien impedia borrarse; **eso lo quita la 0024**.) Las
   fotos las borra la app antes de llamar a la funcion, porque Storage no se
   deja borrar por SQL. **Ojo con el orden**: si despliegas la app antes de
   pegarla, el enlace sale pero avisa de que falta la migracion.
   Comprobacion: con una cuenta de prueba, Borrar Cuenta, y en Supabase >
   Authentication no debe quedar el usuario, ni su carpeta en Storage >
   `avatars`.
22. [`supabase/migrations/0022_sin_truncate.sql`](../supabase/migrations/0022_sin_truncate.sql)
   y **Run**. Le quita TRUNCATE a `anon` y `authenticated` sobre las tablas de
   la app, y a lo que se cree en el futuro. Viene de los permisos por defecto
   de Supabase (`all` incluye TRUNCATE) y **la RLS no protege de eso**: es un
   privilegio de tabla, no de fila. No cambia nada visible; si algo dejara de
   funcionar, seria un TRUNCATE que la app no hace.
23. [`supabase/migrations/0023_bucket_de_fotos_privado.sql`](../supabase/migrations/0023_bucket_de_fotos_privado.sql)
   y **Run**. El bucket `avatars` pasa a **privado**: antes, con el enlace en la
   mano, cualquiera veia la cara de cualquiera sin sesion y sin clave, y la
   cuadricula de la cana reparte esos enlaces. Ahora la app pide una URL firmada
   de 15 minutos, y firmar si pasa por la policy. De otra persona solo se puede
   leer el fichero que es HOY su foto aprobada (y su miniatura): lo pendiente y
   lo rechazado siguen siendo solo suyos y de los admins. **Ojo con el orden, y
   aqui importa de verdad**: despliega ANTES la web (y la build de EAS) y pega
   esto DESPUES. Al reves, una version vieja de la app pide la URL publica a un
   bucket que ya no sirve nada y **todo el mundo se queda sin fotos** hasta que
   actualice. Comprobacion: pega en el navegador, sin sesion, la URL que hay en
   `profiles.avatar_url` de alguien; antes devolvia la imagen, ahora tiene que
   dar error. Y dentro de la app las caras se siguen viendo.

24. [`supabase/migrations/0024_veto_de_cana_con_hmac.sql`](../supabase/migrations/0024_veto_de_cana_con_hmac.sql)
   y **Run**. El veto de cana pasa a guardar un HMAC del correo (tabla
   `cana_bans`), como el de ruta y la suspension, y **deja de impedir borrar la
   cuenta**: antes, tener la cana desactivada bloqueaba la supresion sin plazo,
   siendo el escalon mas bajo de la sancion. Rellena sola los vetos que ya
   estuviesen puestos.
25. [`supabase/migrations/0025_exportar_todos_mis_datos.sql`](../supabase/migrations/0025_exportar_todos_mis_datos.sql)
   y **Run**. `export_my_data()`: la descarga de **Mi perfil > Política de
   privacidad y datos > Ver lo que guardamos** pasa
   a traer todo (cuenta y correo, rutas, sellos con coordenadas, fotos
   enviadas, avisos y sanciones) y no solo lo de la cana. **Ojo con el orden**:
   si despliegas la app antes de pegarla, "Ver mis datos" falla.
26. [`supabase/migrations/0026_canal_de_contacto.sql`](../supabase/migrations/0026_canal_de_contacto.sql)
   y **Run**. Crea `user_messages` y el canal de **Escribir a la organizacion**
   (Mi perfil) y **reclamar una decision** (dentro de cada aviso). Los mensajes
   caen en la bandeja de Alertas como una fuente mas. **Ojo con el orden**: si
   despliegas antes, los dos botones salen pero fallan al enviar, y la bandeja
   avisa de que no puede leer los mensajes.
27. [`supabase/migrations/0027_rutas_terminadas.sql`](../supabase/migrations/0027_rutas_terminadas.sql)
   y **Run**. Una ruta termina, y borrarla se lleva sus datos (tambien el veto
   de cana de esa ruta).
28. [`supabase/migrations/0028_la_denuncia_congela_la_prueba.sql`](../supabase/migrations/0028_la_denuncia_congela_la_prueba.sql)
   y **Run**. La denuncia guarda la foto y la frase de ese momento.
29. [`supabase/migrations/0029_etiquetas_reales.sql`](../supabase/migrations/0029_etiquetas_reales.sql)
   y **Run**. Catalogo de etiquetas de La Caña real en vez de los placeholders.
30. [`supabase/migrations/0030_etiquetas_cultura_pop.sql`](../supabase/migrations/0030_etiquetas_cultura_pop.sql)
   y **Run**. Las 30 etiquetas, en primera persona y por orden alfabetico.
   Quien ya tenia una marcada la conserva con el texto nuevo.
31. [`supabase/migrations/0031_exportar_datos_de_acceso.sql`](../supabase/migrations/0031_exportar_datos_de_acceso.sql)
   y **Run**. "Ver lo que guardamos" trae tambien lo del sistema de acceso: con
   Google, el correo, nombre, foto e identificador que dio Google. Sin orden
   que cuidar: la app ensena lo que venga.
32. [`supabase/migrations/0032_fotos_que_sobran_y_pruebas.sql`](../supabase/migrations/0032_fotos_que_sobran_y_pruebas.sql)
   y **Run**. Las fotos que ya no usa nadie (sustituidas, rechazadas) se borran
   al momento; la foto de una denuncia se guarda como prueba hasta que un admin
   la elimina desde la ficha o se borra la ruta, y nadie puede borrarla antes,
   tampoco llamando a la API. Borrarse la cuenta ya no se bloquea por tener una
   denuncia abierta. El orden da igual: una app nueva sobre una base sin la
   0032 funciona como antes (solo que sin limpiar ni ficha de la foto). **La
   primera limpieza borra de verdad** lo que se acumulo desde la 0020 (fotos
   rechazadas y sustituidas): si quieres conservarlo, haz copia del bucket antes.
33. [`supabase/migrations/0033_rutas_terminadas_vistas.sql`](../supabase/migrations/0033_rutas_terminadas_vistas.sql)
   y **Run**. Apunta que admin ha visto ya el aviso de una ruta terminada (el de
   arriba de Alertas de administracion), para apagar su punto rojo. Sin ella la
   app funciona: el aviso sale igual, solo que el punto rojo no cuenta las rutas.
34. [`supabase/migrations/0034_minijuegos.sql`](../supabase/migrations/0034_minijuegos.sql)
   y **Run**, despues de la 0033. Crea `minigame_scores` y `maestro_beers` (sin
   privilegios para la app: todo pasa por funciones) y rehace `export_my_data()`
   para que "Ver mis datos" incluya los minijuegos. Es el **ranking por ruta** de
   La Cana Perfecta y la lista de cervezas de Maestro Cervecero, que solo ven
   quienes estan dentro de esa ruta. **Ojo con el orden**: si despliegas la app
   antes, la pestana Juegos funciona pero al guardar avisa de que falta la
   migracion. Tras pegarla, la 0031 ya no se vuelve a pegar.

Y una cosa que no es SQL: el **responsable del tratamiento y el correo de
privacidad** estan sin decidir. Viven en `src/features/legal/responsable.ts`;
mientras `PENDIENTE` sea `true`, la pantalla de Privacidad avisa de que es un
borrador. Antes de abrir esto a gente de verdad hay que cerrarlo.

La 0001 crea las cinco tablas (`profiles`, `routes`, `route_bars`, `stamps`,
`invites`), las politicas de RLS, la funcion `claim_stamp` y el bucket
`avatars`. La 0002 deja que el propio SQL Editor (y la `service_role`) cambien
el rol de un perfil; un usuario de la app sigue sin poder. La 0003 anade la
regla de nombre unico y hace que el alta nunca falle por una coincidencia:
si el nombre por defecto ya esta cogido, le anade "-2", "-3"... Las cuatro se
pueden volver a ejecutar sin romper nada.

> **La 0004 borra datos y cambia quien ve que.** Hace tres cosas de las que no
> hay vuelta atras con solo re-ejecutarla:
>
> - **Borra la tabla `invites`** de la 0001. Sus filas eran huellas de tokens
>   que ya no abren nada, porque la via que los canjeaba desaparece. Si quieres
>   guardarlas, copia la tabla antes de pegar la migracion.
> - **Las rutas dejan de verse por estar publicadas**: a partir de aqui solo se
>   ve una ruta si eres miembro de ella (tabla `route_members` nueva) o admin.
> - **Mete como miembros a quien ya tenia sellos**, para que nadie que estuviera
>   a mitad de una ruta se quede sin verla. Si tu proyecto esta vacio, no hace nada.

## 2. Abrir el registro publico

Desde la 0004 **cualquiera puede crearse una cuenta**: el control ya no esta en
quien tiene cuenta, sino en a que rutas le invitan. Una cuenta recien creada no
ve ninguna ruta hasta que canjea una invitacion.

**Project Settings > Authentication > User Signups**: enciende
**"Allow new users to sign up"** y guarda. Sin esto, la pantalla de registro
falla con "El registro esta desactivado en el servidor".

**Authentication > Providers > Email**: apaga **"Confirm email"** si no tienes
SMTP configurado. Con la confirmacion encendida y sin SMTP, la gente se registra
y nunca recibe el correo, asi que no puede entrar. La app lo detecta y dice
"Revisa tu correo", pero ese correo no llegara.

> Esto es un cambio de postura deliberado respecto a como nacio el proyecto, no
> un descuido. Antes el registro estaba cerrado porque tener cuenta = ver todo;
> ahora tener cuenta no da acceso a nada.

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

## 4. Edge Functions: ya no hay

Este paso existia para desplegar `create-invite` y `redeem-invite`. La 0004 las
sustituye por dos funciones de Postgres (`create_route_invite` y
`redeem_route_invite`), asi que **no hay nada que desplegar**: van dentro de la
migracion que ya pegaste en el paso 1.

Ya no hace falta la CLI de Supabase para poner el proyecto en marcha, ni Deno
para los `npm run check`.

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

**Enlaces de invitacion.** El enlace que se comparte es una URL normal de esta
web: `https://weleloable.github.io/ruta-de-bares/invitacion?token=...`. Al
abrirla:

- **Sin cuenta o sin sesion**: sale "Te han invitado a una ruta" con *Crear
  cuenta* / *Ya tengo cuenta*. El token se guarda (en `localStorage`, 24 h, un
  solo uso) y, en cuanto hay sesion, la app vuelve a la invitacion, aunque por
  el camino se recargue la pagina (abrir el enlace de confirmacion del correo
  carga la web de nuevo). `localStorage` es de UN navegador/contexto: si el
  usuario confirma el correo o inicia sesion en otro (Safari y la PWA
  instalada de iPhone no lo comparten, ni el navegador interno de WhatsApp o
  Gmail, ni una ventana privada), el token pendiente no viaja. Queda entonces
  el enlace original (vuelve a abrirlo) o pegarlo en **Mi perfil > Entrar en
  una ruta**.
- **Con sesion**: sale el enlace reconocido y un boton *Entrar en la ruta*.
  Un toque y ya eres miembro (el servidor decide si la invitacion sigue
  valiendo: caducidad y plazas).
- **Con la web instalada como app** (seccion 8): en Android, un enlace que cae
  dentro del ambito de la PWA instalada (`/ruta-de-bares/`) *deberia* abrirla,
  pero **no esta verificado en un dispositivo**. En iPhone abre Safari.

**Requisito en Supabase para quien se registra desde el enlace.** Si tienes la
confirmacion de correo activada, el enlace del correo de confirmacion lleva a
la **Site URL** de *Authentication > URL Configuration*. Tiene que ser
`https://weleloable.github.io/ruta-de-bares/` (y esa misma en *Redirect
URLs*). Con el valor por defecto (`localhost`) la persona invitada confirma en
una pagina que no existe y no llega a entrar. La app no fija `emailRedirectTo`:
manda esa configuracion.

**Vista previa.** GitHub Pages sirve el fallback `404.html` con estado HTTP 404
para `/invitacion`. Los navegadores lo pintan igual y el enlace funciona, pero
WhatsApp y Telegram pueden no montar tarjeta de vista previa: el enlace se ve
como texto pulsable y ya esta.

La URL vive en `WEB_APP_URL` (`src/features/invites/link.ts`) y tiene que
coincidir con `WEB_BASE_URL` del workflow: `tests/deploy-web.test.ts` lo
comprueba. Si algun dia cambia el dominio o la subruta, se cambian los dos.

Los enlaces con el esquema antiguo `rutadebares://` siguen valiendo. Ya no
hay donde pegar un codigo pelado: la tarjeta **Mi perfil > Entrar en una ruta**
se quito, la gente entra solo por el enlace. El enlace https **no**
abre la app nativa (development build): para eso Android exige verificar el
dominio con un `assetlinks.json` en la raiz de `weleloable.github.io`, que
una pagina de proyecto de GitHub Pages no controla.

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
| **Android** (Chrome) | Menu de Chrome > "Instalar aplicacion" (o el icono de instalar de la barra de direcciones) |
| **iPhone / iPad** | Abrir en **Safari** > boton Compartir > "Anadir a pantalla de inicio" |

No hay un boton propio para instalar: el navegador ofrece el suyo cuando
quiere (Chrome/Edge en Android y escritorio) o, en iPhone, se hace a mano
desde el menu Compartir. Una vez instalada se abre a pantalla completa con el
icono del logo "RxB" (Don Quijote y Sancho).

Piezas: `public/manifest.json`, `public/icons/`, `public/sw.js` y
`src/lib/pwa.web.ts` (enlaza el manifest y registra el service worker; la app
nativa usa `src/lib/pwa.ts`, que no hace nada). Dos decisiones que no son
obvias:

- **El service worker no cachea la app.** Todo va a la red; solo guarda una
  pagina de "sin conexion". Un service worker que cachea HTML y JS deja a la
  gente con la version vieja tras cada despliegue. Si se cambia `sw.js`, subir
  `VERSION` dentro del fichero.
- **El manifest y el icono de iOS los enlaza la app al arrancar**, no
  `public/index.html`: Expo no reescribe ese fichero con el `baseUrl`
  (`/ruta-de-bares`), asi que un enlace fijo fallaria en GitHub Pages o en
  localhost. La ruta sale de `experiments.baseUrl` en tiempo de ejecucion.

Todos los iconos (nativo, Android adaptativo, PWA, favicon y el logo del
login) salen de `assets/marca/logo-10.png`; el logo de la barra superior, de
`assets/marca/logo-11.png`. Para cambiarlos: sustituir el original y correr
`python scripts/generar-iconos.py` (necesita Pillow). No se editan a mano:
el script ya pone los margenes que pide cada plataforma. Si cambia el color
de fondo del logo, cambiar tambien `CREMA` en el script y
`android.adaptiveIcon.backgroundColor` en `app.config.ts`, y subir `VERSION`
en `public/sw.js` no hace falta (el service worker no cachea los iconos).

## 9. Entrar con Google

El boton **Continuar con Google** esta en login y registro, junto al correo y
contrasena (que siguen funcionando). Con Google no hay diferencia entre entrar y
crear la cuenta: la primera vez la crea. Crearla asi tampoco da acceso a nada:
sigue haciendo falta una invitacion a una ruta. El nombre visible sale del
correo, como siempre; no se importa el nombre ni la foto de Google.

**Hasta que hagas esto, el boton sale pero Supabase contesta "provider is not
enabled".** El codigo ya esta; falta configurar dos consolas, que solo puedes
hacer tu.

### 9.1 Google Cloud Console

La consola se llama ahora **Google Auth Platform** (menu lateral: Vision general,
Branding, Publico, Clientes, Acceso a los datos). Los nombres pueden variar un
poco segun el idioma.

1. **Proyecto.** <https://console.cloud.google.com> > selector de proyectos (arriba
   a la izquierda, junto al logo) > **Proyecto nuevo** > nombre `Ruta de Bares` >
   **Crear**. Comprueba que queda seleccionado arriba.
2. **Empezar.** En el buscador de arriba escribe *Google Auth Platform* y abrelo.
   Si es la primera vez, pulsa **Comenzar**: nombre `Ruta de Bares` y tu correo de
   asistencia > **Siguiente**; Publico: **Externo** > **Siguiente**; correo de
   contacto > **Siguiente**; marca aceptar la politica de datos de usuario >
   **Continuar** > **Crear**.
3. **Branding** (menu izquierdo). Pagina principal:
   `https://weleloable.github.io/ruta-de-bares/`. Politica de privacidad:
   `https://weleloable.github.io/ruta-de-bares/privacidad/` (con la barra final:
   es la pagina HTML estatica que genera `scripts/generar-privacidad.mjs` al
   publicar y responde 200; sin barra, Pages redirige a esa). Dominios autorizados:
   anade `weleloable.github.io` y `supabase.co`. **Guardar**. Ojo: la
   politica aun es un borrador (`src/features/legal/responsable.ts`, `PENDIENTE`),
   y Google no acepta plantillas ni borradores: hay que cerrarla antes de pedir
   la verificacion de la marca.
   Para que Google de por bueno el dominio hay que verificarlo en **Google Search
   Console** (<https://search.google.com/search-console>) con la misma cuenta del
   proyecto. `github.io` es un sufijo publico, asi que `weleloable.github.io` cuenta
   como dominio propio; esta sin probar si basta verificar la propiedad de prefijo
   de URL `https://weleloable.github.io/ruta-de-bares/` o hace falta la raiz.
   Lo que exige Google de la politica esta en
   <https://support.google.com/cloud/answer/13806988>, y como se cubre, en
   `src/features/legal/politica.ts`.
4. **Acceso a los datos** > **Anadir o quitar permisos**. Marca SOLO
   `.../auth/userinfo.email`, `.../auth/userinfo.profile` y `openid` >
   **Actualizar** > **Guardar**. Son los no sensibles: no piden verificacion.
5. **Publico** > *Estado de la publicacion: Pruebas* > **Publicar aplicacion** >
   **Confirmar**. En *Pruebas* solo entran los correos que anadas como usuarios de
   prueba (hasta 100); publicada, entra cualquiera.
6. **Clientes** > **Crear cliente**. Tipo: **Aplicacion web**. Nombre:
   `Ruta de Bares web`. En *URI de redireccionamiento autorizados* > **Anadir URI**
   y pega exactamente `https://<tu-proyecto>.supabase.co/auth/v1/callback` (el
   `<tu-proyecto>` es la parte inicial de `EXPO_PUBLIC_SUPABASE_URL` en tu `.env`).
   Deja vacios los *Origenes de JavaScript*. **Crear**. Sale una ventana con el
   **ID de cliente** y el **Secreto de cliente**: copialos o descarga el JSON. No
   se suben a git ni se pegan en ningun chat.

Con este unico cliente "Web" sirven la web Y el movil: en el movil se abre el
navegador del sistema y Supabase hace de intermediario, asi que NO hace falta un
cliente de Android ni de iOS ni el SHA-1.

### 9.2 Supabase

1. <https://supabase.com/dashboard> > tu proyecto > menu izquierdo **Authentication**
   > **Sign In / Providers** (o **Providers**) > **Google** > activa **Enable Sign
   in with Google** > pega **Client ID** y **Client Secret** (los del paso 9.1.6) >
   deja *Skip nonce checks* desactivado > **Save**. Ahi mismo aparece la *Callback
   URL*: es la misma que va en 9.1.6.
2. **Authentication > URL Configuration > Redirect URLs > Add URL**, una a una, y
   **Save**:
   - `https://weleloable.github.io/ruta-de-bares/**` (la web publicada)
   - `http://localhost:8081/**` (desarrollo local)
   - `rutadebares://**` (el movil: vuelve a `rutadebares://auth-callback`)
   Sin esto Supabase rechaza la vuelta y manda a la Site URL.
3. La **Site URL** sigue siendo la web publicada (seccion 7).
4. **Authentication > Sign In / Providers > Email**: revisa que **Confirm email**
   siga activado. Es lo que impide que alguien cree
   una cuenta con contrasena usando TU correo antes de que entres con Google, y
   evita una toma de cuenta al enlazarse las dos.

### 9.3 Movil nativo

`expo-web-browser` es un modulo nativo: hace falta un **development build
nuevo** (`eas build --profile development --platform android`). Con el
development build anterior el boton falla al abrirse.

### 9.4 Que hay que saber

- **Enlaces de invitacion abiertos dentro de WhatsApp o Telegram**: Google
  bloquea el inicio de sesion en esos navegadores integrados
  (`disallowed_useragent`). La persona tiene que abrir el enlace en Chrome o
  Safari, o usar correo y contrasena.
- **Una cuenta que ya existe con correo y contrasena** y entra con Google con el
  mismo correo se une en una sola: Supabase enlaza las identidades cuando el
  correo coincide y esta verificado.
- **Correo confirmado por PKCE**: desde este cambio el cliente usa PKCE. El enlace
  del correo de confirmacion, si se abre en el mismo navegador, inicia sesion
  solo; abierto en otro, solo confirma y se entra con la contrasena.
- **Vetos y suspensiones** (0015, 0017) y **Borrar Cuenta** (0021) funcionan igual:
  van por el correo y por el id, no por como se entro.
- **iPhone con la PWA instalada**: la PWA y Safari no comparten
  almacenamiento; el inicio de sesion suele funcionar pero esta sin probar en un
  dispositivo.

### 9.5 Comprobacion

Web local: `npx expo start --web`, *Continuar con Google* > eliges cuenta > vuelves
a la app con la sesion abierta (sin invitacion veras la pantalla vacia de una
cuenta nueva). Movil: development build, mismo recorrido; al terminar debe
volver a la app sola.

| Lo que ves | Causa |
| --- | --- |
| Pagina JSON `provider is not enabled` | Google no esta activado en Supabase (9.2.1) |
| `redirect_uri_mismatch` de Google | La URI del paso 9.1.6 no es identica a la Callback URL de Supabase (sin barra final ni espacios) |
| `Access blocked` / app no verificada | Falta *Publicar aplicacion* (9.1.5) o tu correo no esta como usuario de prueba |
| Vuelves al login sin sesion | Falta la URL en Redirect URLs de Supabase (9.2.2): `http://localhost:8081/**`, la web publicada o `rutadebares://**` |

---

## Lista de verificacion

Hasta que estos ocho puntos pasen, el montaje no esta terminado.

1. **Entras como admin.** Abres la app con el correo del punto 3 y ves la barra
   superior con tu avatar; desde **Mi perfil** llegas a **Editor de rutas**.
2. **Una ruta publicada aparece.** Creas una ruta, le anades dos bares con sus
   horas, la publicas, y sale en **Sellos** y en **Ruta** con la linea uniendo
   los pines.
3. **Cualquiera puede registrarse.** Desde otro navegador creas una cuenta con
   **Crear cuenta**. Si falla con "El registro esta desactivado en el servidor",
   te falta el paso 2 de esta guia.
4. **Esa cuenta nueva NO ve ninguna ruta.** Es el punto mas importante de todos:
   entra y las pestanas Sellos y Ruta tienen que estar vacias, aunque la ruta
   del punto 2 este publicada. Si la ve, la 0004 no se ha aplicado.
5. **La invitacion mete en la ruta.** Desde **Mi perfil > Invitaciones** creas
   un enlace para esa ruta y lo abres en el movil de la otra cuenta (o en una
   ventana de incognito): tiene que cargar la web en
   `.../ruta-de-bares/invitacion?token=...`, pedir sesion si no la hay y, con
   *Entrar en la ruta*, meterte en ella. Ahora si ve la ruta. (Ya no existe
   el boton **Mi perfil > Entrar en una ruta** para pegar el codigo a mano:
   solo se entra por el enlace.)
   Si la otra cuenta es nueva y tienes la confirmacion de correo activada,
   comprueba tambien que el correo de confirmacion lleva a la web y no a
   `localhost` (Site URL de Supabase, seccion 7).
6. **El tope se respeta.** Crea una invitacion de 1 plaza, gastala, e intenta
   entrar con una tercera cuenta: tiene que decir que ya no quedan plazas.
7. **La geocerca muerde.** Intenta sellar un bar estando lejos: te dice a
   cuantos metros estas y el boton no deja. Prueba tambien fuera de la ventana
   horaria: te dice cuanto falta para que abra.
8. **Una foto nueva pasa por revision.** Con una cuenta que NO sea admin (y que
   ya este dentro de una ruta), cambia la foto en **Mi perfil**: tiene que decir "en revision" y seguir viendose la
   anterior. Con tu cuenta de admin, en **Mi perfil > Alertas de administracion**
   aparece "Foto de perfil nueva" (y la burbuja cuenta una mas): apruebala y la
   foto aparece; en otra prueba, rechazala con un motivo y comprueba que la
   persona lo lee en Mi perfil. Si esa cuenta pudiera cambiar su foto sin que
   nadie la apruebe, la 0020 no esta aplicada. **Comprueba tambien que las
   fotos de los demas siguen viendose** (en la grilla de la cana, por ejemplo):
   la 0020 cierra el listado del bucket, y esto es lo que confirma que una foto
   por URL publica sigue cargando sin policy de lectura. Si dejasen de verse,
   hay que devolverle a `avatars_read` el `to public` y avisar.

Los puntos 4, 6 y 7 son los que de verdad hay que probar: son las tres reglas
que sostienen todo lo demas. El 4 es el que confirma que el cambio de modelo
esta vivo en tu base de datos y no solo en el codigo.

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

# Tirate una cana

Un "tinder cervecero" entre las personas que participan en la misma ruta. Vive
en la pestana **Cana** (el nombre completo va en la cabecera: no cabe en la
barra con cinco pestanas).

Documento de diseno completo (pantallas, riesgos, roadmap):
<https://claude.ai/artifact/Hhb8GGq7BTTrrMRtjgrpPf>. Este fichero recoge lo que
ya esta decidido y lo que hace falta para trabajar en el codigo.

## Como funciona

1. **Desactivado por defecto.** La pestana explica que, si lo activas, quienes
   tambien lo tengan activado en tu ruta podran ver tu nombre y tu foto y
   ofrecerte una cerveza.
2. **Primera activacion:** confirmar mayoria de edad y presentarse con una frase
   de hasta 120 caracteres y hasta 5 etiquetas. Se puede editar despues.
3. **Grilla** con foto y nombre de quien lo tiene activado en la ruta. Al tocar
   una tarjeta: foto grande, frase, etiquetas y un unico boton, **Me gusta**.
4. **Solo Me gusta, sin "No me gusta"** (0006). Abrir la ficha de alguien lo
   deja como **Visto**; darle Me gusta lo marca, y volver a tocar lo quita (y
   vuelve a Visto). Me gusta mutuo = conexion. Quitar el Me gusta de una
   conexion pide confirmar: la cierra y borra el chat.
   Filtros: Todos, Me gusta, Visto, Conexiones, Nuevos.
5. **Conexion: solo la pregunta** (0008). Lo unico que se puede hacer es
   ofrecer la cana: "Te tomas una cerveza conmigo?", que se responde Si, No o
   "Preguntamelo dentro de un rato". Tras el Si cada persona manda **un**
   mensaje de hasta 120 caracteres. No hay GIFs ni zumbidos: se retiraron
   porque dan de sobra para molestar a alguien toda una noche y no hacen falta
   para quedar. Con un solo mensaje por persona, ademas, una denuncia sobre un
   texto tiene exactamente un mensaje por lado que mirar.

## Como se ve cada estado: "la cana se llena"

Por peticion de diseno, solo colores de la paleta cervecera de `src/lib/theme.ts`
(nada de verde, rojo ni turquesa) y cada estado con su propia forma, para que se
lea tambien en gris o con daltonismo. Propuesta y alternativas descartadas:
<https://claude.ai/artifact/P9nn8iZsR4G8Sf73cNXHnE>.

| Estado | Tarjeta | Vaso (`VasoCana`) |
| --- | --- | --- |
| Sin votar (Nuevos) | borde crema fino | ninguno |
| Me gusta | borde cerveza | media cana |
| Conexion | borde tostado con doble aro y nombre sobre tostado | cana llena con espuma |
| Visto | borde discontinuo y foto apagada en blanco y negro | vaso vacio |

El mismo vaso aparece en los filtros, en la leyenda sobre la grilla y en la ficha.
Los vasos se dibujan con Views, sin SVG: `react-native-svg` obligaria a
recompilar el development build. `tests/match-paleta.test.ts` impide volver a
meter verde, turquesa o colores escritos a mano en la feature. En iPhone la foto
de Visto solo se apaga (el filtro de gris no esta soportado alli); el borde
discontinuo y el vaso vacio siguen marcando el estado.

## Decisiones

Aceptadas el 17-09-2026. Algunas se revisaran; si cambia una, cambia tambien
la migracion (una nueva, nunca editando la publicada) y su test.

| ID | Decision |
| --- | --- |
| D1 | Votos y conexiones son **por ruta**: cada ruta es un evento y empieza de cero. |
| D2 | Tras un **No**, el Me gusta de quien rechaza pasa a **Visto** y el de quien pregunto se queda como estaba. El chat se borra. (Hasta la 0005 pasaba a No me gusta.) |
| D3 | El estado de la pregunta pertenece a la **pareja**: cerrar y reabrir la conexion no deja volver a preguntar. |
| D4 | Pregunta cualquiera de los dos, con **una sola pregunta viva** a la vez. |
| D5 | "Dentro de un rato": se puede volver a preguntar a los **30 min**, con **2 aplazamientos** como maximo. |
| D6 | El filtro Me gusta **incluye las conexiones**. |
| D7 | Tras el Si, **1 texto por persona** de hasta 120 caracteres (eran 2 hasta la 0008). |
| D8 | Desactivar es una **pausa**: desapareces de grillas y chats y todo vuelve al reactivar. |
| D9 | La foto **no es obligatoria**; sin ella se ven las iniciales. |
| D10 | Los **admins no leen chats**. |
| D11 | Hasta **5 etiquetas**, sin categorias sensibles (orientacion, salud, religion). Las actuales son provisionales. |
| D12 | Grilla con **sin votar primero** y orden aleatorio estable; nunca por cercania. |
| D13 | ~~Catalogo propio de GIFs~~. **Retirada en la 0008**: no hay GIFs ni zumbidos, solo la pregunta de la cerveza. |
| D16 | **Activar es un si explicito** (0010): se guarda la version de las condiciones aceptadas, y cualquiera puede descargar o borrar sus datos de la cana. |
| D15 | **Bloquear y denunciar** (0009): bloquear es entre personas, no por ruta; denunciar avisa a quien organiza, bloquea a la vez y se lleva copiados los mensajes de esa persona. |
| D14 | **Sin "No me gusta"** (17-09-2026): la unica accion es Me gusta. Abrir la ficha o quitar un Me gusta deja a la persona en **Visto**, que la otra persona no ve. Los No me gusta que hubiera pasan a Visto (0006). |

## Probarlo en local

Con Supabase local (`npx supabase start`, necesita Docker) y la 0005 y la 0006 aplicadas,
hacen falta al menos dos cuentas con la feature activada en la misma ruta
publicada. Para no esperar 30 minutos a probar un aplazamiento, desde el SQL
Editor o `psql`:

```sql
update public.match_connections
   set question_answered_at = now() - interval '31 minutes'
 where id = '<id de la conexion>';
```

## Donde esta cada regla

Todas las reglas viven en `supabase/migrations/0005_tirate_una_cana.sql`, con
los cambios de `0006_cana_visto.sql` (Visto en lugar de No me gusta:
`match_set_like` y `match_mark_seen` sustituyen a `match_vote`). La app no lee
ni escribe ninguna tabla `match_*` salvo el catalogo de etiquetas; todo pasa
por funciones `SECURITY DEFINER`, como `claim_stamp`. La `0008_cana_solo_la_pregunta.sql`
retira GIFs y zumbidos y baja a un texto por persona.
`tests/migration-0005.test.ts` y `tests/migration-0005.test.ts` las ejecutan
sobre Postgres real (PGlite).

La copia en TypeScript (`src/features/match/reglas.ts`) es un espejo para la
interfaz ("podras volver a preguntar en 12 min"). Si discrepan, manda el SQL.

## Bloquear y denunciar

Quitar el Me gusta ya cerraba la conexion y borraba el chat, pero la otra
persona te seguia viendo en la grilla y podia abrir tu ficha, y en la ruta
siguiente volviais a cruzaros. Los dos botones estan en la ficha y en el chat
(`src/features/match/AccionesPersona.tsx`), y la lista de bloqueados en
`app/cana/bloqueados.tsx`.

- **Bloquear** (`match_block`) hace tres cosas a la vez: os esconde a los dos
  en grilla y bandeja, cierra la conexion (con lo que el chat se borra) y baja
  tu Me gusta a **Visto**, para que no se reabra sola si la otra persona sigue
  dandotelo. Es **entre personas y no por ruta**: sigue en pie en el siguiente
  evento, al reves que los votos (D1).
- **Desbloquear** (`match_unblock`) no devuelve ni la conexion ni el Me gusta:
  hay que darlo otra vez desde su ficha. La pantalla lo avisa antes.
- **Denunciar** (`match_report`) manda motivo y un detalle opcional, bloquea en
  la misma llamada y, si viene de un chat, **copia los mensajes** que esa
  persona escribio. La copia es lo importante: bloquear borra el chat, asi que
  sin ella la prueba desaparece justo cuando hace falta. Una denuncia viva por
  pareja (`REPORT_ALREADY_PENDING`).

Los motivos (`foto`, `acoso`, `suplantacion`, `menor`, `otro`) estan en el SQL
y repetidos en `reglas.ts`; `tests/match-espejo.test.ts` compara las dos listas.

## Consentimiento, y llevarte o borrar tus datos

A quien das Me gusta y lo que escribis permiten deducir la vida afectiva de
una persona, asi que activar la cana no puede ser pulsar un boton: es un si
explicito e informado, y queda guardado con la version de lo que se acepto
(`match_profiles.consent_version` / `consent_at`, 0010). La version esta en
`CONSENTIMIENTO_VERSION` (`reglas.ts`) y a la vista en `app/cana/condiciones.tsx`;
se sube solo cuando cambia lo que se acepta, no con cada retoque de redaccion.
Volver de una pausa no vuelve a pedirlo: el si ya esta dado.

Desde "Mis datos" (`app/cana/mis-datos.tsx`):

- **Ver y copiar** lo que la cana guarda (`match_export_my_data`): perfil,
  Me gusta y Vistos, conexiones y **los mensajes que escribiste tu**. Los de la
  otra persona son suyos y no se entregan aqui.
- **Borrar** (`match_delete_my_data`), que no es desactivar: no deja perfil, ni
  etiquetas, ni votos (en los dos sentidos), ni conexiones, ni mensajes. **No**
  se lleva los bloqueos que otras personas te pusieron (es su decision de no
  volver a verte) ni las denuncias sobre ti (pueden estar sin resolver y quien
  organiza tiene que poder responder de ellas).

Conservacion: `match_admin_purge_route(p_route_id, p_days default 30)` borra
votos, conexiones y denuncias de una ruta cuyo evento fue hace mas de N dias.
Solo admins, y falla si la ruta no tiene fecha (`ROUTE_WITHOUT_DATE`) o es
reciente (`ROUTE_TOO_RECENT`). **No hay tarea programada**: la llama el panel o
un cron; es lo que falta para que el plazo se cumpla solo.

## Contrato con el panel de administracion

Las denuncias ya se revisan desde la app: **Mi perfil > Detras de la barra >
Alertas de administracion** (`app/admin/`). Los avisos automaticos a quien
organiza (correo, notificacion push) siguen siendo de otra persona, y para eso
estan `match_admin_reports_sin_avisar()` y `match_admin_mark_notified()`, que la
bandeja no usa.

Todas las funciones exigen `is_admin()` y ninguna da acceso a los chats: se lee
lo que la denuncia copio, nunca la conversacion (D10).

```sql
-- Bandeja. p_solo_pendientes = false para ver tambien el historico.
public.match_admin_reports(p_solo_pendientes boolean default true)
  -> id, created_at, status, reason, detail, route_id,
     reporter_id, reporter_name, reported_id, reported_name,
     mensajes (cuantos acompanan la denuncia), notified_at,
     handled_by, handled_at, resolution

-- Los mensajes copiados de UNA denuncia.
public.match_admin_report_messages(p_report_id uuid)
  -> message_id, sender_id, kind, body, answer, created_at

-- Para el sistema de avisos: lo que aun no se ha comunicado, y como marcarlo.
public.match_admin_reports_sin_avisar() -> id, created_at, reason, reported_id, reported_name
public.match_admin_mark_notified(p_report_id uuid)

-- Lo que puede hacer quien revisa. Las tres dejan rastro en match_moderation_log.
public.match_admin_remove_photo(p_user_id uuid, p_report_id uuid default null, p_note text default '')
public.match_admin_deactivate(p_user_id uuid, p_report_id uuid default null, p_note text default '')
public.match_admin_resolve(p_report_id uuid, p_resolution text, p_note text default '')
  -- p_resolution: 'sin_accion' | 'foto_retirada' | 'cana_desactivada' | 'otra'

-- 0013, lo que pidio la bandeja al construirla.
-- Reclamar: pendiente -> en_revision. Devuelve false si ya la tenia otra
-- persona o si estaba cerrada, y entonces NO es un error.
public.match_admin_take(p_report_id uuid) -> boolean

-- Un ticket entero, con lo que hace falta para decidir y no trae la bandeja.
public.match_admin_report(p_report_id uuid)
  -> todo lo de match_admin_reports, mas route_name, reported_avatar_url (la
     foto GRANDE: sobre 400 px no se decide retirar una foto), reported_bio,
     reported_active, handled_by_name y handler_note

-- Solo el numero, para la burbujita del boton de Mi perfil.
public.match_admin_alert_count() -> integer  -- las que no estan resueltas
```

Tres cosas que el panel tiene que saber:

1. `match_admin_remove_photo` deja `avatar_url` y `avatar_thumb_url` a NULL,
   pero **no borra el fichero del Storage**: el bucket `avatars` es publico y
   la URL sigue viva. Borrarlo pide la clave de servicio, que no puede estar en
   la app. Hasta que el bucket sea privado, ese paso es manual.
2. Estados de una denuncia: `pendiente` -> `en_revision` -> `resuelta`. La
   bandeja reclama con `match_admin_take` al ABRIR el ticket, no con un boton:
   con varios admins mirando la misma lista desde el movil, dos pueden ponerse
   con la misma denuncia sin enterarse, y asi consta quien se puso primero.
3. Reclamar tambien deja apunte en `match_moderation_log`
   (`denuncia_en_revision`): es la prueba de cuanto se tardo en atenderla, que
   es lo que mide el DSA.

## Contrato con la pertenencia a rutas

La feature solo pregunta una cosa a la parte de invitaciones y acceso a rutas,
que construye otra persona:

```sql
public.is_route_participant(p_route_id uuid, p_user_id uuid) returns boolean
```

La 0005 trae una version **provisional** (participa todo el mundo en las rutas
publicadas) y solo la crea si no existe, para no pisar la buena si su migracion
se aplica antes. La migracion de pertenencia la sustituye con
`create or replace`, sin cambiar la firma. Hay que acordar la numeracion de las
migraciones para no usar las dos el mismo numero.

## Fotos

La grilla pinta la foto de todas las personas de la ruta a la vez, asi que la
app sube dos versiones (`src/features/profile/imagenes.ts`): 1080 px para la
ficha y 400 px para la casilla, que es la que devuelven `match_grid`,
`match_inbox` y `match_get_connection` (0007). Con fotos reales de movil eso
baja una grilla de 200 personas de ~574 MB a ~4 MB.

## Avisos dentro de la app

Dos burbujitas con el mismo numero (`chatsPendientes` en `reglas.ts`): cuenta
**conversaciones**, no mensajes, y suma las que esperan tu respuesta a la
cerveza, las que tienen algo sin leer y **las conexiones que aun no has
abierto** (`never_opened`, 0011: la pista es `last_read_at = '-infinity'`).

- En el selector **Chats** de la pestana, mientras estas en la cana.
- En el **icono de la pestana Cana**, para que se vea desde Sellos o Ruta.
  Lo alimenta `AvisosCanaProvider` (`src/features/match/AvisosCana.tsx`), que
  vive por encima del Stack. **Quien no tiene la cana activada no pregunta
  nada**: al arrancar se mira el perfil una vez y ahi acaba. Con la cana
  activada pregunta **cada 60 s**, no cada 15 como la pantalla abierta: son 200
  personas preguntando aunque no esten dentro. Se calla en segundo plano y mira
  nada mas volver al primer plano. Cuando la pantalla de la cana pide la
  bandeja le pasa la cuenta y el estado, asi que la burbujita se apaga al leer
  (y arranca al activar) sin esperar al siguiente minuto ni pedir la bandeja
  dos veces. Medido en Chrome, 75 s en la pestana Sellos: con la cana apagada,
  1 consulta del perfil y 0 de la bandeja; encendida, 1 y 2.

No hay notificaciones fuera de la app: con el movil en el bolsillo no se
entera nadie de nada. Ver "Sin tiempo real".

## Sin tiempo real

El chat pregunta cada 4 s (polling) mientras esta abierto y visible; la
pestana, al entrar y cada 45 s (15 s en Chats). No usa Supabase Realtime. Si se
queda corto, las tablas y funciones no cambian. Las notificaciones estan
aparcadas.

Cada consulta pide los mensajes posteriores al ultimo que trajo la anterior,
menos 10 s de solape. Lo que el movil envia se pinta al momento pero no cuenta
para ese "desde": sin cobertura un rato, enviar lo primero al volver hacia que
no llegara nunca lo que la otra persona habia mandado en el hueco.

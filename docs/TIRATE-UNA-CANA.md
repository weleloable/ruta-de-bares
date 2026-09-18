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
4. **Solo Me gusta, sin "No me gusta"** (0005). Abrir la ficha de alguien lo
   deja como **Visto**; darle Me gusta lo marca, y volver a tocar lo quita (y
   vuelve a Visto). Me gusta mutuo = conexion. Quitar el Me gusta de una
   conexion pide confirmar: la cierra y borra el chat.
   Filtros: Todos, Me gusta, Visto, Conexiones, Nuevos.
5. **Conexion: solo la pregunta** (0007). Lo unico que se puede hacer es
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
| D2 | Tras un **No**, el Me gusta de quien rechaza pasa a **Visto** y el de quien pregunto se queda como estaba. El chat se borra. (Hasta la 0004 pasaba a No me gusta.) |
| D3 | El estado de la pregunta pertenece a la **pareja**: cerrar y reabrir la conexion no deja volver a preguntar. |
| D4 | Pregunta cualquiera de los dos, con **una sola pregunta viva** a la vez. |
| D5 | "Dentro de un rato": se puede volver a preguntar a los **30 min**, con **2 aplazamientos** como maximo. |
| D6 | El filtro Me gusta **incluye las conexiones**. |
| D7 | Tras el Si, **1 texto por persona** de hasta 120 caracteres (eran 2 hasta la 0007). |
| D8 | Desactivar es una **pausa**: desapareces de grillas y chats y todo vuelve al reactivar. |
| D9 | La foto **no es obligatoria**; sin ella se ven las iniciales. |
| D10 | Los **admins no leen chats**. |
| D11 | Hasta **5 etiquetas**, sin categorias sensibles (orientacion, salud, religion). Las actuales son provisionales. |
| D12 | Grilla con **sin votar primero** y orden aleatorio estable; nunca por cercania. |
| D13 | ~~Catalogo propio de GIFs~~. **Retirada en la 0007**: no hay GIFs ni zumbidos, solo la pregunta de la cerveza. |
| D14 | **Sin "No me gusta"** (17-09-2026): la unica accion es Me gusta. Abrir la ficha o quitar un Me gusta deja a la persona en **Visto**, que la otra persona no ve. Los No me gusta que hubiera pasan a Visto (0005). |

## Probarlo en local

Con Supabase local (`npx supabase start`, necesita Docker) y la 0004 y la 0005 aplicadas,
hacen falta al menos dos cuentas con la feature activada en la misma ruta
publicada. Para no esperar 30 minutos a probar un aplazamiento, desde el SQL
Editor o `psql`:

```sql
update public.match_connections
   set question_answered_at = now() - interval '31 minutes'
 where id = '<id de la conexion>';
```

## Donde esta cada regla

Todas las reglas viven en `supabase/migrations/0004_tirate_una_cana.sql`, con
los cambios de `0005_cana_visto.sql` (Visto en lugar de No me gusta:
`match_set_like` y `match_mark_seen` sustituyen a `match_vote`). La app no lee
ni escribe ninguna tabla `match_*` salvo el catalogo de etiquetas; todo pasa
por funciones `SECURITY DEFINER`, como `claim_stamp`. La `0007_cana_solo_la_pregunta.sql`
retira GIFs y zumbidos y baja a un texto por persona.
`tests/migration-0004.test.ts` y `tests/migration-0004.test.ts` las ejecutan
sobre Postgres real (PGlite).

La copia en TypeScript (`src/features/match/reglas.ts`) es un espejo para la
interfaz ("podras volver a preguntar en 12 min"). Si discrepan, manda el SQL.

## Contrato con la pertenencia a rutas

La feature solo pregunta una cosa a la parte de invitaciones y acceso a rutas,
que construye otra persona:

```sql
public.is_route_participant(p_route_id uuid, p_user_id uuid) returns boolean
```

La 0004 trae una version **provisional** (participa todo el mundo en las rutas
publicadas) y solo la crea si no existe, para no pisar la buena si su migracion
se aplica antes. La migracion de pertenencia la sustituye con
`create or replace`, sin cambiar la firma. Hay que acordar la numeracion de las
migraciones para no usar las dos el mismo numero.

## Fotos

La grilla pinta la foto de todas las personas de la ruta a la vez, asi que la
app sube dos versiones (`src/features/profile/imagenes.ts`): 1080 px para la
ficha y 400 px para la casilla, que es la que devuelven `match_grid`,
`match_inbox` y `match_get_connection` (0006). Con fotos reales de movil eso
baja una grilla de 200 personas de ~574 MB a ~4 MB.

## Sin tiempo real

El chat pregunta cada 4 s (polling) mientras esta abierto y visible; la
pestana, al entrar y cada 45 s (15 s en Chats). No usa Supabase Realtime. Si se
queda corto, las tablas y funciones no cambian. Las notificaciones estan
aparcadas.

Cada consulta pide los mensajes posteriores al ultimo que trajo la anterior,
menos 10 s de solape. Lo que el movil envia se pinta al momento pero no cuenta
para ese "desde": sin cobertura un rato, enviar lo primero al volver hacia que
no llegara nunca lo que la otra persona habia mandado en el hueco.

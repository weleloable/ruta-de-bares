# Tirate una cana

Un "tinder cervecero" entre las personas que participan en la misma ruta. Vive
en la pestana **Cana** (el nombre completo va en la cabecera: no cabe en la
barra con cinco pestanas).

Documento de diseno completo (pantallas, riesgos, roadmap):
<https://claude.ai/artifact/Hhb8GGq7BTTrrMRtjgrpPf>. Este fichero recoge lo que
ya esta decidido y lo que hace falta para trabajar en el codigo.

## Como funciona

1. **Desactivado por defecto.** La pestana explica que, si lo activas, quienes
   tambien lo tengan activado en tu ruta podran ver tu nombre y tu foto,
   enviarte GIFs y zumbidos y ofrecerte una cerveza.
2. **Primera activacion:** confirmar mayoria de edad y presentarse con una frase
   de hasta 120 caracteres y hasta 5 etiquetas. Se puede editar despues.
3. **Grilla** con foto y nombre de quien lo tiene activado en la ruta. Al tocar
   una tarjeta: foto grande, frase, etiquetas y los botones de voto.
4. **Votos cambiables:** Me gusta, No me gusta y conexion (me gusta mutuo).
   Filtros: Todos, Me gusta, No me gusta, Conexiones, Nuevos.

## Como se ve cada estado: "la cana se llena"

Por peticion de diseno, solo colores de la paleta cervecera de `src/lib/theme.ts`
(nada de verde, rojo ni turquesa) y cada estado con su propia forma, para que se
lea tambien en gris o con daltonismo. Propuesta y alternativas descartadas:
<https://claude.ai/artifact/P9nn8iZsR4G8Sf73cNXHnE>.

| Estado | Tarjeta | Vaso (`VasoCana`) |
| --- | --- | --- |
| Sin votar | borde crema fino | ninguno |
| Me gusta | borde cerveza | media cana |
| Conexion | borde tostado con doble aro y nombre sobre tostado | cana llena con espuma |
| No me gusta | borde discontinuo y foto apagada | vaso vacio |

El mismo vaso aparece en los filtros, en la leyenda sobre la grilla y en la ficha.
Los vasos se dibujan con Views, sin SVG: `react-native-svg` obligaria a
recompilar el development build. `tests/match-paleta.test.ts` impide volver a
meter verde, turquesa o colores escritos a mano en la feature.
5. **Chat** solo con conexion: GIFs del catalogo y zumbidos. La pregunta
   "Te tomas una cerveza conmigo?" se responde Si, No o "Preguntamelo dentro de
   un rato". Tras el Si cada persona puede mandar 2 textos de hasta 120
   caracteres.

## Decisiones

Aceptadas el 17-09-2026. Algunas se revisaran; si cambia una, cambia tambien
la migracion (una nueva, nunca editando la publicada) y su test.

| ID | Decision |
| --- | --- |
| D1 | Votos y conexiones son **por ruta**: cada ruta es un evento y empieza de cero. |
| D2 | Tras un **No**, el voto de quien rechaza pasa a No me gusta y el de quien pregunto se queda como estaba. El chat se borra. |
| D3 | El estado de la pregunta pertenece a la **pareja**: cerrar y reabrir la conexion no deja volver a preguntar. |
| D4 | Pregunta cualquiera de los dos, con **una sola pregunta viva** a la vez. |
| D5 | "Dentro de un rato": se puede volver a preguntar a los **30 min**, con **2 aplazamientos** como maximo. |
| D6 | El filtro Me gusta **incluye las conexiones**. |
| D7 | Tras el Si, **2 textos por persona** de hasta 120 caracteres. |
| D8 | Desactivar es una **pausa**: desapareces de grillas y chats y todo vuelve al reactivar. |
| D9 | La foto **no es obligatoria**; sin ella se ven las iniciales. |
| D10 | Los **admins no leen chats**. |
| D11 | Hasta **5 etiquetas**, sin categorias sensibles (orientacion, salud, religion). Las actuales son provisionales. |
| D12 | Grilla con **sin votar primero** y orden aleatorio estable; nunca por cercania. |
| D13 | **Catalogo propio de GIFs** dentro de la app, sin buscador externo. |

## Probarlo en local

Con Supabase local (`npx supabase start`, necesita Docker) y la 0003 aplicada,
hacen falta al menos dos cuentas con la feature activada en la misma ruta
publicada. Para no esperar 30 minutos a probar un aplazamiento, desde el SQL
Editor o `psql`:

```sql
update public.match_connections
   set question_answered_at = now() - interval '31 minutes'
 where id = '<id de la conexion>';
```

Lo mismo con `match_connection_members.last_buzz_at` para el zumbido.

## Donde esta cada regla

Todas las reglas viven en `supabase/migrations/0003_tirate_una_cana.sql`. La
app no lee ni escribe ninguna tabla `match_*` salvo los catalogos de etiquetas
y GIFs; todo pasa por funciones `SECURITY DEFINER`, como `claim_stamp`.
`tests/migration-0003.test.ts` las ejecuta sobre Postgres real (PGlite).

La copia en TypeScript (`src/features/match/reglas.ts`) es un espejo para la
interfaz ("podras volver a preguntar en 12 min"). Si discrepan, manda el SQL.

## Contrato con la pertenencia a rutas

La feature solo pregunta una cosa a la parte de invitaciones y acceso a rutas,
que construye otra persona:

```sql
public.is_route_participant(p_route_id uuid, p_user_id uuid) returns boolean
```

La 0003 trae una version **provisional** (participa todo el mundo en las rutas
publicadas) y solo la crea si no existe, para no pisar la buena si su migracion
se aplica antes. La migracion de pertenencia la sustituye con
`create or replace`, sin cambiar la firma. Hay que acordar la numeracion de las
migraciones para no usar las dos el mismo numero.

## GIFs

Catalogo propio dentro de la app (D13): `assets/gifs/<id>.gif`, listados en
`src/features/match/gifs.ts` y en la tabla `match_gifs` de la migracion. El
chat guarda solo el id. `tests/match-gifs.test.ts` comprueba que los dos
catalogos coinciden y que cada fichero existe y pesa menos de 200 KB.

Los 8 actuales son **provisionales**: dibujados para el prototipo con la paleta
de la app, sin derechos de terceros. Para cambiarlos, mismo id o una migracion
nueva que actualice `match_gifs`.

## Sin tiempo real

El chat pregunta cada 4 s (polling) mientras esta abierto y visible; la
pestana, al entrar y cada 45 s (15 s en Chats). Un zumbido que llega con el chat
abierto hace temblar la pantalla y vibrar el movil donde se puede (Android si,
Safari en iPhone no). No usa Supabase Realtime. Si se
queda corto, las tablas y funciones no cambian. Las notificaciones estan
aparcadas.

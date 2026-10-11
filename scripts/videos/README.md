# Videos: tráiler y demos de la app

Graba el tráiler y las demos de uso **con la app de verdad**: la web exportada
contra un Supabase local con datos de demo, manejada por Chrome, con
subtítulos por paso y un dedo que marca cada toque. Sale en vertical
1080x1920 (H.264, 30 fps), que se ve bien en WhatsApp, Instagram y TikTok.

| Fichero | Qué enseña |
| --- | --- |
| `00-trailer.mp4` | Tráiler: sellar, mapa, La Caña, un adelanto de los minijuegos y el diploma, a ritmo de anuncio |
| `01-crear-cuenta-y-unirse.mp4` | Las dos formas de crear la cuenta (correo o Google), unirse a una ruta con el enlace de invitación e instalar la app |
| `02-iniciar-sesion.mp4` | Entrar con correo y contraseña (y dónde está Google) |
| `03-mi-perfil.mp4` | Cambiar la foto (revisión y aprobación) y el nombre, avisos, privacidad y descargar tus datos, escribir a la organización, cerrar sesión y borrar cuenta |
| `04-ruta-y-sellos.mp4` | Mapa, tus sellos, sellar un bar (lejos / en la puerta), bares que aún no abren, medalla y diploma |
| `05-la-cana.mp4` | Activarla (el día de la ruta y cerca del primer bar), presentarse, Me gusta, conexión, la pregunta de la cerveza, el mensaje único, bloquear y desactivar |

Los minijuegos no tienen demo a propósito: salen en el tráiler y cada cual los descubre jugando.

Los videos van a `videos/` (en `.gitignore`: son binarios y no se commitean).

## Grabar

Hace falta Docker Desktop arrancado, Chrome y Node.

```bash
npm install --prefix scripts/videos
node scripts/videos/grabar.mjs
```

La primera vez crea el proyecto de Supabase local en
`~/.ruta-de-bares-videos/sb` (fuera del repo), lo arranca y aplica todas las
migraciones de `supabase/migrations/`. Cada video parte de una base
**reseteada y sembrada** de cero, así que se pueden regrabar sueltos:

```bash
node scripts/videos/grabar.mjs sellos cana      # solo esos (ids: trailer registro login perfil sellos cana)
node scripts/videos/grabar.mjs --sin-export     # reutiliza la web ya exportada (si no tocaste la app)
node scripts/videos/grabar.mjs --borrador cana  # sin video: una captura por paso en ~/.ruta-de-bares-videos/borrador/
```

Unos 15 minutos para los seis. Las horas que salen en pantalla son las de
grabar: las ventanas de los bares se calculan desde ese momento.

## Cómo está hecho

- `reparto.mjs`: el escenario. Diez personas de mentira con avatares
  ilustrados (`avatares.mjs`; no hay fotos de gente real), ocho bares del
  catálogo real y en qué punto de la noche está cada cual.
- `semilla.mjs`: siembra pasando por **las mismas funciones que la app**
  (`match_activate`, `avatar_request_submit` + `avatar_admin_decide`,
  `minigame_submit_score`...). Si una migración cambia una regla, la semilla
  falla en vez de grabar una demo que miente. Solo usa la clave de servicio para
  lo que nadie puede hacer desde la app (crear el admin, sellos de hace horas).
  Se niega a correr contra algo que no sea `127.0.0.1` / `localhost`.
- `titiritero` (en `semilla.mjs`): "el resto de la ruta" actuando EN MITAD de
  un video. Sergio da Me gusta mientras Marta se presenta, responde que sí a la
  cerveza y contesta el mensaje: lo que se ve en La Caña es el sondeo real del chat.
- `escenario/index.html`: el marco (móvil, subtítulo, dedo, tarjetas). La app
  va dentro en un iframe a 390 px de ancho, como un móvil normal.
- `grabador.mjs`: captura con el screencast de DevTools (JPEG 92) y monta con
  ffmpeg. El `Director` es lo que usan los guiones: `paso`, `tocar`,
  `escribir`, `foco`, `apretar`, `inclinar` (acelerómetro emulado, el mismo
  truco que `npm run verificar:juego`).
- `guiones/*.mjs`: un fichero por video.

Dos herramientas para escribir guiones nuevos, contra `node scripts/videos/servidor.mjs` (puerto 8090):

```bash
node scripts/videos/explorar.mjs goto:/cana click:Sergio text shot   # maneja la app y deja captura + texto
node scripts/videos/titere.mjs like Sergio Marta                    # mueve a otra persona de la ruta
```

## Cuándo regrabar

Cada vez que cambie algo que sale en pantalla. Si un texto o un botón cambia
de nombre, el guion falla con `No veo en la app: <texto>` y deja
`error.png` en la carpeta del borrador con dónde se quedó.

## Tests

```bash
npm test --prefix scripts/videos
```

Lo puro (tiempos de fotograma, lista de ffmpeg, servidor) y que el escenario
cuadre con el esquema: etiquetas de la 0030, bares del catálogo, límites de
frase y nombre. Que cada paso se vea bien lo dice el `--borrador`.

## Lo que no hay

- **Sonido.** Los videos son mudos a propósito (en WhatsApp e Instagram se ven
  sin sonido y los subtítulos lo cuentan todo). Al tráiler le vendría bien una
  música; hay que elegirla con licencia y montarla aparte.

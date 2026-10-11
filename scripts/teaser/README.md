# Teaser para redes

15 segundos en vertical (1080x1920, 30 fps) para ir abriendo boca antes de la
ruta: tras 10 ediciones en papel, la ruta pasa al móvil. Lo pidió el equipo
**corto, sin entrar en detalles** (la app aún cambia mucho) y acabando en
**"Próximamente disponible"**. No es un tutorial: esos son los videos de
`scripts/videos/`.

| Tiempo | Qué se ve |
| --- | --- |
| 0-1,5 s | **10 EDICIONES** |
| 1,5-3 s | **DE SELLOS EN PAPEL**: una credencial y tres sellos de bares reales que caen al ritmo |
| 3-4 s | **ESTE AÑO LA RUTA CAMBIA** |
| 4-9 s | Destellos de un segundo de la app, una palabra cada uno: **SELLA. EXPLORA. CONOCE. BRINDA. JUEGA.** |
| 9-10 s | **Y MUCHO MÁS...** |
| 10-15 s | Logo, **PRÓXIMAMENTE DISPONIBLE**, "La ruta de siempre, ahora en tu móvil." y @rutadebaresoficial; a los 12 s cae sobre el logo un sello rojo con el día de la ruta (**SÁBADO 17 OCTUBRE**) |

La música está sintetizada en `musica.mjs` (120 BPM, cortes en el pulso): no
hay pistas de terceros, así que Instagram o TikTok no silencian el video.
Si se prefiere poner un audio de moda desde la propia red, está la versión
sin música.

## Renderizar

Hace falta Node, Chrome y conexión (las fuentes salen de Google Fonts).

```bash
npm install --prefix scripts/teaser
node scripts/teaser/render.mjs
```

Tarda unos dos minutos. Sale en `scripts/teaser/salida/` (no se commitea):

- `teaser.mp4`: el bueno, con música.
- `teaser-sin-musica.mp4`: para ponerle un audio desde Instagram o TikTok.
- `portada.jpg`: el cartel final, para la miniatura del post.

Los planos de la app salen del tráiler que graba `scripts/videos/`
(`videos/00-trailer.mp4`). Si no está ahí, se pasa con `--fuente <mp4>`.

```bash
node scripts/teaser/render.mjs --fotos 4.75,7.5,12   # solo capturas de esos instantes, para mirar
node scripts/teaser/render.mjs --hoja                # hoja de contactos de la fuente, con la hora de cada fotograma
npm test --prefix scripts/teaser                     # tests (guion, música, escena), sin Chrome
```

## Cómo está hecho

- `guion.mjs`: escenas, textos, y qué segundos del tráiler van dentro del móvil
  (`PLANOS`). Datos puros; lo leen todos los demás.
- `escena.html`: la animación. `window.pintar(t)` deja la pantalla como tiene
  que estar en el instante `t`; no hay nada que dependa del reloj, así que un
  fotograma sale igual siempre (lo vigila un test).
- `musica.mjs`: la pista, con ruido de semilla fija: el WAV sale idéntico en
  cada render.
- `render.mjs`: recorta la pantalla del móvil del tráiler (`RECORTE`), sirve
  la escena por HTTP local, captura los 450 fotogramas con Chrome headless y
  monta con ffmpeg.

## Cuándo tocarlo

- **Si se regraba el tráiler**, los segundos de `PLANOS` dejan de apuntar a lo
  mismo (el render avisa si la duración no cuadra). Saca `--hoja`, busca los
  momentos y ajústalos. Los dos que tienen que caer justos: el sello que aparece
  en la app (con el SELLADO de `sellar`, a 4,75 s) y el "Os habéis dado Me gusta"
  (con la chispa de `match`, a 7,5 s).
- **Si cambia la fecha de la ruta**, se toca `fecha` de la escena `cierre`
  (`iso` y `lineas`). El test calcula el día de la semana desde `iso` y falla
  si `lineas` no cuadra: un "SÁBADO" con un 17 que cae en viernes no llega a
  publicarse.
- **Cuando la app esté publicada**, se cambia `titular` (p. ej.
  `['YA', 'DISPONIBLE']`). El test que pide "Próximamente disponible" se cambia
  con él: está para que no se pierda sin querer.

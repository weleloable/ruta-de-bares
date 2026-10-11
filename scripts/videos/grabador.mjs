/**
 * El grabador: abre el escenario en Chrome, captura cada fotograma con el
 * screencast de DevTools (calidad JPEG alta, 1080x1920) y lo monta en un MP4
 * H.264 a 30 fps con ffmpeg. Y el "director": las acciones con las que un
 * guion maneja la app dentro del movil (tocar, escribir, subtitulos, foco).
 *
 * Por que screencast y no el video de Playwright: el de Playwright va a VP8
 * con un bitrate fijo y el texto pequeno de la app sale borroso. El
 * screencast entrega fotogramas sueltos SOLO cuando algo cambia, con su hora;
 * `tiemposFotogramas` convierte eso en duraciones para el concat de ffmpeg.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import ffmpeg from 'ffmpeg-static';

export const ANCHO = 540;
export const ALTO = 960;
export const ESCALA = 2;

/**
 * Duracion de cada fotograma = hasta que llega el siguiente; el ultimo dura
 * hasta `fin`. Puro, con test: un fallo aqui desincroniza todo el video.
 * @param {number[]} horas  segundos (marca del screencast), crecientes
 * @param {number} fin      segundos en que se paro de grabar
 */
export function tiemposFotogramas(horas, fin) {
  return horas.map((h, i) => Math.max(0, (i + 1 < horas.length ? horas[i + 1] : Math.max(fin, h)) - h));
}

/**
 * Ancho y alto de un JPEG leyendo su cabecera SOF (sin decodificarlo).
 * Devuelve {ancho: 0, alto: 0} si no encuentra el marcador.
 */
export function medidaJpeg(b) {
  let i = 2; // salta SOI (FFD8)
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return { ancho: 0, alto: 0 };
    const marca = b[i + 1];
    const largo = b.readUInt16BE(i + 2);
    // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    }
    i += 2 + largo;
  }
  return { ancho: 0, alto: 0 };
}

/** Lista para el demuxer concat de ffmpeg (la ultima entrada se repite: lo exige el formato). */
export function listaConcat(ficheros, duraciones) {
  const lineas = [];
  ficheros.forEach((f, i) => {
    lineas.push(`file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
    lineas.push(`duration ${duraciones[i].toFixed(4)}`);
  });
  if (ficheros.length) lineas.push(`file '${ficheros.at(-1).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
  return lineas.join('\n') + '\n';
}

export class Grabacion {
  constructor(pagina) {
    this.pagina = pagina;
    this.fotogramas = [];
  }

  async empezar() {
    this.cdp = await this.pagina.context().newCDPSession(this.pagina);
    this.cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      const datos = Buffer.from(data, 'base64');
      this.fotogramas.push({ datos, hora: metadata.timestamp, tamano: medidaJpeg(datos) });
      await this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: ANCHO * ESCALA, maxHeight: ALTO * ESCALA });
    this.inicio = Date.now() / 1000;
  }

  async parar() {
    const fin = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast');
    await this.cdp.detach();
    return fin;
  }

  /** Escribe el MP4. `fin` en la misma escala que metadata.timestamp (segundos epoch). */
  montar(fin, salida, temporal) {
    if (this.fotogramas.length === 0) throw new Error('El screencast no entrego ningun fotograma');
    // Un fotograma de otra medida se estiraria a 1080x1920 sin avisar (paso al
    // abrir una pestana mas en el contexto grabado): mejor fallar.
    const raros = this.fotogramas.filter((f) => f.tamano.ancho !== ANCHO * ESCALA || f.tamano.alto !== ALTO * ESCALA);
    if (raros.length) throw new Error(`${raros.length} fotogramas no miden ${ANCHO * ESCALA}x${ALTO * ESCALA} (p. ej. ${raros[0].tamano.ancho}x${raros[0].tamano.alto})`);
    rmSync(temporal, { recursive: true, force: true });
    mkdirSync(temporal, { recursive: true });
    const ficheros = this.fotogramas.map((f, i) => {
      const ruta = join(temporal, `f${String(i).padStart(6, '0')}.jpg`);
      writeFileSync(ruta, f.datos);
      return ruta;
    });
    const duraciones = tiemposFotogramas(this.fotogramas.map((f) => f.hora), fin);
    const lista = join(temporal, 'lista.txt');
    writeFileSync(lista, listaConcat(ficheros, duraciones));
    const r = spawnSync(
      ffmpeg,
      [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'concat', '-safe', '0', '-i', lista,
        '-vf', `scale=${ANCHO * ESCALA}:${ALTO * ESCALA}:flags=lanczos,fps=30,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high',
        '-movflags', '+faststart',
        salida,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`ffmpeg fallo: ${r.stderr}`);
    rmSync(temporal, { recursive: true, force: true });
    return duraciones.reduce((a, b) => a + b, 0);
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lo que un guion puede hacer. `app` es el frame del iframe con la app. */
export class Director {
  constructor(pagina, app) {
    this.pagina = pagina;
    this.app = app;
    this.n = 0;
  }

  esperar(ms) {
    return esperar(ms);
  }

  async seccion(texto, totalPasos) {
    await this.pagina.evaluate(([t, n]) => {
      window.escena.seccion(t);
      window.escena.pasos(n);
    }, [texto, totalPasos]);
  }

  /** Subtitulo del siguiente paso y una pausa para leerlo (~ 55 ms por letra, minimo 1,6 s). */
  async paso(html, { pausa } = {}) {
    this.n += 1;
    await this.pagina.evaluate(([n, h]) => window.escena.paso(n, h), [this.n, html]);
    const letras = html.replace(/<[^>]+>/g, '').length;
    await esperar(pausa ?? Math.max(1600, letras * 55));
  }

  /** Subtitulo sin numero (el trailer: frases, no pasos). */
  async titular(html, pausa = 2200) {
    await this.pagina.evaluate((h) => window.escena.paso(0, h), html);
    await esperar(pausa);
  }

  /** Recarga la app dentro del movil (tras cambiar datos por detras) y espera a `texto`. */
  async recargar(texto) {
    await this.app.evaluate(() => location.reload());
    await this.app.waitForLoadState('domcontentloaded');
    if (texto) await this.buscar(texto, 30000);
  }

  async tarjeta(t, ms) {
    await this.pagina.evaluate((x) => window.escena.tarjeta(x), t);
    if (ms) await esperar(ms);
  }

  async quitarTarjeta(ms = 600) {
    await this.pagina.evaluate(() => window.escena.tarjeta(null));
    await esperar(ms);
  }

  /**
   * El primer elemento que una persona VERIA: texto exacto o un locator ya
   * hecho. Las pestanas inactivas de Expo Router siguen montadas, con su
   * contenido bajo un `aria-hidden="true"` y caja de verdad (fuera del movil
   * o detras de la pestana activa), asi que `visible` de Playwright no basta:
   * el primer "La Oveja Negra" del DOM era la tarjeta del mapa escondido.
   */
  async buscar(objetivo, limite = 20000) {
    const loc =
      typeof objetivo === 'string' ? this.app.getByText(objetivo, { exact: true })
      : objetivo instanceof RegExp ? this.app.getByText(objetivo)
      : objetivo;
    const fin = Date.now() + limite;
    for (;;) {
      const n = await loc.count();
      for (let i = 0; i < n; i++) {
        const ok = await loc
          .nth(i)
          .evaluate((e) => {
            if (e.closest('[aria-hidden="true"]')) return false;
            const r = e.getBoundingClientRect();
            const s = getComputedStyle(e);
            return r.width > 0 && r.height > 0 && s.visibility === 'visible' && r.right > 0 && r.left < innerWidth;
          })
          .catch(() => false);
        if (ok) return loc.nth(i);
      }
      if (Date.now() > fin) throw new Error(`No veo en la app: ${objetivo}`);
      await esperar(200);
    }
  }

  /** ¿Se ve ahora mismo? (sin esperar) */
  async seVe(objetivo) {
    return this.buscar(objetivo, 0).then(() => true, () => false);
  }

  async caja(objetivo) {
    const loc = await this.buscar(objetivo);
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const c = await loc.boundingBox();
    if (!c) throw new Error(`Sin caja para ${objetivo}`);
    return c;
  }

  async moverDedo(x, y, ms = 650) {
    // Las cajas de Playwright vienen en px del escenario (540, sin el zoom 2); el raton va en px de la ventana (1080).
    await this.pagina.evaluate(([a, b]) => window.escena.dedo(a, b), [x, y]);
    await esperar(ms);
  }

  /** Lleva el dedo al elemento, lo pulsa (con su onda) y hace el clic de verdad. */
  async tocar(objetivo, { antes = 250, despues = 900, dx = 0.5, dy = 0.5 } = {}) {
    const c = await this.caja(objetivo);
    const x = c.x + c.width * dx;
    const y = c.y + c.height * dy;
    if (process.env.VIDEOS_DEBUG) console.log('  tocar', String(objetivo).slice(0, 80), Math.round(x), Math.round(y));
    await this.moverDedo(x, y);
    await esperar(antes);
    await this.pagina.evaluate(() => window.escena.pulsar(true));
    await this.pagina.mouse.move(x * ESCALA, y * ESCALA);
    await this.pagina.mouse.down();
    await esperar(110);
    await this.pagina.mouse.up();
    await this.pagina.evaluate(() => window.escena.pulsar(false));
    await esperar(Math.min(despues, 500));
    // El dedo se va tras cada toque: quieto encima tapaba justo lo que acaba de pasar.
    await this.sinDedo();
    await esperar(Math.max(0, despues - 500));
  }

  /**
   * Clic sin dedo ni pausas, para lo que pasa fuera de camara (entrar antes de
   * grabar, detras de una tarjeta). No usar `locator.click()`: con el zoom 2 del
   * escenario Playwright calcula mal el punto dentro del iframe y pulsa otra cosa.
   */
  async clic(objetivo) {
    const c = await this.caja(objetivo);
    await this.pagina.mouse.click((c.x + c.width / 2) * ESCALA, (c.y + c.height / 2) * ESCALA);
  }

  /** Mantener pulsado (los botones de BotonMantener escuchan pointerdown/up). */
  async mantener(objetivo, ms) {
    const c = await this.caja(objetivo);
    const x = c.x + c.width / 2;
    const y = c.y + c.height / 2;
    await this.moverDedo(x, y);
    await this.pagina.evaluate(() => window.escena.pulsar(true));
    await this.pagina.mouse.move(x * ESCALA, y * ESCALA);
    await this.pagina.mouse.down();
    await esperar(ms);
    await this.pagina.mouse.up();
    await this.pagina.evaluate(() => window.escena.pulsar(false));
  }

  /**
   * Inclina "el movil": el acelerometro emulado (como el panel Sensors de
   * DevTools, igual que verificar-juego-web.mjs) y el dibujo del movil en el
   * escenario, para que se vea el gesto. Los sensores se encienden la primera vez.
   */
  async inclinar(grados, { dibujo = true } = {}) {
    this.cdpSensores ??= await this.pagina.context().newCDPSession(this.pagina);
    const cdp = this.cdpSensores;
    if (!this.sensoresListos) {
      for (const type of ['accelerometer', 'linear-acceleration', 'gravity', 'gyroscope']) {
        await cdp.send('Emulation.setSensorOverrideEnabled', { enabled: true, type });
      }
      this.sensoresListos = true;
    }
    const rad = (grados * Math.PI) / 180;
    const xyz = { x: 9.81 * Math.sin(rad), y: 9.81 * Math.cos(rad), z: 0 };
    await cdp.send('Emulation.setSensorOverrideReadings', { type: 'accelerometer', reading: { xyz } });
    await cdp.send('Emulation.setSensorOverrideReadings', { type: 'gravity', reading: { xyz } });
    await cdp.send('Emulation.setSensorOverrideReadings', { type: 'linear-acceleration', reading: { xyz: { x: 0, y: 0, z: 0 } } });
    await cdp.send('Emulation.setSensorOverrideReadings', { type: 'gyroscope', reading: { xyz: { x: 0, y: 0, z: 0 } } });
    if (dibujo) await this.pagina.evaluate((g) => window.escena.inclinar(g), -grados);
  }

  /** Aprieta sin soltar (devuelve la funcion que suelta). Para el grifo y el servir. */
  async apretar(objetivo) {
    const c = await this.caja(objetivo);
    const x = c.x + c.width / 2;
    const y = c.y + c.height / 2;
    await this.moverDedo(x, y, 500);
    await this.pagina.evaluate(() => window.escena.pulsar(true));
    await this.pagina.mouse.move(x * ESCALA, y * ESCALA);
    await this.pagina.mouse.down();
    return async () => {
      await this.pagina.mouse.up();
      await this.pagina.evaluate(() => window.escena.pulsar(false));
    };
  }

  /** Toques seguidos en el mismo boton (calentar la olla): el dedo ya esta encima. */
  async toquesRapidos(objetivo) {
    const c = await this.caja(objetivo);
    const x = c.x + c.width / 2;
    const y = c.y + c.height / 2;
    await this.moverDedo(x, y, 500);
    return async () => {
      await this.pagina.evaluate(() => window.escena.pulsar(true));
      await this.pagina.mouse.move(x * ESCALA, y * ESCALA);
      await this.pagina.mouse.down();
      await esperar(60);
      await this.pagina.mouse.up();
      await this.pagina.evaluate(() => window.escena.pulsar(false));
    };
  }

  /** Texto visible de la app (para leer el termometro y la nota). */
  textoApp() {
    return this.app.evaluate(() => document.body.innerText);
  }

  async escribir(objetivo, texto, { retraso = 75 } = {}) {
    await this.tocar(objetivo, { despues: 300 });
    await this.pagina.keyboard.type(texto, { delay: retraso });
    await esperar(400);
  }

  async foco(objetivo, ms = 1800) {
    const c = await this.caja(objetivo);
    await this.pagina.evaluate((x) => window.escena.foco(x), c);
    await esperar(ms);
    await this.pagina.evaluate(() => window.escena.foco(null));
    await esperar(350);
  }

  async sinDedo() {
    await this.pagina.evaluate(() => window.escena.sinDedo());
  }

  /** Desliza el contenido (rueda del raton sobre la pantalla del movil). */
  async deslizar(dy, { x = 270, y = 560, pasos = 8 } = {}) {
    await this.sinDedo();
    await this.pagina.mouse.move(x * ESCALA, y * ESCALA);
    for (let i = 0; i < pasos; i++) {
      await this.pagina.mouse.wheel(0, dy / pasos);
      await esperar(45);
    }
    await esperar(600);
  }
}

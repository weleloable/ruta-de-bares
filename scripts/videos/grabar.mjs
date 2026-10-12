#!/usr/bin/env node
/**
 * Graba el trailer y las demos de la app. Ver scripts/videos/README.md.
 *
 *   node scripts/videos/grabar.mjs                 todos
 *   node scripts/videos/grabar.mjs sellos cana     solo esos
 *   node scripts/videos/grabar.mjs --sin-export    reutiliza la web ya exportada
 *   node scripts/videos/grabar.mjs --borrador sellos   sin video: una captura por paso
 *
 * Cada video parte de una base RECIEN reseteada y sembrada (semilla.mjs): asi
 * ninguno depende de lo que hizo el anterior y se pueden regrabar sueltos.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import { AQUI, RAIZ, SALIDA, TRABAJO, WEB, arrancarSupabase, buscarChrome, comprobarWebLocal, exportarWeb, resetearBase } from './entorno.mjs';
import { ALTO, ANCHO, Director, ESCALA, Grabacion } from './grabador.mjs';
import { GUIONES } from './guiones/index.mjs';
import { crearRasterizador } from './rasterizar.mjs';
import { sembrar, titiritero } from './semilla.mjs';
import { aliasEscenario, servir } from './servidor.mjs';

const args = process.argv.slice(2);
const borrador = args.includes('--borrador');
const elegidos = args.filter((a) => !a.startsWith('--'));
const guiones = elegidos.length ? GUIONES.filter((g) => elegidos.includes(g.id)) : GUIONES;
if (guiones.length === 0) throw new Error(`No hay guion con id ${elegidos.join(', ')}. Hay: ${GUIONES.map((g) => g.id).join(', ')}`);

const cfg = arrancarSupabase();
// Con o sin export: nunca se graba contra una web que hable con el Supabase de produccion.
if (args.includes('--sin-export')) comprobarWebLocal(cfg.url);
else exportarWeb(cfg);

// 8091 y no 8090: el 8090 es el de `servidor.mjs` para mirar la app a mano a la vez.
const PUERTO = Number(process.env.VIDEOS_PUERTO ?? 8091);
const BASE = `http://127.0.0.1:${PUERTO}`;
const servidor = await servir({ web: WEB, escenario: join(AQUI, 'escenario'), puerto: PUERTO, alias: aliasEscenario(RAIZ) });
const navegador = await chromium.launch({ executablePath: buscarChrome(), args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
mkdirSync(SALIDA, { recursive: true });
const informe = [];

try {
  for (const guion of guiones) {
    const t0 = Date.now();
    console.log(`\n== ${guion.id}: ${guion.titulo}`);
    resetearBase();
    // El rasterizador abre su pagina en OTRO contexto: una pestana extra en el
    // contexto que se graba deformaba los fotogramas del screencast.
    const rasterizar = crearRasterizador(navegador);
    const datos = await sembrar({ ...cfg, rasterizar });
    const mundo = await titiritero(cfg, datos.rutaId, datos.ids);

    const contexto = await navegador.newContext({
      // Ventana a resolucion final y escala 1; el escenario hace zoom 2 (ver escenario/index.html).
      viewport: { width: ANCHO * ESCALA, height: ALTO * ESCALA },
      deviceScaleFactor: 1,
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
      geolocation: guion.posicionInicial?.(datos) ?? { latitude: 40.4818, longitude: -3.3644 },
      permissions: ['geolocation', 'accelerometer', 'gyroscope'],
    });
    const pagina = await contexto.newPage();
    pagina.on('pageerror', (e) => console.warn(`  [app] ${e.message}`));
    await pagina.goto(`${BASE}/__escenario/index.html`);
    const marco = await pagina.$('#app');
    const app = await marco.contentFrame();
    const d = new Director(pagina, app);
    const ctx = { ...datos, mundo, base: BASE, contexto, cfg, rasterizar };

    await guion.preparar?.(d, ctx);
    if (borrador) {
      const carpeta = join(TRABAJO, 'borrador', guion.id);
      rmSync(carpeta, { recursive: true, force: true });
      mkdirSync(carpeta, { recursive: true });
      const pasoOriginal = d.paso.bind(d);
      d.paso = async (html, o) => {
        await pasoOriginal(html, { ...o, pausa: 900 });
        await pagina.screenshot({ path: join(carpeta, `${String(d.n).padStart(2, '0')}.png`), scale: 'css' });
      };
      try {
        await guion.grabar(d, ctx);
      } catch (e) {
        // Lo primero que se quiere ver al arreglar un guion: donde se quedo.
        await pagina.screenshot({ path: join(carpeta, 'error.png'), scale: 'css' });
        throw e;
      }
      await pagina.screenshot({ path: join(carpeta, 'fin.png'), scale: 'css' });
      console.log(`  borrador en ${carpeta}`);
    } else {
      const grabacion = new Grabacion(pagina);
      await grabacion.empezar();
      await guion.grabar(d, ctx);
      const fin = await grabacion.parar();
      const salida = join(SALIDA, `${guion.fichero}.mp4`);
      const segundos = grabacion.montar(fin, salida, join(TRABAJO, 'fotogramas', guion.id));
      informe.push({ id: guion.id, fichero: salida, segundos: Math.round(segundos), fotogramas: grabacion.fotogramas.length });
      console.log(`  ${salida} (${Math.round(segundos)} s, ${grabacion.fotogramas.length} fotogramas, ${Math.round((Date.now() - t0) / 1000)} s de trabajo)`);
    }
    await contexto.close();
  }
} finally {
  await navegador.close();
  servidor.close();
}
if (informe.length) writeFileSync(join(SALIDA, 'informe.json'), JSON.stringify(informe, null, 2));

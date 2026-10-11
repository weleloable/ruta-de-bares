#!/usr/bin/env node
/**
 * Resetea el Supabase local y siembra el escenario de los videos, sin grabar.
 * Sirve para mirar la app a mano con los mismos datos que salen en las demos:
 *
 *   node scripts/videos/sembrar.mjs            (reset + semilla)
 *   node scripts/videos/sembrar.mjs --sin-reset
 */
import { chromium } from 'playwright-core';

import { arrancarSupabase, buscarChrome, resetearBase } from './entorno.mjs';
import { crearRasterizador } from './rasterizar.mjs';
import { sembrar } from './semilla.mjs';

const cfg = arrancarSupabase();
if (!process.argv.includes('--sin-reset')) resetearBase();
const navegador = await chromium.launch({ executablePath: buscarChrome() });
try {
  const r = await sembrar({ ...cfg, rasterizar: crearRasterizador(navegador) });
  console.log(JSON.stringify({ rutaId: r.rutaId, token: r.token, bares: r.bares.map((b) => b.name) }, null, 2));
} finally {
  await navegador.close();
}

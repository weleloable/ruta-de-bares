#!/usr/bin/env node
/**
 * Herramienta para ESCRIBIR guiones: maneja la app (servida en :8090 por
 * servidor.mjs) con un perfil de Chrome persistente, de modo que la sesion
 * sigue entre llamadas, y deja una captura y el texto visible al final.
 *
 *   node scripts/videos/explorar.mjs goto:/cana click:"Me gusta" fill:"tu@correo.com=marta@demo.test" shot
 *
 * Pasos: goto:<camino>  click:<texto exacto>  clickre:<regex>  fill:<placeholder>=<valor>
 *        wait:<ms>  geo:<lat>,<lng>  scroll:<px>  shot  text
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import { TRABAJO, buscarChrome } from './entorno.mjs';

const perfil = join(TRABAJO, 'explorar-perfil');
const capturas = join(TRABAJO, 'explorar');
mkdirSync(capturas, { recursive: true });
const ctx = await chromium.launchPersistentContext(perfil, {
  executablePath: buscarChrome(),
  headless: true,
  viewport: { width: 390, height: 769 },
  deviceScaleFactor: 1,
  locale: 'es-ES',
  timezoneId: 'Europe/Madrid',
  permissions: ['geolocation'],
  geolocation: { latitude: 40.4818, longitude: -3.3644 },
});
const p = ctx.pages()[0] ?? (await ctx.newPage());
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
if (p.url() === 'about:blank') await p.goto('http://127.0.0.1:8090/');
let n = 0;
for (const paso of process.argv.slice(2)) {
  const [orden, ...resto] = paso.split(':');
  const arg = resto.join(':');
  if (orden === 'goto') await p.goto(`http://127.0.0.1:8090${arg}`);
  else if (orden === 'click') await p.getByText(arg, { exact: true }).first().click({ timeout: 10000 });
  else if (orden === 'clickre') await p.getByText(new RegExp(arg)).first().click({ timeout: 10000 });
  else if (orden === 'fill') {
    const [ph, valor] = arg.split('=');
    await p.getByPlaceholder(ph).fill(valor);
  } else if (orden === 'clicklast') await p.getByText(arg, { exact: true }).last().click({ timeout: 10000 });
  else if (orden === 'js') console.log(JSON.stringify(await p.evaluate(arg), null, 1));
  else if (orden === 'pass') {
    const campos = p.locator('input[type="password"]');
    for (let i = 0; i < (await campos.count()); i++) await campos.nth(i).fill(arg);
  } else if (orden === 'logout') await p.evaluate(() => localStorage.clear());
  else if (orden === 'wait') await p.waitForTimeout(Number(arg));
  else if (orden === 'geo') {
    const [lat, lng] = arg.split(',').map(Number);
    await ctx.setGeolocation({ latitude: lat, longitude: lng });
  } else if (orden === 'scroll') await p.mouse.wheel(0, Number(arg));
  else if (orden === 'shot') {
    await p.waitForTimeout(800);
    const f = join(capturas, `${++n}.png`);
    await p.screenshot({ path: f });
    console.log('captura', f);
  } else if (orden === 'text') console.log((await p.locator('body').innerText()).slice(0, 4000));
  else throw new Error(`paso desconocido: ${paso}`);
  await p.waitForTimeout(500);
}
await ctx.close();

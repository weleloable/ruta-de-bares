// Todas las pruebas contra el Supabase LOCAL, en orden y desde cero:
//
//   npm run pruebas:local              (base recreada + flujos + barrido + permisos + concurrencia + web)
//   npm run pruebas:local -- --sin-web (sin la parte de Chrome)
//
// Necesita Docker con el Supabase local arrancado (npm run db:local) y, para la
// parte web, `npx expo start --web --port 8091` con .env.local apuntando al local.
// BORRA la base local (supabase db reset): nada de produccion se toca nunca.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SALIDA } from './comun.mjs';

const sinWeb = process.argv.includes('--sin-web');
const paso = (titulo, comando, args) => {
  console.log(`\n=== ${titulo}`);
  // La shell solo para npx (en Windows es un .cmd). Con node, NO: la ruta suele ser
  // "C:\Program Files\nodejs\node.exe" y la shell la parte por el espacio.
  const conShell = process.platform === 'win32' && comando === 'npx';
  const r = spawnSync(comando, args, { stdio: 'inherit', shell: conShell, env: process.env });
  if (r.error) console.log(`  no se pudo lanzar: ${r.error.message}`);
  return r.status === 0;
};

const ok = {};
ok.reset = paso('Base local desde cero (todas las migraciones)', 'npx', ['-y', 'supabase@latest', 'db', 'reset']);
if (!ok.reset) process.exit(1);
for (const [clave, fichero] of [['flujos', '1-flujos.mjs'], ['barrido', '2-barrido.mjs'], ['permisos', '3-permisos.mjs'], ['concurrencia', '5-concurrencia.mjs']]) {
  ok[clave] = paso(fichero, process.execPath, ['--no-deprecation', join('scripts', 'pruebas-locales', fichero)]);
}
if (!sinWeb) ok.web = paso('4-web.mjs', process.execPath, ['--no-deprecation', join('scripts', 'pruebas-locales', '4-web.mjs')]);

const leer = (f) => {
  try {
    return JSON.parse(readFileSync(join(SALIDA, f), 'utf8'));
  } catch {
    return null;
  }
};
const flujos = leer('flujos.json') ?? [];
const barrido = leer('barrido.json');
const permisos = leer('permisos.json');
const conc = leer('concurrencia.json') ?? [];
const web = sinWeb ? null : leer('web.json');
console.log('\n=== Resumen');
console.log(`  flujos:       ${flujos.filter((r) => r.ok).length}/${flujos.length} pasos bien`);
if (barrido) console.log(`  barrido:      ${barrido.resumen.llamadas} llamadas, por clase ${JSON.stringify(barrido.resumen.porClase)}`);
if (permisos) console.log(`  permisos:     ${permisos.casos.length} pruebas, ${permisos.sospechosos.length} sospechosas`);
console.log(`  concurrencia: ${conc.filter((r) => r.ok).length}/${conc.length} escenarios bien`);
if (web) console.log(`  web:          ${web.length} pantallas, ${web.filter((r) => r.errores.length).length} con errores`);
console.log(`  todo en: ${SALIDA}`);
// "0 de 0 bien" no es un exito: si un paso no corrio o no dejo resultados, falla.
const noCorrio = Object.entries(ok).filter(([, v]) => v === undefined).map(([k]) => k);
const vacios = [!flujos.length && 'flujos', !barrido && 'barrido', !permisos && 'permisos', !conc.length && 'concurrencia', !sinWeb && !web && 'web'].filter(Boolean);
if (vacios.length || noCorrio.length) console.log(`  SIN RESULTADOS: ${[...vacios, ...noCorrio].join(', ')}`);
const mal =
  vacios.length > 0 || flujos.some((r) => !r.ok) || conc.some((r) => !r.ok) ||
  (barrido?.resumen.porClase.bug ?? 0) > 0 || (barrido?.resumen.autocomprobacion ?? []).some((a) => !a.ok) ||
  (permisos?.sospechosos.length ?? 0) > 0 || (web ?? []).some((r) => r.errores.some((e) => /EXCEPCION|PANTALLA DE ERROR/.test(e)));
process.exitCode = mal ? 1 : 0;

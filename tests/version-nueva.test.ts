/**
 * Cableado del aviso de version nueva (src/lib/versionApp.ts). La regla tiene
 * sus tests; aqui se vigila lo que, si se desconecta, no da error: deja a la
 * gente con la version vieja sin que nadie se entere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const leer = (ruta: string) => readFileSync(`${raiz}${ruta}`, 'utf8');

test('el layout raiz monta VersionNueva', () => {
  const layout = leer('app/_layout.tsx');
  assert.match(layout, /import \{ VersionNueva \} from '..\/src\/features\/version\/VersionNueva'/);
  assert.match(layout, /<VersionNueva \/>/);
});

test('la version web lee la variable del bundle, decide con decidirVersion y recarga solo por ella', () => {
  const web = leer('src/features/version/VersionNueva.web.tsx');
  assert.match(web, /process\.env\.EXPO_PUBLIC_APP_VERSION/);
  assert.match(web, /decidirVersion\(/);
  assert.match(web, /bloqueada: recargaBloqueada\(\)/);
  assert.match(web, /esAdmin: esAdmin\.current/);
  // Sin cache: si no, el navegador devolveria el version.json viejo.
  assert.match(web, /cache: 'no-store'/);
  // La barra solo se ve si es admin, aunque la decision ya lo diga.
  assert.match(web, /!isAdmin\) return null/);
});

test('lo que encontro el critico no vuelve: tope, vuelta en cola, isAdmin tardio, cerrar por commit', () => {
  const web = leer('src/features/version/VersionNueva.web.tsx');
  // Sin tope, un fetch colgado apagaba la comprobacion toda la sesion.
  assert.match(web, /signal: corte\.signal/);
  assert.match(web, /setTimeout\(\(\) => corte\.abort\(\), TOPE_PETICION_MS\)/);
  // Una vuelta del segundo plano con otra pregunta en vuelo se repite, no se tira.
  assert.match(web, /repetirCon = Math\.max\(repetirCon \?\? 0, ocultaMs\)/);
  // Al llegar el perfil de admin se pregunta otra vez.
  assert.match(web, /if \(isAdmin\) comprobarYa\.current\?\.\(\)/);
  // Cerrar esconde ESA version, no las siguientes.
  assert.match(web, /setCerrada\(nueva\)/);
  assert.match(web, /nueva === cerrada/);
});

test('la version nativa no hace nada (el movil se actualiza con su build)', () => {
  assert.match(leer('src/features/version/VersionNueva.tsx'), /return null;/);
});

test('una partida en marcha bloquea la recarga automatica', () => {
  const menu = leer('src/features/minijuegos/MenuMinijuegos.tsx');
  assert.match(menu, /useBloqueoRecarga\(activo !== null && vista === 'juego' && ultimo === null\)/);
});

/**
 * Don Quijote Cervecero esta abierto a todo el mundo (ya no es `enPruebas`).
 * El mecanismo `enPruebas` sigue existiendo (visibilidad.ts) para el proximo juego
 * que se quiera probar solo con admins: lo cubre visibilidad.test.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('el Quijote no esta marcado enPruebas: lo ve cualquiera con ruta', () => {
  const j = readFileSync('src/features/minijuegos/juegos.ts', 'utf8');
  const ini = j.indexOf('id: ID_QUIJOTE');
  assert.ok(ini > 0);
  const def = j.slice(ini, j.indexOf('  },', ini));
  assert.match(def, /ranking: true/);
  assert.doesNotMatch(def, /enPruebas/);
});

test('el cartel de inicio ya no dice "En pruebas"', () => {
  const c = readFileSync('src/features/minijuegos/juegos/quijote/QuijoteCervecero.web.tsx', 'utf8');
  assert.doesNotMatch(c, /En pruebas/);
  assert.match(c, /flechas o WASD y espacio/);
});

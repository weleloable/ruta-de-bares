/**
 * Los gestos del Quijote, cableados: UN DESLIZAMIENTO, UNA ACCION. Si alguien
 * vuelve a poner "un toque mueve un carril" o el re-medir cada 20 px (un arrastre
 * largo = varios carriles), esto falla.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const c = readFileSync('src/features/minijuegos/juegos/quijote/QuijoteCervecero.web.tsx', 'utf8');

test('la pantalla usa gestos.ts y no mide por su cuenta', () => {
  assert.match(c, /from '\.\/gestos'/);
  assert.match(c, /moverGesto\(d\.gesto, ev\.clientX, ev\.clientY\)/);
  assert.match(c, /soltarGesto\(d\.gesto, ev\.clientX, ev\.clientY\)/);
  // Lo de antes: umbral propio, re-medir tras cada gesto y toque a un lado.
  assert.doesNotMatch(c, /direccionDeGesto/);
  assert.doesNotMatch(c, /TOQUE_MAX_MS/);
  assert.doesNotMatch(c, /d\.x = ev\.clientX/);
  assert.doesNotMatch(c, /caja\.left \+ caja\.width \/ 2/);
});

test('el cartel de inicio explica el gesto nuevo, sin el toque a un lado', () => {
  assert.match(c, /Desliza a un lado para cambiar de carril/);
  assert.doesNotMatch(c, /Toca a un lado/);
});

test('el carril sale como data-carril (lo mira verificar y la prueba de gestos en Chrome)', () => {
  assert.match(c, /data-carril=\{hud\.carril\}/);
});

test('al empezar otra partida o pausar, el dedo se suelta y los gestos pendientes se vacian (no queda agarrado)', () => {
  assert.match(c, /const soltarDedo = useCallback\(\(\) => \{\s*dedo\.current = null;\s*cola\.current = \[\];/);
  // arrancar suelta el dedo; pausar(true) tambien.
  assert.match(c, /pausar\(false\);\s*soltarDedo\(\);/);
  assert.match(c, /if \(si\) \{\s*soltarDedo\(\);/);
});

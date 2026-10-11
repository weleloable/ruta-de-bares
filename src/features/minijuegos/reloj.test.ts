import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { pasoDeTiempo } from './reloj.ts';

test('un fotograma normal da los segundos que pasaron', () => {
  assert.equal(pasoDeTiempo(1016, 1000, 0.05), 0.016);
});

test('un fotograma que llega muy tarde no da un salto: se queda en el tope', () => {
  assert.equal(pasoDeTiempo(5000, 1000, 0.05), 0.05);
});

test('si el reloj del sistema va hacia atras, el juego se queda quieto (0), no corre al reves', () => {
  assert.equal(pasoDeTiempo(1000, 5000, 0.05), 0);
  assert.equal(pasoDeTiempo(1000, 1000, 0.05), 0);
});

test('un valor roto (NaN, infinito) tampoco mueve el juego', () => {
  assert.equal(pasoDeTiempo(Number.NaN, 1000, 0.05), 0);
  assert.equal(pasoDeTiempo(Number.POSITIVE_INFINITY, 1000, 0.05), 0);
});

test('los cuatro bucles de los minijuegos lo usan y no restan relojes a mano', () => {
  for (const f of [
    'src/features/minijuegos/juegos/cana/CanaPerfecta.tsx',
    'src/features/minijuegos/juegos/maestro/PasoMaceracion.tsx',
    'src/features/minijuegos/juegos/maestro/PasoLupulo.tsx',
    'src/features/minijuegos/juegos/maestro/PasoSiembra.tsx',
  ]) {
    const fuente = readFileSync(f, 'utf8');
    assert.match(fuente, /pasoDeTiempo\(ahora, ultimo, DT_MAX\)/, f);
    assert.doesNotMatch(fuente, /\(ahora - ultimo\) \/ 1000/, f);
  }
});

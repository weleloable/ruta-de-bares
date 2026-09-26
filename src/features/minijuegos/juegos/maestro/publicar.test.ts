import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recetaDesdeResultado } from './publicar.ts';

const valido = {
  juego: 'maestro-cervecero',
  puntuacion: 80,
  detalles: { nombre: 'Stout de Cervantes', malta: 'negra', levadura: 'ale', maceracion: 90, amargor: 70, aroma: 60 },
};

test('saca la receta de los detalles y NO manda la nota', () => {
  const r = recetaDesdeResultado(valido);
  assert.deepEqual(r, { nombre: 'Stout de Cervantes', malta: 'negra', levadura: 'ale', maceracion: 90, amargor: 70, aroma: 60 });
  assert.ok(!('puntuacion' in (r as object)) && !('estilo' in (r as object)));
});

test('sin detalles, o con un dato que falta o no es entero 0-100, devuelve null', () => {
  assert.equal(recetaDesdeResultado({ juego: 'x', puntuacion: 1 }), null);
  for (const roto of [
    { nombre: '' }, { nombre: '  ' }, { malta: '' }, { levadura: 3 }, { maceracion: 101 },
    { amargor: -1 }, { aroma: 50.5 }, { aroma: '50' },
  ]) {
    assert.equal(recetaDesdeResultado({ ...valido, detalles: { ...valido.detalles, ...roto } as never }), null, JSON.stringify(roto));
  }
});

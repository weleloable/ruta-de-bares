import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calcularCerveza, calcularCuerpo, calcularEstilo, calcularPuntuacion, IBU_IPA, veredicto } from './estilo.ts';
import type { RecetaCompleta } from './pasos.ts';

const receta = (parcial: Partial<RecetaCompleta> = {}): RecetaCompleta => ({
  malta: 'palida',
  maceracion: 1,
  lupulo: { amargor: 1, aroma: 1 },
  levadura: 'ale',
  ...parcial,
});

test('las lager salen de la malta: Pilsner, ambar, Dunkel y Schwarzbier', () => {
  assert.equal(calcularEstilo('palida', 'lager', 0), 'Pilsner');
  assert.equal(calcularEstilo('caramelo', 'lager', 0), 'Lager ámbar');
  assert.equal(calcularEstilo('tostada', 'lager', 0), 'Dunkel');
  assert.equal(calcularEstilo('negra', 'lager', 0), 'Schwarzbier');
});

test('las ale: ambar, tostada y stout; y la palida es IPA solo si amarga lo suficiente', () => {
  assert.equal(calcularEstilo('caramelo', 'ale', 0), 'Amber Ale');
  assert.equal(calcularEstilo('tostada', 'ale', 0), 'Tostada');
  assert.equal(calcularEstilo('negra', 'ale', 0), 'Stout');
  assert.equal(calcularEstilo('palida', 'ale', IBU_IPA - 1), 'Rubia');
  assert.equal(calcularEstilo('palida', 'ale', IBU_IPA), 'IPA');
});

test('el amargor de la receta decide IPA o rubia', () => {
  assert.equal(calcularCerveza(receta({ lupulo: { amargor: 1, aroma: 0 } })).estilo, 'IPA');
  assert.equal(calcularCerveza(receta({ lupulo: { amargor: 0, aroma: 1 } })).estilo, 'Rubia');
});

test('la amargor no cambia el estilo de una malta oscura', () => {
  assert.equal(calcularCerveza(receta({ malta: 'negra', lupulo: { amargor: 1, aroma: 1 } })).estilo, 'Stout');
  assert.equal(calcularCerveza(receta({ malta: 'negra', lupulo: { amargor: 0, aroma: 0 } })).estilo, 'Stout');
});

test('cuatro maltas x dos levaduras dan ocho estilos con nombre, sin huecos', () => {
  for (const malta of ['palida', 'caramelo', 'tostada', 'negra'] as const) {
    for (const levadura of ['ale', 'lager'] as const) {
      const c = calcularCerveza(receta({ malta, levadura }));
      assert.ok(c.estilo.length > 0, `${malta}/${levadura}`);
    }
  }
});

test('graduacion y amargor quedan en rangos creibles y suben con la precision', () => {
  const mala = calcularCerveza(receta({ maceracion: 0, lupulo: { amargor: 0, aroma: 0 }, levadura: 'lager' }));
  const buena = calcularCerveza(receta());
  assert.ok(mala.abv >= 4 && buena.abv <= 7, `${mala.abv} ${buena.abv}`);
  assert.ok(buena.abv > mala.abv);
  assert.equal(mala.ibu, 10);
  assert.equal(buena.ibu, 60);
  // Un decimal como mucho.
  assert.equal(buena.abv, Math.round(buena.abv * 10) / 10);
});

test('el cuerpo depende de la malta y de la maceracion', () => {
  assert.equal(calcularCuerpo('palida', 0), 'ligero');
  assert.equal(calcularCuerpo('negra', 1), 'con cuerpo');
  assert.equal(calcularCuerpo('caramelo', 0), 'medio');
  assert.ok(['ligero', 'medio'].includes(calcularCuerpo('palida', 1)));
});

test('la puntuacion va de 0 a 100 y pesa 40 / 30 / 30', () => {
  assert.equal(calcularPuntuacion(receta({ maceracion: 0, lupulo: { amargor: 0, aroma: 0 } })), 0);
  assert.equal(calcularPuntuacion(receta()), 100);
  assert.equal(calcularPuntuacion(receta({ maceracion: 1, lupulo: { amargor: 0, aroma: 0 } })), 40);
  assert.equal(calcularPuntuacion(receta({ maceracion: 0, lupulo: { amargor: 1, aroma: 0 } })), 30);
  assert.equal(calcularPuntuacion(receta({ maceracion: 0, lupulo: { amargor: 0, aroma: 1 } })), 30);
});

test('el veredicto cambia con la nota y cubre todo el rango', () => {
  const frases = new Set([0, 25, 50, 70, 90, 100].map(veredicto));
  assert.equal(frases.size, 6);
  for (let n = 0; n <= 100; n++) assert.ok(veredicto(n).length > 0);
});

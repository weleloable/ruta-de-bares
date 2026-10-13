import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { credencialCompleta, nivelMedalla, umbralesMedalla } from './progreso.ts';

describe('nivelMedalla', () => {
  it('con 14 bares: bronce a los 5, plata a los 10, oro a los 14', () => {
    assert.deepEqual(umbralesMedalla(14), { bronce: 5, plata: 10, oro: 14 });
    const niveles = Array.from({ length: 15 }, (_, n) => nivelMedalla(n, 14));
    assert.deepEqual(niveles, [
      ...Array(5).fill(null), // 0 a 4
      ...Array(5).fill('bronce'), // 5 a 9
      ...Array(4).fill('plata'), // 10 a 13
      'oro', // 14
    ]);
  });

  it('"mas de un tercio": justo un tercio no cuenta (9 bares, 3 sellos)', () => {
    assert.equal(nivelMedalla(3, 9), null);
    assert.equal(nivelMedalla(4, 9), 'bronce');
    assert.equal(nivelMedalla(6, 9), 'bronce'); // justo dos tercios
    assert.equal(nivelMedalla(7, 9), 'plata');
    assert.equal(nivelMedalla(9, 9), 'oro');
  });

  it('rutas muy cortas: el oro manda sobre los umbrales que coinciden con el', () => {
    assert.equal(nivelMedalla(1, 1), 'oro');
    assert.equal(nivelMedalla(1, 2), 'bronce');
    assert.equal(nivelMedalla(2, 2), 'oro');
    assert.equal(nivelMedalla(1, 3), null);
    assert.equal(nivelMedalla(2, 3), 'bronce');
    assert.equal(nivelMedalla(3, 3), 'oro');
  });

  it('una ruta sin bares no da ninguna medalla', () => {
    assert.equal(nivelMedalla(0, 0), null);
  });

  it('el nivel solo sube con los sellos y oro es exactamente credencialCompleta', () => {
    for (const total of [1, 2, 3, 4, 7, 9, 14, 30]) {
      const orden = { null: 0, bronce: 1, plata: 2, oro: 3 } as const;
      let anterior = 0;
      for (let n = 0; n <= total; n++) {
        const nivel = nivelMedalla(n, total);
        const rango = orden[String(nivel) as keyof typeof orden];
        assert.ok(rango >= anterior, `${n}/${total} baja de nivel`);
        assert.equal(nivel === 'oro', credencialCompleta(n, total), `${n}/${total}`);
        anterior = rango;
      }
    }
  });
});

describe('credencialCompleta', () => {
  it('todos los bares sellados: completa', () => {
    assert.equal(credencialCompleta(5, 5), true);
  });
  it('falta uno: no', () => {
    assert.equal(credencialCompleta(4, 5), false);
  });
  it('ninguno: no', () => {
    assert.equal(credencialCompleta(0, 5), false);
  });
  it('una ruta sin bares no esta completa (0 de 0)', () => {
    assert.equal(credencialCompleta(0, 0), false);
  });
  it('un solo bar, sellado: completa', () => {
    assert.equal(credencialCompleta(1, 1), true);
  });
});

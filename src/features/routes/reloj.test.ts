import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { componerHora, marcasDeHoras, marcasDeMinutos } from './reloj.ts';
import { parseHora } from './horas.ts';

const TAMANO = 240;
const cerca = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

describe('componerHora', () => {
  it('rellena con ceros', () => {
    assert.equal(componerHora(7, 5), '07:05');
    assert.equal(componerHora(0, 0), '00:00');
    assert.equal(componerHora(23, 55), '23:55');
  });

  it('lo que produce lo entiende parseHora (es el formato que consume construirVentana)', () => {
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += 5) {
        assert.deepEqual(parseHora(componerHora(h, m)), { horas: h, minutos: m });
      }
    }
  });
});

describe('marcasDeHoras', () => {
  const marcas = marcasDeHoras(TAMANO, 96, 62);

  it('cubre las 24 horas exactamente una vez', () => {
    assert.deepEqual(
      marcas.map((m) => m.valor).sort((a, b) => a - b),
      Array.from({ length: 24 }, (_, i) => i),
    );
  });

  it('las 00 van arriba en el anillo exterior y las 12 arriba en el interior', () => {
    const cero = marcas.find((m) => m.valor === 0)!;
    const doce = marcas.find((m) => m.valor === 12)!;
    cerca(cero.x, 120);
    cerca(cero.y, 120 - 96);
    cerca(doce.x, 120);
    cerca(doce.y, 120 - 62);
  });

  it('las 15 estan a la derecha (como las 3 de un reloj) y las 18 abajo', () => {
    const quince = marcas.find((m) => m.valor === 15)!;
    cerca(quince.x, 120 + 96);
    cerca(quince.y, 120);
    const dieciocho = marcas.find((m) => m.valor === 18)!;
    cerca(dieciocho.x, 120);
    cerca(dieciocho.y, 120 + 96);
  });

  it('las 21 estan a la izquierda y el angulo crece en sentido horario', () => {
    const veintiuna = marcas.find((m) => m.valor === 21)!;
    cerca(veintiuna.x, 120 - 96);
    assert.equal(veintiuna.angulo, 270);
    assert.equal(marcas.find((m) => m.valor === 17)!.angulo, 150);
  });

  it('cada hora de la tarde comparte angulo con su gemela de la manana (17 y 5)', () => {
    assert.equal(marcas.find((m) => m.valor === 17)!.angulo, marcas.find((m) => m.valor === 5)!.angulo);
  });

  it('las etiquetas del anillo exterior llevan dos digitos y las del interior no', () => {
    assert.equal(marcas.find((m) => m.valor === 0)!.etiqueta, '00');
    assert.equal(marcas.find((m) => m.valor === 17)!.etiqueta, '17');
    assert.equal(marcas.find((m) => m.valor === 5)!.etiqueta, '5');
  });

  it('todas quedan dentro del reloj', () => {
    for (const m of marcas) {
      assert.ok(m.x >= 0 && m.x <= TAMANO && m.y >= 0 && m.y <= TAMANO, `${m.valor}`);
    }
  });
});

describe('marcasDeMinutos', () => {
  const marcas = marcasDeMinutos(TAMANO, 96);

  it('da 00, 05, ... 55', () => {
    assert.deepEqual(
      marcas.map((m) => m.valor),
      [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
    );
    assert.equal(marcas[1].etiqueta, '05');
  });

  it('el 00 va arriba, el 15 a la derecha, el 30 abajo y el 45 a la izquierda', () => {
    cerca(marcas[0].y, 120 - 96);
    cerca(marcas[3].x, 120 + 96);
    cerca(marcas[6].y, 120 + 96);
    cerca(marcas[9].x, 120 - 96);
  });
});

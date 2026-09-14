import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { conHora, construirVentana, formatHora, parseHora } from './horas.ts';

const DIA = new Date(2026, 8, 19); // 19 de septiembre de 2026, hora local

describe('parseHora', () => {
  it('acepta horas validas con y sin cero delante', () => {
    assert.deepEqual(parseHora('19:30'), { horas: 19, minutos: 30 });
    assert.deepEqual(parseHora('9:05'), { horas: 9, minutos: 5 });
    assert.deepEqual(parseHora('00:00'), { horas: 0, minutos: 0 });
    assert.deepEqual(parseHora('23:59'), { horas: 23, minutos: 59 });
    assert.deepEqual(parseHora('  20:00  '), { horas: 20, minutos: 0 });
  });

  it('rechaza lo que no es una hora del reloj', () => {
    for (const malo of ['24:00', '19:60', '19', '19:3', '7:5', '19.30', '', 'abc', '-1:00']) {
      assert.equal(parseHora(malo), null, `deberia rechazar "${malo}"`);
    }
  });
});

describe('formatHora', () => {
  it('siempre dos digitos', () => {
    assert.equal(formatHora(new Date(2026, 8, 19, 9, 5)), '09:05');
    assert.equal(formatHora(new Date(2026, 8, 19, 23, 59)), '23:59');
    assert.equal(formatHora(new Date(2026, 8, 19, 0, 0)), '00:00');
  });

  it('parseHora y formatHora son inversas', () => {
    for (const texto of ['00:00', '09:05', '19:30', '23:59']) {
      assert.equal(formatHora(conHora(DIA, parseHora(texto)!)), texto);
    }
  });
});

describe('construirVentana', () => {
  it('construye una ventana normal dentro del mismo dia', () => {
    const r = construirVentana(DIA, '19:00', '20:30');
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.cruzaMedianoche, false);
    assert.equal(formatHora(r.ventana.opensAt), '19:00');
    assert.equal(formatHora(r.ventana.closesAt), '20:30');
    assert.equal(r.ventana.opensAt.getDate(), 19);
    assert.equal(r.ventana.closesAt.getDate(), 19);
  });

  it('cruza medianoche cuando el cierre es menor que la apertura', () => {
    const r = construirVentana(DIA, '23:30', '01:00');
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.cruzaMedianoche, true);
    assert.equal(r.ventana.closesAt.getDate(), 20);
    assert.equal(formatHora(r.ventana.closesAt), '01:00');
    assert.ok(r.ventana.closesAt.getTime() > r.ventana.opensAt.getTime());
  });

  it('apertura y cierre iguales dan una ventana de 24 h, nunca vacia', () => {
    // El CHECK del SQL exige closes_at > opens_at: una ventana de duracion cero
    // seria rechazada por el servidor, asi que aqui nunca se genera.
    const r = construirVentana(DIA, '20:00', '20:00');
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.cruzaMedianoche, true);
    assert.equal(
      r.ventana.closesAt.getTime() - r.ventana.opensAt.getTime(),
      24 * 60 * 60 * 1000,
    );
  });

  it('la ventana siempre cumple closes > opens, sea cual sea la entrada valida', () => {
    for (const abre of ['00:00', '06:15', '12:00', '19:30', '23:59']) {
      for (const cierra of ['00:00', '06:15', '12:00', '19:30', '23:59']) {
        const r = construirVentana(DIA, abre, cierra);
        assert.ok(r.ok, `${abre}-${cierra}`);
        if (!r.ok) continue;
        assert.ok(
          r.ventana.closesAt.getTime() > r.ventana.opensAt.getTime(),
          `${abre}-${cierra} produjo una ventana no positiva`,
        );
      }
    }
  });

  it('informa de cual de las dos horas esta mal', () => {
    const malaApertura = construirVentana(DIA, '25:00', '20:00');
    assert.ok(!malaApertura.ok);
    if (!malaApertura.ok) assert.match(malaApertura.error, /apertura/);

    const malCierre = construirVentana(DIA, '19:00', 'luego');
    assert.ok(!malCierre.ok);
    if (!malCierre.ok) assert.match(malCierre.error, /cierre/);
  });
});

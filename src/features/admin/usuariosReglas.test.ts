import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describirErrorUsuarios, estadoPlazo, sellosPorRuta, type SelloFila } from './usuariosReglas.ts';

const fila = (ruta: string, bar: string, sellado: boolean): SelloFila => ({
  route_id: ruta,
  ruta: `Ruta ${ruta}`,
  route_bar_id: `${ruta}-${bar}`,
  bar,
  orden: 0,
  opens_at: '2026-10-10T20:00:00Z',
  closes_at: '2026-10-10T22:00:00Z',
  sellado_at: sellado ? '2026-10-10T21:00:00Z' : null,
  sellado_por: null,
  sellado_motivo: null,
});

describe('sellosPorRuta', () => {
  it('una tarjeta por ruta, en orden, contando los sellados', () => {
    const r = sellosPorRuta([fila('a', 'Uno', true), fila('a', 'Dos', false), fila('b', 'Tres', true)]);
    assert.deepEqual(
      r.map((x) => [x.ruta, x.sellados, x.bares.map((b) => b.bar)]),
      [
        ['Ruta a', 1, ['Uno', 'Dos']],
        ['Ruta b', 1, ['Tres']],
      ],
    );
  });
});

describe('estadoPlazo', () => {
  const f = fila('a', 'Uno', false);
  it('antes, durante y despues', () => {
    assert.equal(estadoPlazo(f, new Date('2026-10-10T19:00:00Z')), 'sin-abrir');
    assert.equal(estadoPlazo(f, new Date('2026-10-10T21:00:00Z')), null);
    assert.equal(estadoPlazo(f, new Date('2026-10-10T23:00:00Z')), 'cerrado');
  });
});

describe('describirErrorUsuarios', () => {
  it('traduce cada codigo del servidor y deja pasar lo que no conoce', () => {
    for (const c of ['NOT_ADMIN', 'REASON_REQUIRED', 'SELF', 'NOT_FOUND', 'TARGET_IS_ADMIN', 'OWNS_ROUTES', 'NOT_STAMPABLE', 'NOT_A_MEMBER']) {
      assert.notEqual(describirErrorUsuarios(`ERROR: ${c}`), `ERROR: ${c}`, c);
    }
    assert.equal(describirErrorUsuarios('otra cosa'), 'otra cosa');
  });

  it('BAR_NOT_FOUND no se confunde con NOT_FOUND', () => {
    assert.match(describirErrorUsuarios('BAR_NOT_FOUND'), /bar/);
  });

  it('ROUTE_NOT_PUBLISHED y la clave ajena en crudo tambien se traducen', () => {
    assert.match(describirErrorUsuarios('ROUTE_NOT_PUBLISHED'), /publicada/);
    assert.equal(
      describirErrorUsuarios('insert or update on table "stamps" violates foreign key constraint "stamps_user_id_fkey"'),
      'Esa cuenta ya no existe.',
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignSortOrder,
  changedPositions,
  findRouteWarnings,
  moveBar,
  validateBarDraft,
  validateRouteDraft,
  type BarDraft,
  type OrderedBar,
} from './validation.ts';

function draft(overrides: Partial<BarDraft> = {}): BarDraft {
  return {
    name: 'La Venencia',
    address: 'Calle de Echegaray 7',
    lat: 40.4155,
    lng: -3.7005,
    radiusM: 120,
    opensAt: new Date('2026-09-19T18:00:00Z'),
    closesAt: new Date('2026-09-19T19:00:00Z'),
    notes: '',
    ...overrides,
  };
}

describe('validateRouteDraft', () => {
  it('acepta una ruta minima', () => {
    assert.deepEqual(
      validateRouteDraft({ name: 'Ruta de La Latina', description: '', eventDate: null }),
      [],
    );
  });

  it('rechaza nombre vacio o solo espacios', () => {
    assert.equal(validateRouteDraft({ name: '   ', description: '', eventDate: null }).length, 1);
  });

  it('rechaza fechas mal formadas y acepta AAAA-MM-DD', () => {
    assert.equal(
      validateRouteDraft({ name: 'r', description: '', eventDate: '19/09/2026' }).length,
      1,
    );
    assert.deepEqual(
      validateRouteDraft({ name: 'r', description: '', eventDate: '2026-09-19' }),
      [],
    );
  });
});

describe('validateBarDraft', () => {
  it('acepta un bar bien formado', () => {
    assert.deepEqual(validateBarDraft(draft()), []);
  });

  it('rechaza cierre anterior o igual a apertura', () => {
    assert.equal(
      validateBarDraft(draft({ closesAt: new Date('2026-09-19T18:00:00Z') })).length,
      1,
    );
    assert.equal(
      validateBarDraft(draft({ closesAt: new Date('2026-09-19T17:00:00Z') })).length,
      1,
    );
  });

  it('rechaza coordenadas fuera de rango, NaN e isla nula', () => {
    assert.ok(validateBarDraft(draft({ lat: 91 })).length > 0);
    assert.ok(validateBarDraft(draft({ lng: -181 })).length > 0);
    assert.ok(validateBarDraft(draft({ lat: Number.NaN })).length > 0);
    assert.ok(validateBarDraft(draft({ lat: 0, lng: 0 })).length > 0);
  });

  it('rechaza radios fuera de los limites del CHECK de SQL', () => {
    assert.ok(validateBarDraft(draft({ radiusM: 19 })).length > 0);
    assert.ok(validateBarDraft(draft({ radiusM: 2001 })).length > 0);
    assert.ok(validateBarDraft(draft({ radiusM: 120.5 })).length > 0);
    assert.deepEqual(validateBarDraft(draft({ radiusM: 20 })), []);
    assert.deepEqual(validateBarDraft(draft({ radiusM: 2000 })), []);
  });

  it('rechaza fechas invalidas sin devolver NaN al usuario', () => {
    const errores = validateBarDraft(draft({ opensAt: new Date('no soy una fecha') }));
    assert.equal(errores.length, 1);
    assert.ok(!errores[0].includes('NaN'));
  });

  it('acumula todos los errores en vez de parar en el primero', () => {
    assert.ok(validateBarDraft(draft({ name: '', lat: 999, radiusM: 1 })).length >= 3);
  });
});

describe('findRouteWarnings', () => {
  function bar(id: string, abre: string, cierra: string): OrderedBar {
    return { id, name: id, opensAt: new Date(abre), closesAt: new Date(cierra) };
  }

  it('una ruta encadenada no genera avisos', () => {
    const avisos = findRouteWarnings([
      bar('a', '2026-09-19T18:00:00Z', '2026-09-19T19:00:00Z'),
      bar('b', '2026-09-19T19:00:00Z', '2026-09-19T20:00:00Z'),
      bar('c', '2026-09-19T20:00:00Z', '2026-09-19T21:00:00Z'),
    ]);
    assert.deepEqual(avisos, []);
  });

  it('detecta solape', () => {
    const avisos = findRouteWarnings([
      bar('a', '2026-09-19T18:00:00Z', '2026-09-19T19:30:00Z'),
      bar('b', '2026-09-19T19:00:00Z', '2026-09-19T20:00:00Z'),
    ]);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].kind, 'overlap');
  });

  it('distingue "va hacia atras" de un simple solape', () => {
    const avisos = findRouteWarnings([
      bar('a', '2026-09-19T20:00:00Z', '2026-09-19T21:00:00Z'),
      bar('b', '2026-09-19T18:00:00Z', '2026-09-19T19:00:00Z'),
    ]);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].kind, 'out_of_order');
  });

  it('aguanta listas de 0 y 1 bar', () => {
    assert.deepEqual(findRouteWarnings([]), []);
    assert.deepEqual(findRouteWarnings([bar('a', '2026-09-19T18:00:00Z', '2026-09-19T19:00:00Z')]), []);
  });
});

describe('moveBar', () => {
  const lista = ['a', 'b', 'c', 'd'];

  it('mueve hacia abajo y hacia arriba', () => {
    assert.deepEqual(moveBar(lista, 0, 2), ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveBar(lista, 3, 0), ['d', 'a', 'b', 'c']);
  });

  it('no muta la entrada', () => {
    moveBar(lista, 0, 3);
    assert.deepEqual(lista, ['a', 'b', 'c', 'd']);
  });

  it('indices fuera de rango o iguales devuelven copia identica', () => {
    assert.deepEqual(moveBar(lista, 0, 0), lista);
    assert.deepEqual(moveBar(lista, -1, 2), lista);
    assert.deepEqual(moveBar(lista, 0, 9), lista);
    assert.deepEqual(moveBar([], 0, 1), []);
  });
});

describe('assignSortOrder', () => {
  it('numera 0..n-1 en el orden del array', () => {
    assert.deepEqual(assignSortOrder([{ id: 'x' }, { id: 'y' }, { id: 'z' }]), [
      { id: 'x', sort_order: 0 },
      { id: 'y', sort_order: 1 },
      { id: 'z', sort_order: 2 },
    ]);
  });

  it('reordenar y numerar produce posiciones densas sin huecos', () => {
    const tras = assignSortOrder(moveBar([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 2, 0));
    assert.deepEqual(
      tras.map((b) => b.sort_order),
      [0, 1, 2],
    );
    assert.equal(tras[0].id, 'c');
  });
});

describe('changedPositions', () => {
  it('un intercambio de dos toca dos filas, no toda la ruta', () => {
    const actuales = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ]);
    const tras = assignSortOrder(moveBar([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], 0, 1));
    const cambiados = changedPositions(tras, actuales);
    assert.deepEqual(
      cambiados.map((b) => b.id).sort(),
      ['a', 'b'],
    );
  });

  it('sin cambios no devuelve nada', () => {
    const actuales = new Map([
      ['a', 0],
      ['b', 1],
    ]);
    assert.deepEqual(changedPositions(assignSortOrder([{ id: 'a' }, { id: 'b' }]), actuales), []);
  });

  it('un id que no estaba antes cuenta como cambio', () => {
    assert.deepEqual(changedPositions([{ id: 'nuevo', sort_order: 0 }], new Map()), [
      { id: 'nuevo', sort_order: 0 },
    ]);
  });

  it('tras borrar el primero, renumerar toca a todos los que se corren', () => {
    // Quedan b(1), c(2) y pasan a ser 0 y 1: las dos filas cambian.
    const actuales = new Map([
      ['b', 1],
      ['c', 2],
    ]);
    const cambiados = changedPositions(assignSortOrder([{ id: 'b' }, { id: 'c' }]), actuales);
    assert.equal(cambiados.length, 2);
  });
});

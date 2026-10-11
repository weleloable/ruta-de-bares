import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ajustarObjetivo, horaLimite, limitesObjetivo, recienConseguidos, textoCondicion } from './retos.ts';

describe('retos', () => {
  it('los limites del objetivo son los de la base de datos', () => {
    assert.deepEqual(limitesObjetivo('categorias', null), { min: 2, max: 6 });
    assert.deepEqual(limitesObjetivo('consumiciones_categoria', 'chupito'), { min: 1, max: 3 }, 'con alcohol, como mucho 3');
    assert.deepEqual(limitesObjetivo('consumiciones_categoria', 'sin_alcohol'), { min: 1, max: 20 });
    assert.equal(ajustarObjetivo(9, 'consumiciones_categoria', 'jarra'), 3);
    assert.equal(ajustarObjetivo(1, 'categorias', null), 2);
  });

  it('el texto de cada condicion', () => {
    const base = { categoria: null, hora_limite: null };
    assert.equal(textoCondicion({ ...base, tipo: 'bares', objetivo: 1 }), 'Sella 1 bar');
    assert.equal(textoCondicion({ ...base, tipo: 'bares', objetivo: 3 }), 'Sella 3 bares');
    assert.equal(textoCondicion({ ...base, tipo: 'consumiciones_categoria', objetivo: 2, categoria: 'sidra' }), 'Apunta 2 consumiciones de sidra');
    assert.equal(textoCondicion({ ...base, tipo: 'encuentros_qr', objetivo: 1 }), 'Consigue 1 encuentro por QR');
    const limite = new Date(2026, 9, 17, 23, 30).toISOString();
    assert.equal(textoCondicion({ ...base, tipo: 'ruta_antes_de', objetivo: 1, hora_limite: limite }), 'Completa la ruta antes de las 23:30');
  });

  it('la hora limite cae el dia del primer bar o, si es antes de abrir, el siguiente', () => {
    const abre = new Date(2026, 9, 17, 20, 0);
    assert.deepEqual(horaLimite('23:30', abre), new Date(2026, 9, 17, 23, 30));
    assert.deepEqual(horaLimite('1:15', abre), new Date(2026, 9, 18, 1, 15));
    assert.equal(horaLimite('25:00', abre), null);
  });

  it('se celebran solo los que pasan a conseguidos', () => {
    const antes = [{ id: 'a', conseguido: true }, { id: 'b', conseguido: false }];
    const ahora = [{ id: 'a', conseguido: true }, { id: 'b', conseguido: true }, { id: 'c', conseguido: true }];
    assert.deepEqual(recienConseguidos(antes, ahora).map((r) => r.id), ['b', 'c']);
    assert.deepEqual(recienConseguidos(null, ahora), [], 'la primera lectura no celebra');
  });
});

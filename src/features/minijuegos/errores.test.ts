import assert from 'node:assert/strict';
import { test } from 'node:test';

import { traducirErrorMinijuegos } from './errores.ts';

test('cada codigo de la migracion tiene su texto', () => {
  for (const codigo of [
    'TOO_FAST', 'SUSPENDED', 'FORBIDDEN', 'NOT_AUTHENTICATED', 'LIMIT_REACHED',
    'INVALID_NAME', 'INVALID_SCORE', 'INVALID_GAME', 'INVALID_RECIPE',
  ]) {
    const texto = traducirErrorMinijuegos(`error: ${codigo}`);
    assert.ok(!texto.includes(codigo), `${codigo} se ve en crudo: ${texto}`);
  }
});

test('la funcion que no existe avisa de que falta la migracion', () => {
  assert.match(
    traducirErrorMinijuegos('Could not find the function public.minigame_ranking(p_game) in the schema cache'),
    /0030/,
  );
});

test('lo desconocido pasa tal cual, y vacio no deja el mensaje en blanco', () => {
  assert.equal(traducirErrorMinijuegos('algo raro'), 'algo raro');
  assert.ok(traducirErrorMinijuegos('').length > 0);
});

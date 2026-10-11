import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BANCO } from './banco.ts';

test('el banco empaquetado es valido: ids unicos, niveles 1 a 5, 3 incorrectas distintas de la correcta', () => {
  const ids = new Set<string>();
  for (const p of BANCO.preguntas) {
    assert.ok(!ids.has(p.id), `id repetido: ${p.id}`);
    ids.add(p.id);
    assert.ok([1, 2, 3, 4, 5].includes(p.nivel), `${p.id}: nivel ${p.nivel}`);
    assert.equal(p.incorrectas.length, 3, `${p.id}: incorrectas`);
    assert.ok(!p.incorrectas.includes(p.correcta), `${p.id}: una incorrecta igual a la correcta`);
    assert.equal(new Set(p.incorrectas).size, 3, `${p.id}: incorrectas repetidas`);
    assert.ok(BANCO.categorias.includes(p.categoria), `${p.id}: categoria ${p.categoria}`);
    for (const campo of [p.pregunta, p.correcta, p.explicacion, ...p.incorrectas]) {
      assert.ok(campo.trim().length > 0, `${p.id}: texto vacio`);
    }
  }
});

test('hay al menos 10 preguntas por nivel', () => {
  for (const nivel of [1, 2, 3, 4, 5]) {
    const n = BANCO.preguntas.filter((p) => p.nivel === nivel).length;
    assert.ok(n >= 10, `nivel ${nivel}: solo ${n}`);
  }
});

test('el id empieza por el nivel de la pregunta (n3-07 es de nivel 3)', () => {
  for (const p of BANCO.preguntas) assert.equal(p.id.slice(0, 2), `n${p.nivel}`, p.id);
});

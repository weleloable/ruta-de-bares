import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BANCO } from './banco.ts';
import { NOMBRE_NIVEL } from './config.ts';

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

// Suelo, no igualdad: se pueden anadir preguntas, pero que nadie vuelva por
// descuido al banco de 90 (v1) sustituyendo el archivo por uno viejo.
test('banco v2: al menos 250 preguntas y 50 por nivel', () => {
  assert.ok(BANCO.version >= 2, `version ${BANCO.version}`);
  assert.ok(BANCO.preguntas.length >= 250, `solo ${BANCO.preguntas.length} preguntas`);
  for (const nivel of [1, 2, 3, 4, 5]) {
    const n = BANCO.preguntas.filter((p) => p.nivel === nivel).length;
    assert.ok(n >= 50, `nivel ${nivel}: solo ${n}`);
  }
});

test('los ids de cada nivel son seguidos (n3-01, n3-02...) y sin huecos', () => {
  for (const nivel of [1, 2, 3, 4, 5]) {
    const ids = BANCO.preguntas.filter((p) => p.nivel === nivel).map((p) => p.id);
    const esperados = ids.map((_, i) => `n${nivel}-${String(i + 1).padStart(2, '0')}`);
    assert.deepEqual(ids, esperados, `nivel ${nivel}`);
  }
});

test('ningun enunciado se repite, ni dentro de una pregunta dos opciones iguales (sin mirar mayusculas)', () => {
  const enunciados = new Set<string>();
  for (const p of BANCO.preguntas) {
    const clave = p.pregunta.trim().toLowerCase();
    assert.ok(!enunciados.has(clave), `${p.id}: enunciado repetido`);
    enunciados.add(clave);
    const opciones = [p.correcta, ...p.incorrectas].map((o) => o.trim().toLowerCase());
    assert.equal(new Set(opciones).size, 4, `${p.id}: dos opciones iguales`);
  }
});

test('todas las categorias declaradas se usan y no hay ninguna sin declarar', () => {
  const usadas = new Set(BANCO.preguntas.map((p) => p.categoria));
  for (const c of BANCO.categorias) assert.ok(usadas.has(c), `categoria sin preguntas: ${c}`);
  for (const c of usadas) assert.ok(BANCO.categorias.includes(c), `categoria sin declarar: ${c}`);
});

test('los nombres de nivel del banco coinciden con los del juego (config.ts)', () => {
  const nombres = [1, 2, 3, 4, 5].map((n) => BANCO.niveles[String(n)]);
  assert.deepEqual(
    nombres.map((n) => n?.split(' (')[0]),
    [...NOMBRE_NIVEL],
  );
});

test('el id empieza por el nivel de la pregunta (n3-07 es de nivel 3)', () => {
  for (const p of BANCO.preguntas) assert.equal(p.id.slice(0, 2), `n${p.nivel}`, p.id);
});

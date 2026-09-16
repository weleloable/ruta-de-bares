import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BIO_MAX,
  ETIQUETAS_MAX,
  alternarEtiqueta,
  describirErrorCana,
  estadoPestana,
  validarPresentacion,
} from './reglas.ts';

describe('validarPresentacion', () => {
  it('acepta una frase con espacios alrededor y sin etiquetas', () => {
    assert.deepEqual(validarPresentacion({ bio: '  Vengo por el vermut  ', etiquetas: [] }), []);
  });

  it('exige frase, como el servidor (BIO_REQUIRED)', () => {
    assert.equal(validarPresentacion({ bio: '   ', etiquetas: [] }).length, 1);
  });

  it(`cuenta el limite de ${BIO_MAX} sobre la frase recortada`, () => {
    assert.deepEqual(validarPresentacion({ bio: ` ${'x'.repeat(BIO_MAX)} `, etiquetas: [] }), []);
    assert.equal(validarPresentacion({ bio: 'x'.repeat(BIO_MAX + 1), etiquetas: [] }).length, 1);
  });

  it(`no deja mas de ${ETIQUETAS_MAX} etiquetas distintas`, () => {
    const seis = ['a', 'b', 'c', 'd', 'e', 'f'];
    assert.equal(validarPresentacion({ bio: 'Hola', etiquetas: seis }).length, 1);
    // Repetidas cuentan una vez, como el distinct del SQL.
    assert.deepEqual(validarPresentacion({ bio: 'Hola', etiquetas: ['a', 'a', 'b', 'c', 'd', 'e'] }), []);
  });
});

describe('alternarEtiqueta', () => {
  it('marca y desmarca sin mutar la seleccion', () => {
    const inicial = ['a'];
    assert.deepEqual(alternarEtiqueta(inicial, 'b'), ['a', 'b']);
    assert.deepEqual(alternarEtiqueta(inicial, 'a'), []);
    assert.deepEqual(inicial, ['a']);
  });

  it('con el maximo alcanzado no anade, pero si deja quitar', () => {
    const llena = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual(alternarEtiqueta(llena, 'f'), llena);
    assert.deepEqual(alternarEtiqueta(llena, 'c'), ['a', 'b', 'd', 'e']);
  });
});

describe('estadoPestana', () => {
  const perfil = (is_active: boolean, adult_confirmed: boolean, has_activated_before: boolean) => ({
    is_active,
    adult_confirmed,
    has_activated_before,
  });

  it('sin ruta no hay nada que activar, aunque este activado', () => {
    assert.deepEqual(estadoPestana(false, perfil(true, true, true)), { tipo: 'sin-ruta' });
  });

  it('la primera vez pide mayoria de edad y presentacion', () => {
    assert.deepEqual(estadoPestana(true, null), { tipo: 'desactivado', primeraVez: true, pideMayoriaDeEdad: true });
    assert.deepEqual(estadoPestana(true, perfil(false, false, false)), {
      tipo: 'desactivado',
      primeraVez: true,
      pideMayoriaDeEdad: true,
    });
  });

  it('tras pausar no vuelve a pedir nada (D8)', () => {
    assert.deepEqual(estadoPestana(true, perfil(false, true, true)), {
      tipo: 'desactivado',
      primeraVez: false,
      pideMayoriaDeEdad: false,
    });
    assert.deepEqual(estadoPestana(true, perfil(true, true, true)), { tipo: 'activado' });
  });
});

describe('describirErrorCana', () => {
  it('traduce los codigos del SQL aunque lleguen con prefijo', () => {
    assert.equal(describirErrorCana('BUZZ_TOO_SOON'), 'Espera un poco antes de otro zumbido.');
    assert.equal(describirErrorCana('ERROR: P0001: TEXT_LIMIT_REACHED'), 'Ya has enviado tus dos mensajes.');
  });

  it('no confunde un codigo con otro que lo contiene', () => {
    assert.equal(describirErrorCana('TEXT_LOCKED'), 'Podréis escribir cuando se acepte la cerveza.');
    assert.notEqual(describirErrorCana('QUESTION_ALREADY_ANSWERED'), describirErrorCana('QUESTION_ALREADY_PENDING'));
  });

  it('deja pasar lo que no es un codigo', () => {
    assert.equal(describirErrorCana('Failed to fetch'), 'Failed to fetch');
  });
});

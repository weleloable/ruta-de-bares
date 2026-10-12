import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describirErrorSorteo, pasosRuleta, textoBanner, type EstadoSorteo } from './sorteo.ts';

const base: EstadoSorteo = { activo: true, premio: 'una camiseta', bares: 8, participantes: 3, dentro: false, resultado: null };

describe('sorteo', () => {
  it('sin sorteo en la ruta, no hay banner', () => {
    assert.equal(textoBanner({ ...base, activo: false }), null);
  });

  it('antes de sortear: como se entra, y si ya estas dentro', () => {
    assert.deepEqual(textoBanner(base), {
      icono: '🎽',
      titulo: 'Sorteamos una camiseta',
      cuerpo: 'Entre todas las personas que sellen los 8 bares de la ruta.',
      destacado: false,
    });
    const dentro = textoBanner({ ...base, dentro: true });
    assert.equal(dentro?.destacado, true);
    assert.match(dentro!.cuerpo, /¡Ya estás dentro! Has sellado los 8 bares\. Sois 3 en el sorteo\./);
    assert.match(textoBanner({ ...base, premio: '  ' })!.titulo, /un premio/);
  });

  it('despues: quien ha ganado (lo ve toda la ruta), o "has ganado" si eres tu', () => {
    const resultado = { premio: 'una camiseta', ganador: 'Ana', soy_ganador: false, suplentes: ['Bea', 'Carla'], participantes: 12, realizado_at: '' };
    assert.equal(textoBanner({ ...base, resultado })!.cuerpo, 'Ha ganado Ana (suplentes: Bea, Carla). Entre 12 participantes.');
    const yo = textoBanner({ ...base, resultado: { ...resultado, soy_ganador: true } });
    assert.equal(yo?.titulo, '¡Has ganado el sorteo!');
    assert.equal(yo?.destacado, true);
    // El resultado se ensena aunque luego se desactive el sorteo.
    assert.ok(textoBanner({ ...base, activo: false, resultado }));
  });

  it('quien pidio no participar lo ve, aunque haya sellado todo', () => {
    const t = textoBanner({ ...base, dentro: false, excluido: true });
    assert.match(t!.cuerpo, /no participas en este sorteo/);
    assert.equal(t!.destacado, false);
  });

  it('la ruleta frena y se para SIEMPRE en el ganador, sin repetir nombre seguido', () => {
    let s = 7;
    const azar = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const pasos = pasosRuleta(['Ana', 'Bea', 'Carla'], 'Bea', azar);
    assert.equal(pasos.at(-1)?.nombre, 'Bea');
    for (let i = 1; i < pasos.length - 1; i++) {
      assert.ok(pasos[i]!.ms >= pasos[i - 1]!.ms, 'cada vez mas despacio');
      assert.notEqual(pasos[i]!.nombre, pasos[i - 1]!.nombre);
    }
    assert.equal(pasosRuleta([], 'Ana', azar).at(-1)?.nombre, 'Ana');
  });

  it('errores en castellano', () => {
    assert.match(describirErrorSorteo('ERROR: ALREADY_DRAWN'), /ya está hecho/);
    assert.match(describirErrorSorteo('NO_PARTICIPANTS'), /nadie ha sellado/);
    assert.match(describirErrorSorteo('PGRST202'), /0061/);
  });
});

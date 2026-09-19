import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { etiquetaBotonPerfil, hayNotificaciones, totalNotificaciones } from './reglas.ts';

const NADA = { cana: 0, avisos: 0, alertas: 0 };

describe('totalNotificaciones', () => {
  it('sin nada, cero', () => {
    assert.equal(totalNotificaciones(NADA), 0);
  });

  it('suma las tres fuentes', () => {
    assert.equal(totalNotificaciones({ cana: 2, avisos: 1, alertas: 4 }), 7);
  });

  it('cada fuente cuenta por si sola', () => {
    assert.equal(totalNotificaciones({ ...NADA, cana: 1 }), 1);
    assert.equal(totalNotificaciones({ ...NADA, avisos: 1 }), 1);
    assert.equal(totalNotificaciones({ ...NADA, alertas: 1 }), 1);
  });

  it('un contador roto (NaN, infinito, negativo) cuenta como 0: un punto falso no se apaga solo', () => {
    assert.equal(totalNotificaciones({ cana: Number.NaN, avisos: Infinity, alertas: -3 }), 0);
    // Y no arrastra a las buenas.
    assert.equal(totalNotificaciones({ cana: Number.NaN, avisos: 2, alertas: -1 }), 2);
  });

  it('un decimal se redondea hacia abajo', () => {
    assert.equal(totalNotificaciones({ ...NADA, cana: 2.9 }), 2);
    assert.equal(totalNotificaciones({ ...NADA, cana: 0.9 }), 0);
  });
});

describe('hayNotificaciones', () => {
  it('es lo que enciende el punto rojo: cualquier fuente basta, ninguna lo apaga', () => {
    assert.equal(hayNotificaciones(NADA), false);
    assert.equal(hayNotificaciones({ ...NADA, cana: 1 }), true);
    assert.equal(hayNotificaciones({ ...NADA, avisos: 3 }), true);
    assert.equal(hayNotificaciones({ ...NADA, alertas: 1 }), true);
    assert.equal(hayNotificaciones({ cana: 0, avisos: 0, alertas: Number.NaN }), false);
  });
});

describe('etiquetaBotonPerfil', () => {
  it('sin notificaciones, el nombre de siempre', () => {
    assert.equal(etiquetaBotonPerfil(NADA), 'Mi perfil');
  });

  it('con notificaciones, se las dice al lector de pantalla (el punto es solo visual)', () => {
    assert.equal(etiquetaBotonPerfil({ ...NADA, avisos: 1 }), 'Mi perfil, 1 notificación');
    assert.equal(etiquetaBotonPerfil({ cana: 1, avisos: 1, alertas: 1 }), 'Mi perfil, 3 notificaciones');
  });

  it('el nombre sigue empezando por "Mi perfil": quien lo busca por voz lo encuentra igual', () => {
    for (const f of [NADA, { ...NADA, cana: 5 }]) assert.ok(etiquetaBotonPerfil(f).startsWith('Mi perfil'));
  });
});

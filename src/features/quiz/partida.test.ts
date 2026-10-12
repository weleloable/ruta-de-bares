import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { azarConSemilla } from './azar.ts';
import { BANCO } from './banco.ts';
import { CONFIG } from './config.ts';
import {
  elegirPregunta,
  generarVoto,
  nuevaPartida,
  PUNTOS_MAXIMOS,
  reducir,
} from './partida.ts';
import type { Accion, EstadoPartida, Nivel } from './tipos.ts';

const ctx = (semilla: number) => ({ banco: BANCO, azar: azarConSemilla(semilla), config: CONFIG });

/** Aplica acciones en orden con el mismo generador. */
function jugar(e: EstadoPartida, acciones: Accion[], semilla = 1): EstadoPartida {
  const c = ctx(semilla);
  return acciones.reduce((acc, a) => reducir(acc, a, c), e);
}

const indiceCorrecta = (e: EstadoPartida) => e.opciones.findIndex((o) => o.correcta);
const indiceIncorrecta = (e: EstadoPartida) => e.opciones.findIndex((o) => !o.correcta);

/** Responde la pregunta actual (bien o mal) hasta verla revelada. */
function responder(e: EstadoPartida, bien: boolean, semilla = 5): EstadoPartida {
  const opcion = bien ? indiceCorrecta(e) : indiceIncorrecta(e);
  return jugar(e, [{ tipo: 'elegir', opcion }, { tipo: 'confirmar' }, { tipo: 'revelar' }], semilla);
}

/** Acierta `n` preguntas seguidas y deja la siguiente lista para responder. */
function llegarA(n: number, semilla = 3): EstadoPartida {
  const c = ctx(semilla);
  let e = nuevaPartida(BANCO, [], c.azar);
  for (let i = 0; i < n; i++) {
    e = reducir(responder(e, true), { tipo: 'siguiente' }, c);
  }
  return e;
}

describe('una pregunta por nivel, en orden', () => {
  it('cada partida recorre los niveles 1 a 5 y gana al acertar las 5', () => {
    for (let semilla = 1; semilla <= 50; semilla++) {
      const c = ctx(semilla);
      let e = nuevaPartida(BANCO, [], c.azar);
      const niveles: number[] = [];
      for (let i = 0; i < 5; i++) {
        niveles.push(e.pregunta.nivel);
        e = reducir(responder(e, true, semilla), { tipo: 'siguiente' }, c);
      }
      assert.deepEqual(niveles, [1, 2, 3, 4, 5], `semilla ${semilla}`);
      assert.equal(e.fase, 'fin');
      assert.equal(e.desenlace, 'gano');
      assert.equal(e.puntos, PUNTOS_MAXIMOS);
    }
  });

  it('las 4 opciones llevan exactamente una correcta y se barajan entre partidas', () => {
    const posiciones = new Set<number>();
    for (let semilla = 1; semilla <= 60; semilla++) {
      const e = nuevaPartida(BANCO, [], azarConSemilla(semilla));
      assert.equal(e.opciones.length, 4);
      assert.equal(e.opciones.filter((o) => o.correcta).length, 1);
      assert.equal(e.opciones[indiceCorrecta(e)].texto, e.pregunta.correcta);
      posiciones.add(indiceCorrecta(e));
    }
    assert.equal(posiciones.size, 4, 'la correcta no cae siempre en la misma letra');
  });

  it('mismo azar, misma partida (determinista)', () => {
    const a = nuevaPartida(BANCO, [], azarConSemilla(42));
    const b = nuevaPartida(BANCO, [], azarConSemilla(42));
    assert.deepEqual(a, b);
  });
});

describe('preguntas ya vistas', () => {
  it('no repite una pregunta vista mientras queden sin ver en su nivel', () => {
    const delNivel1 = BANCO.preguntas.filter((p) => p.nivel === 1).map((p) => p.id);
    const vistas = delNivel1.slice(1); // solo queda libre la primera
    for (let semilla = 1; semilla <= 20; semilla++) {
      const { pregunta } = elegirPregunta(BANCO, 1, vistas, azarConSemilla(semilla));
      assert.equal(pregunta.id, delNivel1[0]);
    }
  });

  it('agotado un nivel, empieza otra vuelta SOLO de ese nivel y conserva los demas', () => {
    const todasNivel1 = BANCO.preguntas.filter((p) => p.nivel === 1).map((p) => p.id);
    const vistas = [...todasNivel1, 'n2-01'];
    const r = elegirPregunta(BANCO, 1, vistas, azarConSemilla(1));
    assert.ok(todasNivel1.includes(r.pregunta.id));
    assert.deepEqual(r.vistas.sort(), [r.pregunta.id, 'n2-01'].sort());
  });

  it('la partida devuelve en `vistas` las que ha ensenado, sin duplicados', () => {
    const e = llegarA(5);
    assert.equal(e.vistas.length, 5);
    assert.equal(new Set(e.vistas).size, 5);
  });
});

describe('50:50', () => {
  it('quita exactamente dos incorrectas y nunca la correcta', () => {
    for (let semilla = 1; semilla <= 200; semilla++) {
      const e = jugar(nuevaPartida(BANCO, [], azarConSemilla(semilla)), [{ tipo: 'comodin', comodin: 'cincuenta' }], semilla);
      assert.equal(e.eliminadas.length, 2);
      assert.ok(!e.eliminadas.includes(indiceCorrecta(e)), `semilla ${semilla}`);
      assert.equal(e.usados.cincuenta, true);
    }
  });

  it('quita tambien la marca si la opcion elegida era una de las eliminadas', () => {
    for (let semilla = 1; semilla <= 50; semilla++) {
      let e = nuevaPartida(BANCO, [], azarConSemilla(semilla));
      e = reducir(e, { tipo: 'elegir', opcion: indiceIncorrecta(e) }, ctx(semilla));
      const marcada = e.seleccion;
      e = reducir(e, { tipo: 'comodin', comodin: 'cincuenta' }, ctx(semilla));
      if (e.eliminadas.includes(marcada as number)) assert.equal(e.seleccion, null);
    }
  });

  it('no deja marcar una opcion eliminada ni usarlo dos veces', () => {
    let e = jugar(nuevaPartida(BANCO, [], azarConSemilla(7)), [{ tipo: 'comodin', comodin: 'cincuenta' }], 7);
    const quitada = e.eliminadas[0];
    assert.equal(reducir(e, { tipo: 'elegir', opcion: quitada }, ctx(7)).seleccion, null);
    const otra = reducir(e, { tipo: 'comodin', comodin: 'cincuenta' }, ctx(8));
    assert.equal(otra, e, 'segundo uso: mismo estado');
    e = jugar(e, [{ tipo: 'elegir', opcion: indiceCorrecta(e) }]);
    assert.equal(e.seleccion, indiceCorrecta(e));
  });
});

describe('el voto del bar', () => {
  it('suma 100, no pone votos a las eliminadas y el lider es estrictamente el mas votado', () => {
    for (let semilla = 1; semilla <= 300; semilla++) {
      const e = nuevaPartida(BANCO, [], azarConSemilla(semilla));
      const voto = generarVoto(e.opciones, [], 1, azarConSemilla(semilla), CONFIG);
      assert.equal(voto.reduce((a, b) => a + b, 0), 100, `semilla ${semilla}`);
      const max = Math.max(...voto);
      assert.equal(voto.filter((v) => v === max).length, 1, `empate arriba, semilla ${semilla}`);
    }
  });

  it('despues del 50:50 reparte solo entre las dos que quedan y sigue sumando 100', () => {
    for (let semilla = 1; semilla <= 300; semilla++) {
      let e = nuevaPartida(BANCO, [], azarConSemilla(semilla));
      e = jugar(e, [{ tipo: 'comodin', comodin: 'cincuenta' }, { tipo: 'comodin', comodin: 'voto' }], semilla);
      const voto = e.voto as number[];
      assert.equal(voto.reduce((a, b) => a + b, 0), 100);
      for (const i of e.eliminadas) assert.equal(voto[i], 0);
      assert.equal(voto.filter((v) => v > 0).length, 2);
      assert.notEqual(voto[0] + voto[1] + voto[2] + voto[3], 0);
    }
  });

  it('si el voto se usa y luego se pide el 50:50, se recalcula sobre las dos que quedan', () => {
    for (let semilla = 1; semilla <= 100; semilla++) {
      let e = nuevaPartida(BANCO, [], azarConSemilla(semilla));
      e = jugar(e, [{ tipo: 'comodin', comodin: 'voto' }, { tipo: 'comodin', comodin: 'cincuenta' }], semilla);
      const voto = e.voto as number[];
      assert.equal(voto.reduce((a, b) => a + b, 0), 100);
      for (const i of e.eliminadas) assert.equal(voto[i], 0);
    }
  });

  it('la correcta es la mas votada con la probabilidad del nivel (90 % en 1, 55 % en 5), no siempre', () => {
    const N = 4000;
    for (const nivel of [1, 2, 3, 4, 5] as Nivel[]) {
      const azar = azarConSemilla(100 + nivel);
      const e = nuevaPartida(BANCO, [], azarConSemilla(9));
      let aciertos = 0;
      for (let i = 0; i < N; i++) {
        const voto = generarVoto(e.opciones, [], nivel, azar, CONFIG);
        if (voto.indexOf(Math.max(...voto)) === indiceCorrecta(e)) aciertos++;
      }
      const esperado = CONFIG.probVotoCorrecta[nivel - 1];
      assert.ok(Math.abs(aciertos / N - esperado) < 0.03, `nivel ${nivel}: ${aciertos / N} vs ${esperado}`);
    }
    assert.equal(CONFIG.probVotoCorrecta[0], 0.9);
    assert.equal(CONFIG.probVotoCorrecta[4], 0.55);
  });
});

describe('cambio de ronda', () => {
  it('da otra pregunta del mismo nivel, sin marcas ni eliminadas, y gasta el comodin', () => {
    for (let semilla = 1; semilla <= 100; semilla++) {
      let e = nuevaPartida(BANCO, [], azarConSemilla(semilla));
      const antes = e.pregunta;
      e = jugar(
        e,
        [{ tipo: 'comodin', comodin: 'cincuenta' }, { tipo: 'elegir', opcion: 0 }, { tipo: 'comodin', comodin: 'cambio' }],
        semilla,
      );
      assert.notEqual(e.pregunta.id, antes.id);
      assert.equal(e.pregunta.nivel, antes.nivel);
      assert.equal(e.indice, 0);
      assert.deepEqual(e.eliminadas, []);
      assert.equal(e.seleccion, null);
      assert.equal(e.voto, null);
      assert.equal(e.usados.cambio, true);
      assert.equal(e.usados.cincuenta, true, 'los comodines gastados siguen gastados');
    }
  });

  it('funciona aunque ya se hayan visto todas las demas del nivel', () => {
    const todas = BANCO.preguntas.filter((p) => p.nivel === 1).map((p) => p.id);
    const e = nuevaPartida(BANCO, todas.slice(1), azarConSemilla(3));
    const cambiado = reducir(e, { tipo: 'comodin', comodin: 'cambio' }, ctx(3));
    assert.notEqual(cambiado.pregunta.id, e.pregunta.id);
    assert.equal(cambiado.pregunta.nivel, 1);
  });
});

describe('puntuacion: un punto por acierto (0061)', () => {
  it('ganar da 5; fallar en la pregunta N da los N-1 aciertos que llevabas', () => {
    assert.equal(PUNTOS_MAXIMOS, 5);
    for (const aciertos of [0, 1, 2, 3, 4]) {
      const e = reducir(responder(llegarA(aciertos), false), { tipo: 'siguiente' }, ctx(1));
      assert.equal(e.fase, 'fin');
      assert.equal(e.desenlace, 'fallo');
      assert.equal(e.puntos, aciertos, `fallo en la pregunta ${aciertos + 1}`);
    }
  });

  it('ya no se puede plantar: la accion no existe', () => {
    const e = llegarA(2);
    assert.equal(reducir(e, { tipo: 'plantarse' } as unknown as Accion, ctx(1)), e);
  });
});

describe('tiempo que desempata', () => {
  const ms = (e: EstadoPartida) => e.ms;

  it('suma lo tardado en cada pregunta al confirmar, acotado al reloj', () => {
    const c = ctx(4);
    let e = nuevaPartida(BANCO, [], c.azar);
    assert.equal(ms(e), 0);
    e = jugar(e, [{ tipo: 'elegir', opcion: indiceCorrecta(e) }, { tipo: 'confirmar', ms: 4200 }, { tipo: 'revelar' }, { tipo: 'siguiente' }], 4);
    e = jugar(e, [{ tipo: 'elegir', opcion: indiceCorrecta(e) }, { tipo: 'confirmar', ms: 99999 }, { tipo: 'revelar' }], 4);
    assert.equal(ms(e), 4200 + CONFIG.segundos * 1000, 'nunca mas que el reloj de la pregunta');
    e = reducir(e, { tipo: 'siguiente' }, c);
    assert.equal(ms(e), 4200 + CONFIG.segundos * 1000, 'pasar de pregunta no lo pierde');
  });

  it('sin contestar a tiempo cuenta la pregunta entera; el cambio de ronda no regala lo tardado', () => {
    let e = reducir(llegarA(0), { tipo: 'tiempoAgotado' }, ctx(1));
    assert.equal(ms(e), CONFIG.segundos * 1000);
    e = reducir(llegarA(0), { tipo: 'comodin', comodin: 'cambio', ms: 7000 }, ctx(1));
    assert.equal(ms(e), 7000);
    e = jugar(e, [{ tipo: 'elegir', opcion: 0 }, { tipo: 'confirmar', ms: 3000 }]);
    assert.equal(ms(e), 10000);
  });

  it('un tiempo raro (negativo, no numero) cuenta como 0', () => {
    let e = llegarA(0);
    e = jugar(e, [{ tipo: 'elegir', opcion: 0 }, { tipo: 'confirmar', ms: -500 }]);
    assert.equal(ms(e), 0);
  });
});

describe('tiempo agotado', () => {
  it('cuenta como fallo: revela sin respuesta y da los aciertos que llevabas', () => {
    for (const [aciertos, puntos] of [[0, 0], [1, 1], [2, 2], [4, 4]] as const) {
      let e = reducir(llegarA(aciertos), { tipo: 'tiempoAgotado' }, ctx(1));
      assert.equal(e.fase, 'revelada');
      assert.equal(e.acierto, false);
      assert.equal(e.causaFallo, 'tiempo');
      assert.equal(e.seleccion, null);
      e = reducir(e, { tipo: 'siguiente' }, ctx(1));
      assert.equal(e.desenlace, 'tiempo');
      assert.equal(e.puntos, puntos);
    }
  });

  it('se pierde aunque hubiera una opcion marcada sin confirmar', () => {
    let e = llegarA(0);
    e = jugar(e, [{ tipo: 'elegir', opcion: indiceCorrecta(e) }, { tipo: 'tiempoAgotado' }]);
    assert.equal(e.acierto, false);
    assert.equal(e.seleccion, null);
  });

  it('una vez confirmada la respuesta, el reloj ya no la tumba', () => {
    let e = llegarA(0);
    e = jugar(e, [{ tipo: 'elegir', opcion: indiceCorrecta(e) }, { tipo: 'confirmar' }]);
    assert.equal(reducir(e, { tipo: 'tiempoAgotado' }, ctx(1)), e);
  });
});

describe('confirmacion y fases', () => {
  it('se puede cambiar de opcion hasta confirmar; sin opcion no se confirma', () => {
    let e = llegarA(0);
    assert.equal(reducir(e, { tipo: 'confirmar' }, ctx(1)), e);
    e = jugar(e, [{ tipo: 'elegir', opcion: 0 }, { tipo: 'elegir', opcion: 2 }]);
    assert.equal(e.seleccion, 2);
    e = reducir(e, { tipo: 'confirmar' }, ctx(1));
    assert.equal(e.fase, 'suspense');
    assert.equal(reducir(e, { tipo: 'elegir', opcion: 1 }, ctx(1)).seleccion, 2, 'confirmada: ya no cambia');
  });

  it('revelar marca acierto o fallo segun la opcion elegida', () => {
    const bien = responder(llegarA(0), true);
    assert.equal(bien.acierto, true);
    assert.equal(bien.causaFallo, null);
    const mal = responder(llegarA(0), false);
    assert.equal(mal.acierto, false);
    assert.equal(mal.causaFallo, 'fallo');
  });

  it('los comodines solo se usan respondiendo y cada uno una vez por partida', () => {
    let e = llegarA(0);
    e = jugar(e, [{ tipo: 'elegir', opcion: 0 }, { tipo: 'confirmar' }]);
    assert.equal(reducir(e, { tipo: 'comodin', comodin: 'voto' }, ctx(1)), e);
    const c = ctx(2);
    let f = nuevaPartida(BANCO, [], c.azar);
    f = reducir(f, { tipo: 'comodin', comodin: 'voto' }, c);
    assert.equal(reducir(f, { tipo: 'comodin', comodin: 'voto' }, c), f);
  });

  it('una accion fuera de fase no cambia nada ni lanza', () => {
    const e = llegarA(0);
    for (const a of [{ tipo: 'revelar' }, { tipo: 'siguiente' }] as Accion[]) {
      assert.equal(reducir(e, a, ctx(1)), e);
    }
    const fin = reducir(responder(e, false), { tipo: 'siguiente' }, ctx(1));
    for (const a of [{ tipo: 'elegir', opcion: 0 }, { tipo: 'confirmar' }, { tipo: 'tiempoAgotado' }, { tipo: 'siguiente' }] as Accion[]) {
      assert.equal(reducir(fin, a, ctx(1)), fin);
    }
  });
});

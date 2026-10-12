import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALTURA_SALIDA,
  avanzarVuelo,
  CABEZA,
  choque,
  crearPartida,
  DIANAS,
  dianaFavorita,
  ficha,
  GENEROSIDAD,
  GRAVEDAD,
  lanzar,
  MULTIPLICADORES,
  paso,
  PASO,
  PARED,
  posicionDiana,
  previsualizar,
  PUNTUACION_MAXIMA,
  puntosAcierto,
  RADIO_CHAPA,
  registrarTiro,
  simular,
  terminada,
  TIRO_MOVIMIENTO,
  TIRO_VIENTO,
  TIROS,
  totalAciertos,
  velocidadDesdeArrastre,
  VELOCIDAD_MAXIMA,
  VIENTO_MAXIMO,
  type IdDiana,
  type Partida,
  type Resultado,
  type Vuelo,
} from './modelo.ts';

const vaso = ficha('vaso');

/** Vuela a `fps` fotogramas por segundo, como lo haria la pantalla. */
function volarA(p: Partida, vx: number, vy: number, fps: number): Vuelo {
  let v = lanzar(p, vx, vy, 0);
  for (let i = 0; i < fps * 10 && !v.resultado; i++) v = avanzarVuelo(v, p.dianas, 1 / fps);
  return v;
}

/**
 * Busca una velocidad que meta la chapa limpia en una diana quieta: angulo fijo
 * de 50 grados y la velocidad que la hace caer en el centro de la boca, sin viento.
 */
function tiroLimpio(p: Partida, id: IdDiana, angulo = 50): { vx: number; vy: number } {
  const d = p.dianas.find((x) => x.id === id)!;
  const f = ficha(id);
  const a = (angulo * Math.PI) / 180;
  const dy = f.alturaBoca - ALTURA_SALIDA;
  // x = v cos a t ; y = v sin a t - g t^2 / 2 = dy  ->  v^2 = g x^2 / (2 cos^2 a (x tan a - dy))
  const v = Math.sqrt((GRAVEDAD * d.x * d.x) / (2 * Math.cos(a) ** 2 * (d.x * Math.tan(a) - dy)));
  return { vx: v * Math.cos(a), vy: v * Math.sin(a) };
}

describe('fisica a pasos fijos', () => {
  it('el mismo lanzamiento da el mismo resultado a 30, 60 y 144 fps', () => {
    const p = crearPartida(7);
    for (const [vx, vy] of [
      [3, 3],
      [4.2, 2.5],
      [2.1, 4.4],
      [5, 4],
      [...Object.values(tiroLimpio(p, 'jarra'))],
    ] as [number, number][]) {
      const a = volarA(p, vx, vy, 30);
      const b = volarA(p, vx, vy, 60);
      const c = volarA(p, vx, vy, 144);
      assert.deepEqual(a.resultado, b.resultado, `${vx},${vy}`);
      assert.deepEqual(b.resultado, c.resultado, `${vx},${vy}`);
      // Y no solo el resultado: el punto donde acaba, al milimetro.
      assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(b.x - c.x) < 1e-9);
      assert.deepEqual(b.resultado, simular(p, vx, vy).resultado);
    }
  });

  it('un fotograma enorme (pestana dormida) no salta pasos: acaba igual', () => {
    const p = crearPartida(3);
    const { vx, vy } = tiroLimpio(p, 'vaso');
    let v = lanzar(p, vx, vy, 0);
    v = avanzarVuelo(v, p.dianas, 5);
    assert.deepEqual(v.resultado, simular(p, vx, vy).resultado);
  });

  it('un vuelo siempre termina', () => {
    const p = crearPartida(1);
    for (const [vx, vy] of [[0, 0], [0.1, 7.5], [-7.5, 0], [7.5, 0], [0, -3]]) {
      assert.ok(simular(p, vx, vy).resultado);
    }
  });
});

describe('colarse por la boca', () => {
  const cx = 1.2;
  const yb = vaso.alturaBoca;
  const mitad = vaso.boca / 2;

  it('un tiro que entra limpio por el centro cuenta', () => {
    assert.equal(choque(vaso, cx, cx, yb + 0.05, cx, yb - 0.01), 'dentro');
  });

  it('se perdona: una chapa que muerde el borde por dentro o por poco fuera de la boca cuenta', () => {
    // Antes hacia falta la chapa ENTERA dentro y esto salia "ha tocado el borde".
    for (const lejos of [mitad - RADIO_CHAPA + 0.002, mitad, mitad + 0.01, vaso.ancho / 2 - 0.001]) {
      for (const signo of [-1, 1]) {
        const x = cx + signo * lejos;
        assert.equal(choque(vaso, cx, x, yb + 0.05, x, yb - 0.01), 'dentro', `a ${signo * lejos} del centro`);
      }
    }
    // La generosidad llega mas alla de la boca dibujada: hay un colchon de verdad.
    assert.ok(GENEROSIDAD >= 0.03);
  });

  it('un tiro que cae sobre el vidrio o rozandolo por fuera NO cuenta (rebota)', () => {
    const cuerpo = vaso.ancho / 2;
    for (const lejos of [cuerpo + 0.002, cuerpo + RADIO_CHAPA - 0.002]) {
      const x = cx + lejos;
      assert.equal(choque(vaso, cx, x, yb + 0.05, x, yb - 0.01), 'borde', `a ${lejos} del centro`);
    }
    // Y mas alla de eso, ni lo toca.
    const lejos = cx + cuerpo + RADIO_CHAPA + 0.01;
    assert.equal(choque(vaso, cx, lejos, yb + 0.05, lejos, yb - 0.01), null);
  });

  it('en la boca de la oreja, que no tiene cuerpo, tambien se perdona y mas alla no pasa nada', () => {
    const oreja = ficha('oreja');
    const y = oreja.alturaBoca;
    assert.equal(choque(oreja, 2.5, 2.5 + oreja.boca / 2 + 0.02, y + 0.05, 2.5 + oreja.boca / 2 + 0.02, y - 0.01), 'dentro');
    assert.equal(choque(oreja, 2.5, 2.5 + oreja.boca / 2 + 0.06, y + 0.05, 2.5 + oreja.boca / 2 + 0.06, y - 0.01), null);
  });

  it('tocar el vaso por el lado no cuenta, aunque luego quede dentro del ancho', () => {
    const lado = cx - mitad - PARED;
    assert.equal(choque(vaso, cx, lado - 0.1, yb - 0.05, lado, yb - 0.05), 'borde');
  });

  it('subiendo por dentro de la boca no cuenta: hay que caer en ella', () => {
    assert.equal(choque(vaso, cx, cx, yb - 0.01, cx, yb + 0.05), null);
  });

  it('un paso largo que cruza la boca no se la salta (interpola el corte)', () => {
    assert.equal(choque(vaso, cx, cx - 0.2, yb + 0.5, cx + 0.2, yb - 0.5), 'dentro');
  });

  it('pasar por encima de lejos no toca nada', () => {
    assert.equal(choque(vaso, cx, cx + 0.5, yb + 0.05, cx + 0.5, yb - 0.01), null);
  });

  it('en la caja, caer en las chapas de los botellines de los lados es borde', () => {
    const caja = ficha('caja');
    const x = 3 + (caja.boca / 2 + caja.ancho / 2) / 2;
    assert.equal(choque(caja, 3, x, caja.alturaBoca + 0.05, x, caja.alturaBoca - 0.01), 'borde');
    assert.equal(choque(caja, 3, 3, caja.alturaBoca + 0.05, 3, caja.alturaBoca - 0.01), 'dentro');
  });

  it('la oreja no tiene cuerpo: rozarla no rebota, solo no cuenta', () => {
    const oreja = ficha('oreja');
    const x = 2.5 + oreja.boca / 2 + GENEROSIDAD + 0.01;
    assert.equal(choque(oreja, 2.5, x, oreja.alturaBoca + 0.05, x, oreja.alturaBoca - 0.01), null);
    assert.equal(choque(oreja, 2.5, 2.5, 0.5, 2.5, 0.4), null);
  });
});

describe('con una parabola de verdad', () => {
  it('cada diana se puede colar sin viento, y por debajo de la velocidad maxima', () => {
    // El camarero se pasea y a veces tapa la parabola: con algun angulo y algun
    // momento de soltar, tiene que entrar. En 50 partidas distintas.
    for (let semilla = 0; semilla < 50; semilla++) {
      const p = crearPartida(semilla);
      for (const d of DIANAS) {
        if (d.id === 'oreja') continue; // se mueve siempre: aparte
        let entra = false;
        for (let ang = 35; ang <= 70 && !entra; ang += 5) {
          const { vx, vy } = tiroLimpio(p, d.id, ang);
          if (Math.hypot(vx, vy) > VELOCIDAD_MAXIMA) continue;
          for (let t = 0; t < 2.2 && !entra; t += 0.2) {
            const r = simular(p, vx, vy, t).resultado;
            entra = r?.tipo === 'dentro' && r.diana === d.id;
          }
        }
        assert.ok(entra, `${d.id} con la semilla ${semilla}`);
      }
    }
  });

  it('darle en la cabeza al camarero es fallo, y se dice', () => {
    const p = crearPartida(11);
    const oreja = p.dianas.find((d) => d.id === 'oreja')!;
    const f = ficha('oreja');
    // Un paso que cae justo sobre su cabeza (la oreja se mueve: se mira donde esta en t).
    const t = 0.5;
    const hx = posicionDiana(oreja, 1, t + PASO) + CABEZA.dx;
    const v: Vuelo = { ...lanzar(p, 0, 0, t), x: hx, y: f.alturaBoca + CABEZA.dy + CABEZA.r + 0.035, vx: 0, vy: -2 };
    assert.deepEqual(paso(v, p.dianas).resultado, { tipo: 'camarero' });
    let partida = registrarTiro(p, { tipo: 'dentro', diana: 'vaso' });
    partida = registrarTiro(partida, { tipo: 'camarero' });
    assert.equal(partida.racha, 0);
    assert.equal(partida.tiro, 2);
  });

  it('el punteado de apuntar sale de la catapulta y baja por la gravedad', () => {
    const pts = previsualizar(3, 3, 0.4, 8);
    assert.equal(pts.length, 8);
    assert.ok(pts[0]!.x > 0 && pts[0]!.y > ALTURA_SALIDA);
    assert.ok(pts.every((q, i) => i === 0 || q.x > pts[i - 1]!.x));
    assert.deepEqual(previsualizar(0, -5, 1, 10), [], 'hacia abajo: no pinta bajo la barra');
  });

  it('la oreja se puede colar si se lanza cuando pasa por su sitio', () => {
    for (const semilla of [1, 2, 3, 4, 5]) {
      const p = crearPartida(semilla);
      const oreja = p.dianas.find((d) => d.id === 'oreja')!;
      const { vx, vy } = tiroLimpio(p, 'oreja', 60);
      assert.ok(Math.hypot(vx, vy) <= VELOCIDAD_MAXIMA, `semilla ${semilla}: ${Math.hypot(vx, vy)} m/s`);
      // Barriendo el momento de soltar, en algun instante entra.
      let alguno = false;
      for (let t = 0; t < oreja.mov.periodo && !alguno; t += 0.01) {
        const r = simular(p, vx, vy, t).resultado;
        alguno = r?.tipo === 'dentro' && r.diana === 'oreja';
      }
      assert.ok(alguno, `semilla ${semilla}`);
    }
  });

  it('el mismo tiro, rozando el borde de la jarra, no cuenta', () => {
    const p = crearPartida(11);
    const { vx, vy } = tiroLimpio(p, 'jarra');
    // Mas fuerte poco a poco: pasa de dentro a borde antes de pasarse de largo.
    const vistos: string[] = [];
    for (let k = 1; k < 1.15; k += 0.002) {
      const r = simular(p, vx * k, vy * k).resultado!;
      const tipo = r.tipo === 'fuera' || r.tipo === 'camarero' ? r.tipo : `${r.tipo}:${r.diana}`;
      if (vistos.at(-1) !== tipo) vistos.push(tipo);
    }
    assert.equal(vistos[0], 'dentro:jarra');
    assert.equal(vistos[1], 'borde:jarra', vistos.join(' > '));
  });

  it('el viento desvia: el tiro limpio sin viento falla con el viento maximo', () => {
    const p = crearPartida(11);
    const { vx, vy } = tiroLimpio(p, 'caja');
    const conViento = { ...p, tiro: TIRO_VIENTO - 1, vientos: p.vientos.map(() => VIENTO_MAXIMO) };
    const v = simular(conViento, vx, vy);
    assert.notDeepEqual(v.resultado, { tipo: 'dentro', diana: 'caja' });
  });
});

describe('partida', () => {
  it('la misma semilla da las mismas dianas y vientos; otra semilla, otras', () => {
    assert.deepEqual(crearPartida(42), crearPartida(42));
    assert.notDeepEqual(crearPartida(42).dianas, crearPartida(43).dianas);
  });

  it('las dianas quedan cerca de su sitio, en orden, y la oreja entre 2,2 y 2,8', () => {
    for (let s = 0; s < 500; s++) {
      const p = crearPartida(s);
      for (const d of p.dianas) {
        const f = ficha(d.id);
        if (d.id === 'oreja') assert.ok(d.x >= 2.2 && d.x <= 2.8);
        else assert.ok(Math.abs(d.x - f.distancia) <= 0.15 + 1e-12);
      }
    }
  });

  it('sin viento los tres primeros tiros; desde el 4.o, viento que se nota y con tope', () => {
    for (let s = 0; s < 200; s++) {
      const p = crearPartida(s);
      p.vientos.forEach((w, i) => {
        if (i + 1 < TIRO_VIENTO) assert.equal(w, 0);
        else assert.ok(Math.abs(w) >= 0.4 && Math.abs(w) <= VIENTO_MAXIMO, `${w}`);
      });
    }
  });

  it('las dianas se quedan quietas hasta el tiro 7, salvo la oreja', () => {
    const p = crearPartida(5);
    for (const d of p.dianas) {
      for (let n = 1; n <= TIROS; n++) {
        const quieta = posicionDiana(d, n, 0.3) === posicionDiana(d, n, 1.1);
        assert.equal(quieta, d.id !== 'oreja' && n < TIRO_MOVIMIENTO, `${d.id} en el tiro ${n}`);
      }
    }
  });

  it('racha: x1, x1,5, x2, x2,5 y x3 de tope; fallar la corta', () => {
    let p = crearPartida(1);
    const dentro: Resultado = { tipo: 'dentro', diana: 'vaso' };
    const esperado = [10, 15, 20, 25, 30, 30];
    for (const e of esperado) {
      const antes = p.puntos;
      p = registrarTiro(p, dentro);
      assert.equal(p.puntos - antes, e);
    }
    p = registrarTiro(p, { tipo: 'borde', diana: 'jarra' });
    assert.equal(p.racha, 0);
    assert.equal(p.mejorRacha, 6);
    const antes = p.puntos;
    p = registrarTiro(p, dentro);
    assert.equal(p.puntos - antes, 10);
  });

  it('son 10 tiros y despues no se apunta nada mas', () => {
    let p = crearPartida(1);
    for (let i = 0; i < TIROS; i++) p = registrarTiro(p, { tipo: 'fuera' });
    assert.ok(terminada(p));
    assert.deepEqual(registrarTiro(p, { tipo: 'dentro', diana: 'oreja' }), p);
  });

  it('diana favorita: la de mas aciertos; a igualdad, la que mas vale', () => {
    let p = crearPartida(1);
    assert.equal(dianaFavorita(p), null);
    p = registrarTiro(p, { tipo: 'dentro', diana: 'vaso' });
    p = registrarTiro(p, { tipo: 'dentro', diana: 'vaso' });
    p = registrarTiro(p, { tipo: 'dentro', diana: 'caja' });
    assert.equal(dianaFavorita(p), 'vaso');
    p = registrarTiro(p, { tipo: 'dentro', diana: 'caja' });
    assert.equal(dianaFavorita(p), 'caja');
    assert.equal(totalAciertos(p), 4);
  });
});

describe('PUNTUACION_MAXIMA', () => {
  it('es 1250: 10 aciertos a la oreja con la racha a tope', () => {
    assert.equal(PUNTUACION_MAXIMA, 1250);
    let p = crearPartida(1);
    for (let i = 0; i < TIROS; i++) p = registrarTiro(p, { tipo: 'dentro', diana: 'oreja' });
    assert.equal(p.puntos, PUNTUACION_MAXIMA);
  });

  it('no se puede superar con NINGUNA secuencia de 10 resultados (programacion dinamica)', () => {
    // mejor[r] = lo maximo que se puede llevar con racha r tras k tiros.
    let mejor = new Map<number, number>([[0, 0]]);
    const opciones: (IdDiana | null)[] = [null, ...DIANAS.map((d) => d.id)];
    for (let k = 0; k < TIROS; k++) {
      const sig = new Map<number, number>();
      for (const [r, pts] of mejor) {
        for (const o of opciones) {
          const nr = o ? r + 1 : 0;
          const np = pts + (o ? puntosAcierto(o, nr) : 0);
          if ((sig.get(nr) ?? -1) < np) sig.set(nr, np);
        }
      }
      mejor = sig;
    }
    assert.equal(Math.max(...mejor.values()), PUNTUACION_MAXIMA);
  });

  it('cada acierto da puntos enteros', () => {
    for (const d of DIANAS) for (let r = 1; r <= 10; r++) assert.ok(Number.isInteger(puntosAcierto(d.id, r)));
    assert.equal(MULTIPLICADORES.at(-1), 30);
  });
});

describe('arrastre', () => {
  it('tirachinas: arrastrar abajo-izquierda lanza arriba-derecha', () => {
    const v = velocidadDesdeArrastre(-60, 60, 120);
    assert.ok(v.vx > 0 && v.vy > 0);
    assert.ok(Math.abs(v.fuerza - Math.hypot(60, 60) / 120) < 1e-12);
  });

  it('la fuerza tiene tope y un arrastre nulo no lanza', () => {
    const v = velocidadDesdeArrastre(-500, 500, 120);
    assert.equal(v.fuerza, 1);
    assert.ok(Math.abs(Math.hypot(v.vx, v.vy) - VELOCIDAD_MAXIMA) < 1e-9);
    assert.deepEqual(velocidadDesdeArrastre(0, 0, 120), { vx: 0, vy: 0, fuerza: 0 });
  });
});

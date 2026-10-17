import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  anguloBandeja,
  avanzar,
  BEBIDAS,
  bebidaMasDificil,
  bebidasTiradas,
  BOTELLA,
  crearAzar,
  crearRecorrido,
  curva,
  empuje,
  esquivasVisibles,
  fraccionSalvada,
  AVISO_ESQUIVA,
  AVISO_EMPUJON,
  notaPartida,
  nuevaRonda,
  PASO,
  puntosRonda,
  PUNTUACION_MAXIMA,
  RONDAS,
  TAU_GIRO_PULSO,
  UMBRAL_CURVA,
  type EstadoRonda,
  type Recorrido,
  type ResultadoRonda,
} from './modelo.ts';

/** Una ronda sin esquivas ni empujones: solo la fisica del derrame con el angulo que se le de. */
const quieta = (ronda: number): Recorrido => ({ ronda, esquivas: [], empujones: [] });
const correr = (e: EstadoRonda, rec: Recorrido, segundos: number, giro: (t: number) => number) => {
  const hasta = e.t + segundos;
  while (e.t < hasta - 1e-9 && !e.terminada) avanzar(e, rec, PASO, giro);
};

describe('el recorrido sale de la semilla', () => {
  it('misma semilla, mismo recorrido; semillas distintas, recorridos distintos', () => {
    for (let r = 0; r < 3; r++) {
      assert.deepEqual(crearRecorrido(r, 4242), crearRecorrido(r, 4242));
      const firmas = new Set<string>();
      for (let s = 1; s <= 50; s++) firmas.add(JSON.stringify(crearRecorrido(r, s * 1013)));
      assert.equal(firmas.size, 50, `ronda ${r + 1}: dos semillas dieron el mismo recorrido`);
    }
  });

  it('las esquivas y los empujones salen de flujos de azar DISTINTOS: tocar los empujones no mueve ni una esquiva', () => {
    for (let r = 1; r < 3; r++) {
      const normal = crearRecorrido(r, 777);
      const ronda = RONDAS[r] as { empujones: { n: number } };
      const n = ronda.empujones.n;
      ronda.empujones.n = 0;
      try {
        const sin = crearRecorrido(r, 777);
        assert.deepEqual(sin.esquivas, normal.esquivas);
        assert.equal(sin.empujones.length, 0);
      } finally {
        ronda.empujones.n = n;
      }
    }
  });

  it('un empujon no se predice mirando solo lo que se ve venir', () => {
    // Lo visible son las esquivas: la lista no lleva empujones, y entre la esquiva anterior y el empujon no hay
    // una distancia fija ni parecida (si la hubiera, bastaria contar tiempo desde la esquiva para anticiparse).
    const rec = crearRecorrido(2, 99);
    for (let t = 0; t < 35; t += 0.25) {
      for (const v of esquivasVisibles(rec, t)) assert.ok(rec.esquivas.includes(v), 'lo visible no es una esquiva');
    }
    const huecos: number[] = [];
    for (let s = 1; s <= 300; s++) {
      const r = crearRecorrido(2, s * 31);
      for (const e of r.empujones) {
        const anteriores = r.esquivas.filter((x) => x.t <= e.t).map((x) => e.t - x.t);
        huecos.push(anteriores.length ? Math.min(...anteriores) : 99);
      }
    }
    const cubos = new Map<number, number>();
    for (const h of huecos) cubos.set(Math.floor(h / 0.5), (cubos.get(Math.floor(h / 0.5)) ?? 0) + 1);
    assert.ok(Math.max(...cubos.values()) / huecos.length < 0.3, 'los empujones caen casi siempre a la misma distancia de una esquiva');
    assert.ok(Math.min(...huecos) < 0.5 && Math.max(...huecos) > 2, 'el hueco no varia lo bastante');
    assert.ok(AVISO_EMPUJON < 0.5 && AVISO_ESQUIVA >= 2, 'el empujon se ve de reojo; la esquiva con 2 s');
  });

  it('las esquivas empiezan despues de la cuenta atras y caben en la ronda; los empujones no se pisan', () => {
    for (let r = 0; r < 3; r++) {
      for (let s = 1; s <= 40; s++) {
        const rec = crearRecorrido(r, s);
        const { duracion } = RONDAS[r] as { duracion: number };
        assert.ok(rec.esquivas.every((e) => e.t >= 2.8 && e.t <= duracion - 1.8));
        for (let i = 1; i < rec.empujones.length; i++) {
          assert.ok((rec.empujones[i] as { t: number }).t - (rec.empujones[i - 1] as { t: number }).t >= 1.2);
        }
        assert.equal(rec.empujones.length, (RONDAS[r] as { empujones: { n: number } }).empujones.n, `ronda ${r + 1}: faltan empujones`);
      }
    }
  });
});

describe('el empuje del giro', () => {
  it('girar a un lado inclina la bandeja hacia el OTRO (y un empujon desde un lado, hacia el contrario)', () => {
    for (const lado of [1, -1] as const) {
      const rec: Recorrido = { ronda: 1, esquivas: [{ t: 3, lado, nitidez: 1 }], empujones: [{ t: 20, lado, grados: 8 }] };
      let maxEsquiva = 0;
      let maxEmpujon = 0;
      for (let t = 3; t < 6; t += 0.01) if (Math.abs(empuje(rec, t)) > Math.abs(maxEsquiva)) maxEsquiva = empuje(rec, t);
      for (let t = 20; t < 21; t += 0.01) if (Math.abs(empuje(rec, t)) > Math.abs(maxEmpujon)) maxEmpujon = empuje(rec, t);
      assert.equal(Math.sign(maxEsquiva), -lado);
      assert.equal(Math.sign(maxEmpujon), -lado);
    }
  });

  it('sube hasta un pico proporcional a lo brusca que es la esquiva y vuelve con un rebote amortiguado', () => {
    const una = (nitidez: number): Recorrido => ({ ronda: 1, esquivas: [{ t: 2, lado: 1, nitidez }], empujones: [] });
    const serie = (rec: Recorrido) => Array.from({ length: 1600 }, (_, i) => empuje(rec, 2 + i / 100));
    const fuerte = serie(una(1));
    const flojo = serie(una(0.5));
    const pico = (a: number[]) => Math.min(...a);
    assert.ok(Math.abs(pico(fuerte) / pico(flojo) - 2) < 1e-9, 'el pico es proporcional a la nitidez');
    assert.ok(Math.abs(pico(fuerte)) <= (RONDAS[1] as { empuje: number }).empuje + 1e-9, 'no pasa del empuje de la ronda');
    // Rebote: despues del pico negativo hay un tramo positivo (el chapoteo), mas pequeno, y se apaga.
    const rebote = Math.max(...fuerte);
    assert.ok(rebote > 0 && rebote < Math.abs(pico(fuerte)) * 0.5, `rebote ${rebote}`);
    assert.ok(Math.abs(fuerte.at(-1) as number) < 0.05 * Math.abs(pico(fuerte)), 'se apaga');
    assert.equal(empuje(una(1), 1.99), 0, 'nada antes del golpe');
  });

  it('el signo del movil: se suma al empuje, asi que inclinar el movil al lado contrario lo endereza', () => {
    assert.equal(anguloBandeja(10, -10), 0);
    assert.equal(anguloBandeja(-10, 10), 0);
    assert.equal(anguloBandeja(10, 0), 10);
  });
});

describe('el derrame', () => {
  it('con la bandeja a 0 grados todo el tiempo no se derrama nada, ni en la ronda mas dura', () => {
    for (let r = 0; r < 3; r++) {
      const rec = crearRecorrido(r, 5);
      const e = nuevaRonda(r);
      // El jugador perfecto cancela el empuje: angulo exacto 0.
      while (!e.terminada) avanzar(e, rec, 1 / 60, (t) => -empuje(rec, t));
      assert.ok(e.niveles.every((n) => n === 1), `ronda ${r + 1}: ${e.niveles}`);
      assert.equal(e.anguloMax, 0);
    }
  });

  it('por encima del umbral derrama, y mas cuanto mas angulo; copas antes que canas', () => {
    const nivelTras = (ronda: number, grados: number, segundos = 3) => {
      const e = nuevaRonda(ronda);
      correr(e, quieta(ronda), segundos, () => grados);
      return e.niveles;
    };
    // Bajo todos los umbrales (el menor es 5): nada.
    assert.ok(nivelTras(1, 4.9).every((n) => n === 1));
    // 12 grados: el cocktel (umbral 5) y el balon (7) pierden, la jarra (9) un poco, la cana (10) menos, el chupito (12) nada.
    const [chupito, cana, jarra, balon, cocktel] = nivelTras(1, 12) as [number, number, number, number, number];
    assert.equal(chupito, 1);
    assert.ok(cocktel < balon && balon < jarra && jarra < cana && cana < 1, `${[cocktel, balon, jarra, cana]}`);
    // Mas angulo, mas derrame (en la misma bebida).
    for (let i = 0; i < 5; i++) assert.ok((nivelTras(1, 20)[i] as number) <= (nivelTras(1, 15)[i] as number));
    assert.ok((nivelTras(1, 20)[4] as number) < (nivelTras(1, 15)[4] as number));
    // El orden de aguante de la tabla es el de los umbrales.
    assert.ok(BEBIDAS.cocktel.umbral < BEBIDAS.balon.umbral && BEBIDAS.balon.umbral < BEBIDAS.jarra.umbral);
    assert.ok(BEBIDAS.jarra.umbral < BEBIDAS.cana.umbral && BEBIDAS.cana.umbral < BEBIDAS.chupito.umbral);
  });

  it('el derrame es proporcional al exceso y al nivel que queda: exponencial exacto, sin depender del paso', () => {
    const e = nuevaRonda(0);
    correr(e, quieta(0), 2, () => 18); // balon: umbral 8, tasa 0,08 -> exceso 10
    const esperado = Math.exp(-BEBIDAS.balon.tasa * (18 - BEBIDAS.balon.umbral) * 2);
    assert.ok(Math.abs((e.niveles[3] as number) - esperado) < 1e-6, `${e.niveles[3]} vs ${esperado}`);
  });

  it('el derrame va hacia el lado en que esta inclinada la bandeja', () => {
    const der = nuevaRonda(0);
    correr(der, quieta(0), 1, () => 15);
    const izq = nuevaRonda(0);
    correr(izq, quieta(0), 1, () => -15);
    assert.equal(der.ladoDerrame[3], 1);
    assert.equal(izq.ladoDerrame[3], -1);
    assert.equal(der.niveles[3], izq.niveles[3]);
  });

  it('la botella casi no derrama pero se CAE pasado su umbral grande, y pierde todo su valor', () => {
    const botella = RONDAS[2]?.bebidas.indexOf('botella') as number;
    // 20 grados durante 3 s: derrama algo (umbral 25: no, aun no) y no se cae.
    const a = nuevaRonda(2);
    correr(a, quieta(2), 3, () => 20);
    assert.equal(a.niveles[botella], 1);
    // 28 grados (> 25, < 24+...): derrama muy poco, pero la caida es a los 24: se cae.
    const b = nuevaRonda(2);
    correr(b, quieta(2), 1, () => BOTELLA.grados + 6);
    assert.equal(b.niveles[botella], 0);
    assert.equal(b.caidas[botella], true);
    // Menos que `segundos` seguidos no basta, y el contador se reinicia al bajar.
    const c = nuevaRonda(2);
    correr(c, quieta(2), BOTELLA.segundos - 0.05, () => 40);
    correr(c, quieta(2), 0.5, () => 0);
    correr(c, quieta(2), BOTELLA.segundos - 0.05, () => 40);
    assert.equal(c.caidas[botella], false);
    // Pasados 25, derrama mucho menos que un cocktel con el mismo angulo.
    assert.ok(BEBIDAS.botella.tasa < BEBIDAS.cocktel.tasa / 3);
    // Cayendose, la nota de esa ronda pierde exactamente su valor.
    const total = (RONDAS[2]?.bebidas ?? []).reduce((s, t) => s + BEBIDAS[t].valor, 0);
    const soloLaBotella = (RONDAS[2]?.bebidas ?? []).map((_, i) => (i === botella ? 0 : 1));
    assert.ok(Math.abs(fraccionSalvada(2, soloLaBotella) - (1 - BEBIDAS.botella.valor / total)) < 1e-12);
  });

  it('si no queda nada que salvar, la ronda termina en ese momento', () => {
    const e = nuevaRonda(0);
    correr(e, quieta(0), 60, () => 60);
    assert.equal(e.terminada, true);
    assert.ok(e.t < 20, `termino a los ${e.t} s`);
  });
});

describe('pasos fijos: el mismo juego a 30, 60 o 144 fps', () => {
  it('da exactamente el mismo resultado', () => {
    const rec = crearRecorrido(2, 31337);
    const giro = (t: number) => -empuje(rec, Math.max(0, t - 0.25)) + 3 * Math.sin(t * 2.1);
    const jugar = (fps: number) => {
      const e = nuevaRonda(2);
      while (!e.terminada) avanzar(e, rec, 1 / fps, giro);
      return { niveles: e.niveles, caidas: e.caidas, anguloMax: e.anguloMax };
    };
    const base = jugar(60);
    assert.ok(base.niveles.some((n) => n < 1), 'la prueba no derrama nada: no prueba nada');
    for (const fps of [30, 144, 59.94]) assert.deepEqual(jugar(fps), base, `${fps} fps`);
    // Y con fotogramas irregulares (un tirón de 80 ms entre medias).
    const e = nuevaRonda(2);
    const dts = [0.016, 0.08, 0.004, 0.033, 0.2];
    for (let i = 0; !e.terminada; i++) avanzar(e, rec, dts[i % dts.length] as number, giro);
    assert.deepEqual({ niveles: e.niveles, caidas: e.caidas, anguloMax: e.anguloMax }, base);
  });
});

describe('la nota: dos decimales, mas es mejor, maximo 100,00', () => {
  it('el maximo es 100,00 y sale de salvarlo TODO', () => {
    assert.equal(PUNTUACION_MAXIMA, 100);
    assert.deepEqual(RONDAS.map((r) => r.peso), [25, 35, 40]);
    const lleno = RONDAS.map((r, i) => puntosRonda(i, r.bebidas.map(() => 1)));
    assert.equal(notaPartida(lleno), 100);
    // Una gota menos y ya no es 100,00 ni de lejos en la ronda: la nota de esa ronda baja.
    const casi = RONDAS[1]?.bebidas.map((_, i) => (i === 0 ? 0.999 : 1)) as number[];
    assert.ok(puntosRonda(1, casi) < 35);
  });

  it('la curva: lineal hasta el 90 %, continua, monotona, y solo 1 con el 100 % del liquido', () => {
    assert.equal(UMBRAL_CURVA, 0.9);
    for (const f of [0, 0.25, 0.5, 0.9]) assert.ok(Math.abs(curva(f) - f) < 1e-12, `${f} (linea)`);
    assert.ok(Math.abs(curva(0.9 + 1e-9) - 0.9) < 1e-4, 'continua en 0,90');
    let anterior = -1;
    for (let i = 0; i <= 1000; i++) {
      const c = curva(i / 1000);
      assert.ok(c > anterior || i === 0, `no crece en ${i / 1000}`);
      anterior = c;
    }
    assert.equal(curva(1), 1);
    assert.ok(curva(0.999999) < 1);
    // Arriba, mas lenta: salvar el 99 % ya vale claramente menos que el 100 % (y el 95 % un 7 % menos).
    assert.ok(curva(0.99) < 0.97 && curva(0.95) < 0.93 && curva(0.95) > 0.92);
    // Los valores de la tabla que se le ensenaron al usuario (peso 1000).
    assert.equal((1000 * curva(0.95)).toFixed(2), '929.29');
    assert.equal((1000 * curva(0.99)).toFixed(2), '968.38');
    assert.equal(curva(2), 1);
    assert.equal(curva(-1), 0);
  });

  it('nada se redondea antes del final: dos partidas que difieren en una gota dan notas distintas', () => {
    const a = RONDAS.map((r, i) => puntosRonda(i, r.bebidas.map(() => 0.8)));
    const b = RONDAS.map((r, i) => puntosRonda(i, r.bebidas.map((_, j) => (i === 2 && j === 0 ? 0.8 - 0.0004 : 0.8))));
    assert.ok(a.reduce((s, x) => s + x, 0) !== b.reduce((s, x) => s + x, 0), 'las sumas sin redondear difieren');
    // Se redondea UNA vez al final: 3 x 33,3333 suman 100,00; redondeando cada ronda saldria 99,99.
    assert.equal(notaPartida([100 / 3, 100 / 3, 100 / 3]), 100);
    assert.equal(notaPartida([33.33, 33.33, 33.33]), 99.99);
    assert.equal(notaPartida([12.344, 0.0004]), 12.34);
  });

  it('ninguna partida supera PUNTUACION_MAXIMA y la nota sale con 2 decimales como mucho', () => {
    const azar = crearAzar(2024);
    for (let n = 0; n < 500; n++) {
      const puntos = RONDAS.map((r, i) => puntosRonda(i, r.bebidas.map(() => azar() ** (1 + 3 * azar()))));
      const nota = notaPartida(puntos);
      assert.ok(nota >= 0 && nota <= PUNTUACION_MAXIMA, `${nota}`);
      assert.equal(Math.round(nota * 100) / 100, nota);
      assert.ok(Number.isInteger(Math.round(nota * 100)));
    }
    // Cota analitica: cada ronda vale como mucho su peso (nivel <= 1 y curva <= 1), y los pesos suman el maximo.
    for (let i = 0; i < 3; i++) assert.ok(puntosRonda(i, (RONDAS[i]?.bebidas ?? []).map(() => 1)) === (RONDAS[i] as { peso: number }).peso);
    assert.equal(RONDAS.reduce((s, r) => s + r.peso, 0), PUNTUACION_MAXIMA);
  });
});

describe('cada ronda es mas dificil que la anterior', () => {
  const media = (f: (r: Recorrido) => number, ronda: number) => {
    let s = 0;
    for (let i = 1; i <= 60; i++) s += f(crearRecorrido(ronda, i * 17));
    return s / 60;
  };
  const picoDe = (rec: Recorrido) => {
    let m = 0;
    for (let t = 0; t < (RONDAS[rec.ronda] as { duracion: number }).duracion; t += 0.05) m = Math.max(m, Math.abs(empuje(rec, t)));
    return m;
  };

  it('mas giros por segundo, mas empuje y mas empujones; las copas y la botella entran despues', () => {
    const giros = [0, 1, 2].map((r) => media((rec) => rec.esquivas.length / (RONDAS[r] as { duracion: number }).duracion, r));
    assert.ok(giros[0] < giros[1] && giros[1] < giros[2], `giros/s ${giros}`);
    assert.ok(RONDAS[0].empuje < RONDAS[1].empuje && RONDAS[1].empuje < RONDAS[2].empuje);
    assert.ok(RONDAS[0].empujones.n < RONDAS[1].empujones.n && RONDAS[1].empujones.n < RONDAS[2].empujones.n);
    assert.ok(RONDAS[0].empujones.n === 0);
    assert.deepEqual(RONDAS.map((r) => r.bebidas.length), [4, 6, 8]);
    assert.ok(!RONDAS[0].bebidas.includes('cocktel') && RONDAS[1].bebidas.includes('cocktel') && RONDAS[2].bebidas.includes('botella'));
    assert.ok(RONDAS[2].enS && !RONDAS[0].enS);
    const picos = [0, 1, 2].map((r) => media(picoDe, r));
    assert.ok(picos[0] < picos[1], `pico ${picos}`);
  });

  it('en la tercera hay esquivas en S: una al lado contrario enseguida de otra', () => {
    let pares = 0;
    for (let s = 1; s <= 30; s++) {
      const rec = crearRecorrido(2, s);
      rec.esquivas.forEach((e, i) => {
        const sig = rec.esquivas[i + 1];
        if (sig && sig.lado !== e.lado && sig.t - e.t < 1.2) pares += 1;
      });
    }
    assert.ok(pares > 100, `solo ${pares} esquivas en S en 30 recorridos`);
  });

  it('medido con el mismo jugador, se salva menos liquido ronda tras ronda', () => {
    const bueno = [0, 0, 0];
    for (let s = 1; s <= 30; s++) for (let r = 0; r < 3; r++) bueno[r] = (bueno[r] as number) + (jugarRonda(r, s * 13, JUGADORES.bueno).fraccion) / 30;
    assert.ok((bueno[0] as number) > (bueno[1] as number) && (bueno[1] as number) > (bueno[2] as number), `${bueno}`);
  });
});

describe('las tarjetas de fin', () => {
  it('cuenta las bebidas tiradas (casi vacias o botella caida) y dice cual se resistio mas', () => {
    const r1: ResultadoRonda = { ronda: 1, niveles: [1, 1, 1, 0.5, 0.01, 0.9], caidas: [false, false, false, false, false, false] };
    const r2: ResultadoRonda = { ronda: 2, niveles: [1, 1, 1, 1, 1, 0.2, 0.3, 0], caidas: [false, false, false, false, false, false, false, true] };
    assert.equal(bebidasTiradas([r1, r2]), 2);
    // La botella se cayo (pierde 1 de 1), pero es UNA; el cocktel perdio 0,99 y 0,1 en r1 y 0,8 y 0,7 en r2: de media, menos.
    assert.equal(bebidaMasDificil([r1, r2]), 'botella');
    const r3: ResultadoRonda = { ...r2, niveles: [1, 1, 1, 1, 1, 0.2, 0.3, 1], caidas: r2.caidas.map(() => false) };
    assert.equal(bebidaMasDificil([r3]), 'cocktel');
    assert.equal(bebidasTiradas([r3]), 0);
    const limpio: ResultadoRonda = { ronda: 0, niveles: [1, 1, 1, 1], caidas: [false, false, false, false] };
    assert.equal(bebidaMasDificil([limpio]), null);
    assert.equal(bebidasTiradas([limpio]), 0);
  });
});

// ---------------------------------------------------------------------------
// Jugadores simulados: lo que decide si el juego es dificil de verdad
// ---------------------------------------------------------------------------

type Jugador = { retardo: number; temblor: number; filtro: boolean; toca: boolean };
const JUGADORES = {
  perfecto: { retardo: 0, temblor: 0, filtro: false, toca: true },
  elite: { retardo: 0.05, temblor: 1, filtro: true, toca: true },
  bueno: { retardo: 0.12, temblor: 2, filtro: true, toca: true },
  torpe: { retardo: 0.3, temblor: 5, filtro: true, toca: true },
  nada: { retardo: 0, temblor: 0, filtro: false, toca: false },
} satisfies Record<string, Jugador>;
const TAU = TAU_GIRO_PULSO;

/** Corrige lo que ve con `retardo`, con `temblor` grados de pulso (gaussiano filtrado a ~0,1 s) y pasando por el filtro del giro. */
function jugarRonda(ronda: number, semilla: number, j: Jugador) {
  const rec = crearRecorrido(ronda, semilla);
  const e = nuevaRonda(ronda);
  const azar = crearAzar(semilla ^ 0xabcdef);
  let filtrado = 0;
  let ruido = 0;
  const giro = (t: number) => {
    const objetivo = j.toca ? -empuje(rec, Math.max(0, t - j.retardo)) : 0;
    const g = Math.sqrt(-2 * Math.log(1 - azar())) * Math.cos(2 * Math.PI * azar());
    ruido += (g * (j.temblor / 2) - ruido) * (1 - Math.exp(-PASO / 0.1));
    const orden = Math.max(-60, Math.min(60, objetivo + Math.max(-j.temblor, Math.min(j.temblor, ruido))));
    filtrado = j.filtro ? filtrado + (orden - filtrado) * (1 - Math.exp(-PASO / TAU)) : orden;
    return filtrado;
  };
  while (!e.terminada) avanzar(e, rec, PASO, giro);
  return { niveles: e.niveles, caidas: e.caidas, fraccion: fraccionSalvada(ronda, e.niveles), puntos: puntosRonda(ronda, e.niveles) };
}

function jugarPartida(semilla: number, j: Jugador) {
  const rondas = [0, 1, 2].map((r) => jugarRonda(r, semilla, j));
  return { nota: notaPartida(rondas.map((r) => r.puntos)), rondas };
}

function estadisticas(j: Jugador, n: number) {
  const notas: number[] = [];
  for (let s = 1; s <= n; s++) notas.push(jugarPartida(s * 7919, j).nota);
  return {
    media: notas.reduce((a, b) => a + b, 0) / n,
    distintas: new Set(notas).size,
    enMaximo: notas.filter((x) => x === PUNTUACION_MAXIMA).length / n,
    sobre90: notas.filter((x) => x >= 90).length / n,
    sobre80: notas.filter((x) => x >= 80).length / n,
  };
}

describe('jugadores simulados: lo dificil que es de verdad', () => {
  it('el teorico perfecto saca 100,00; el bueno ni se acerca al 90; el de elite lo roza; el torpe y quien no toca el movil, muy por debajo', () => {
    const perfecto = jugarPartida(1, JUGADORES.perfecto);
    assert.equal(perfecto.nota, 100);

    const bueno = estadisticas(JUGADORES.bueno, 120);
    const elite = estadisticas(JUGADORES.elite, 120);
    const torpe = estadisticas(JUGADORES.torpe, 60);
    const nada = estadisticas(JUGADORES.nada, 60);
    // El bueno (120 ms, +-2 grados): ni uno solo con el maximo ni con un 80.
    assert.equal(bueno.enMaximo, 0);
    assert.equal(bueno.sobre80, 0);
    assert.ok(bueno.media > 62 && bueno.media < 80, `bueno ${bueno.media}`);
    // Solo el de elite pasa del 90 y no siempre; nunca el maximo en mas de un 5 %.
    assert.ok(elite.sobre90 > 0.1 && elite.sobre90 < 0.5, `elite >= 90: ${elite.sobre90}`);
    assert.ok(elite.enMaximo <= 0.05, `elite maximo: ${elite.enMaximo}`);
    assert.ok(elite.media > 83 && elite.media < 95, `elite ${elite.media}`);
    // Corregir bien da MUCHA mas nota que no tocar el movil.
    assert.ok(nada.media < 20, `no toca ${nada.media}`);
    assert.ok(bueno.media > 4 * nada.media);
    assert.ok(torpe.media > 25 && torpe.media < 50, `torpe ${torpe.media}`);
    assert.ok(bueno.media > torpe.media && torpe.media > nada.media);
  });

  it('pocos empates: las notas del jugador bueno son casi todas distintas', () => {
    const bueno = estadisticas(JUGADORES.bueno, 200);
    // Con 2 decimales y una nota sobre 100 hay ~1000 valores utiles; en 200 partidas, muy pocas repetidas.
    assert.ok(bueno.distintas >= 170, `solo ${bueno.distintas} notas distintas de 200`);
  });
});

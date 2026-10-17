import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  avanzar,
  BEBIDAS_RONDA,
  bebidaEnCurso,
  cartaDe,
  comandaActual,
  cotaMaxima,
  crearAzar,
  crearPartida,
  cuartosRacha,
  elegirBebida,
  empezar,
  ENTRA,
  generarComandas,
  INGREDIENTES,
  enPausa,
  hayDuda,
  ingredientesValidos,
  DUDA_DESPUES,
  PAUSA_SERVIDO,
  masResistida,
  multiplicadorActual,
  maxBebidas,
  maximoSinRacha,
  paciencia,
  pacienciaRestante,
  pacienciaActual,
  PEDIDOS,
  propina,
  PUNTOS_POR_PASO,
  PUNTUACION_MAXIMA,
  RACHA_CUARTOS_TOPE,
  RECETAS,
  RONDA_DESDE,
  segundosPorPaso,
  terminada,
  tocarIngrediente,
  totalTiradas,
  type Bebida,
  type Ingrediente,
  type Partida,
} from './modelo.ts';

const BEBIDAS = Object.keys(RECETAS) as Bebida[];

/** Sirve la bebida en curso entera, un toque cada `dt` segundos. */
function servirBebida(p: Partida, t: number, dt: number): [Partida, number] {
  const i = bebidaEnCurso(p);
  const b = (comandaActual(p) as { bebidas: Bebida[] }).bebidas[i as number] as Bebida;
  let q = p;
  for (const ing of RECETAS[b]) {
    t += dt;
    q = tocarIngrediente(q, ing, t);
  }
  return [q, t];
}

test('misma semilla, mismos 20 pedidos; semillas distintas, partidas distintas', () => {
  assert.deepEqual(generarComandas(7), generarComandas(7));
  assert.notDeepEqual(generarComandas(7), generarComandas(8));
  assert.equal(generarComandas(1).length, PEDIDOS);
  const distintas = new Set(Array.from({ length: 50 }, (_, s) => JSON.stringify(generarComandas(s))));
  assert.equal(distintas.size, 50);
});

test('el calendario se respeta: ninguna bebida antes de su pedido, ni mas bebidas de las que tocan', () => {
  for (let s = 0; s < 3000; s++) {
    generarComandas(s).forEach((c, i) => {
      const k = i + 1;
      for (const b of c.bebidas) assert.ok(ENTRA[b] <= k, `semilla ${s}, pedido ${k}: ${b} entra en el ${ENTRA[b]}`);
      if (c.ronda) {
        assert.ok(k >= RONDA_DESDE);
        assert.deepEqual(c.bebidas, Array(BEBIDAS_RONDA).fill('chupito'));
      } else {
        assert.ok(c.bebidas.length >= 1 && c.bebidas.length <= maxBebidas(k), `pedido ${k}: ${c.bebidas.length} bebidas`);
      }
      assert.ok(c.cliente >= 0 && c.cliente < 12);
    });
  }
  // Y cada bebida sale de verdad en algun momento (la carta crece, no se queda en cañas).
  const vistas = new Set(Array.from({ length: 200 }, (_, s) => generarComandas(s)).flat().flatMap((c) => c.bebidas));
  assert.deepEqual([...vistas].sort(), [...BEBIDAS].sort());
});

test('cada bebida se completa con exactamente sus pasos y en su orden', () => {
  for (const b of BEBIDAS) {
    let p: Partida = { ...crearPartida(1), comandas: [{ bebidas: [b], ronda: false, cliente: 0 }, ...crearPartida(1).comandas.slice(1)], entregadas: [false] };
    p = empezar(p, 0);
    const receta = RECETAS[b];
    receta.forEach((ing, k) => {
      p = tocarIngrediente(p, ing, 0.1 * (k + 1));
      if (k < receta.length - 1) assert.equal(p.hechos, k + 1, `${b}: paso ${k + 1}`);
    });
    assert.equal(p.servidos, 1, `${b} no se entrego con su receta`);
    assert.equal(p.actual, 1);
    // Todos los ingredientes de las recetas estan en la barra.
    for (const ing of receta) assert.ok(INGREDIENTES.includes(ing));
  }
  assert.equal(INGREDIENTES.length, 12);
  assert.equal(new Set(INGREDIENTES).size, 12);
});

test('un paso equivocado tira SOLO la bebida en preparacion; las entregadas siguen entregadas', () => {
  let p: Partida = { ...crearPartida(2), comandas: [{ bebidas: ['cana', 'clara'], ronda: false, cliente: 0 }, ...crearPartida(2).comandas.slice(1)], entregadas: [false, false] };
  p = empezar(p, 0);
  p = tocarIngrediente(p, 'vaso', 0.1);
  p = tocarIngrediente(p, 'grifo', 0.2);
  // La caña espera en la mano (podria ser la clara); el siguiente vaso la entrega.
  assert.deepEqual(p.entregadas, [false, false]);
  p = tocarIngrediente(p, 'vaso', 0.3);
  assert.deepEqual(p.entregadas, [true, false]);
  p = tocarIngrediente(p, 'grifo', 0.4);
  p = tocarIngrediente(p, 'naranja', 0.5); // la clara lleva refresco de limon
  assert.deepEqual(p.entregadas, [true, false], 'la caña ya entregada sigue entregada');
  assert.equal(p.hechos, 0, 'la clara vuelve a empezar');
  assert.equal(p.tiradas.clara, 1);
  assert.equal(p.fallo, true);
  assert.equal(p.evento?.tipo, 'tirada');
  // Se rehace la clara y el pedido se sirve, sin racha (hubo un fallo).
  for (const [k, ing] of (['vaso', 'grifo', 'refresco-limon'] as Ingrediente[]).entries()) p = tocarIngrediente(p, ing, 0.6 + k * 0.1);
  assert.equal(p.servidos, 1);
  assert.equal(p.racha, 0);
  assert.equal(masResistida(p), 'clara');
  assert.equal(totalTiradas(p), 1);
});

test('se puede elegir que bebida preparar, en cualquier orden', () => {
  let p: Partida = { ...crearPartida(3), comandas: [{ bebidas: ['cana', 'chupito'], ronda: false, cliente: 0 }, ...crearPartida(3).comandas.slice(1)], entregadas: [false, false] };
  p = empezar(p, 0);
  assert.equal(bebidaEnCurso(p), 0, 'sin elegir, la primera pendiente');
  p = elegirBebida(p, 1, 0.1);
  p = tocarIngrediente(p, 'vasito', 0.2);
  p = tocarIngrediente(p, 'casa', 0.3);
  assert.deepEqual(p.entregadas, [false, true]);
  assert.equal(bebidaEnCurso(p), 0);
});

test('la paciencia baja con el reloj y, a cero, el cliente se va: 0 puntos y racha rota', () => {
  let p = empezar(crearPartida(4), 0);
  // Un pedido perfecto para tener racha.
  [p] = servirBebida(p, 0, 0.1);
  while (p.actual === 0) [p] = servirBebida(p, 1, 0.1);
  assert.equal(p.racha, 1);
  const llegada = p.llegada as number;
  const pac = pacienciaActual(p);
  const casi = avanzar(p, llegada + pac - 0.01);
  assert.equal(casi.actual, 1, 'aun no se ha ido');
  const fuera = avanzar(p, llegada + pac);
  assert.equal(fuera.actual, 2);
  assert.equal(fuera.racha, 0);
  assert.equal(fuera.perdidos, 1);
  assert.equal(fuera.puntos, p.puntos, 'el pedido vale 0');
  assert.equal(fuera.evento?.tipo, 'enfadado');
  // El siguiente llega en el instante en que se fue el otro, no cuando se mira.
  assert.equal(fuera.llegada, llegada + pac);
  // Si pasa mucho tiempo, se van todos los que toque, uno detras de otro, y la partida acaba.
  assert.equal(terminada(avanzar(p, llegada + 10_000)), true);
});

test('un toque que llega cuando el cliente ya se ha ido no cuenta para el siguiente', () => {
  let p = empezar(crearPartida(5), 0);
  const pac = pacienciaActual(p);
  const q = tocarIngrediente(p, 'vaso', pac + 0.001);
  assert.equal(q.actual, 1);
  assert.equal(q.hechos, 0, 'el vaso era para el que se fue');
  p = q;
});

test('la paciencia se acorta pedido a pedido', () => {
  for (let k = 2; k <= PEDIDOS; k++) assert.ok(segundosPorPaso(k) < segundosPorPaso(k - 1));
  const una = { bebidas: ['cana'] as Bebida[] };
  assert.ok(paciencia(1, una) > paciencia(20, una));
  assert.equal(Math.round(segundosPorPaso(1) * 100), 190);
  assert.equal(Math.round(segundosPorPaso(20) * 100), 65);
  // Y depende de lo que hay que hacer: tres vermuts dan mas tiempo que una caña.
  assert.ok(paciencia(20, { bebidas: ['vermut', 'vermut', 'vermut'] }) > paciencia(20, una));
});

test('propina mayor cuanto mas rapido; doble en la ronda; racha con tope', () => {
  assert.equal(propina(100, 1, false), 50);
  assert.equal(propina(100, 0.5, false), 30);
  assert.equal(propina(100, 0.3, false), 15);
  assert.equal(propina(100, 0.1, false), 0);
  assert.equal(propina(60, 1, true), 60, 'ronda de chupitos: doble');
  for (let f = 0; f < 1; f += 0.05) assert.ok(propina(100, f + 0.05, false) >= propina(100, f, false));
  assert.equal(cuartosRacha(0), 4);
  assert.equal(cuartosRacha(1), 4);
  assert.equal(cuartosRacha(2), 5);
  assert.equal(cuartosRacha(5), 8);
  assert.equal(cuartosRacha(50), RACHA_CUARTOS_TOPE, 'x2 como mucho');
});

test('la cota: el maximo de cada pedido sale de enumerar TODAS las comandas posibles', () => {
  // Enumeracion independiente: secuencias con repeticion (no multiconjuntos) de la carta del pedido.
  for (let k = 1; k <= PEDIDOS; k++) {
    const carta = cartaDe(k);
    let mejor = 0;
    const rec = (n: number, actual: Bebida[]) => {
      if (actual.length > 0) {
        const base = actual.reduce((s, b) => s + RECETAS[b].length, 0) * PUNTOS_POR_PASO;
        mejor = Math.max(mejor, base + propina(base, 1, false));
      }
      if (n === 0) return;
      for (const b of carta) rec(n - 1, [...actual, b]);
    };
    rec(maxBebidas(k), []);
    if (k >= RONDA_DESDE) mejor = Math.max(mejor, 60 + propina(60, 1, true));
    assert.equal(maximoSinRacha(k), mejor, `pedido ${k}`);
  }
  assert.equal(PUNTUACION_MAXIMA, cotaMaxima());
  assert.equal(PUNTUACION_MAXIMA, 5197);
});

/**
 * Jugador simulado contra el modelo REAL: tarda `leer` en mirar cada bebida y
 * `toque` (con ruido) en cada toque; con probabilidad `error` toca un
 * ingrediente equivocado (la bebida va a la basura y la rehace).
 */
type Jugador = { nombre: string; toque: number; ruido: number; leer: number; error: number };
function jugar(semilla: number, j: Jugador): Partida {
  const azar = crearAzar(semilla * 7919 + 13);
  let p = empezar(crearPartida(semilla), 0);
  let t = 0;
  while (!terminada(p)) {
    const actual = p.actual;
    const i = bebidaEnCurso(p);
    const c = comandaActual(p);
    if (i === null || !c) break;
    const b = c.bebidas[i] as Bebida;
    if (p.hechos === 0) t += j.leer * (0.7 + azar() * 0.6);
    t += j.toque * (1 + (azar() - 0.5) * j.ruido);
    // Llena a la espera (la caña que podria ser clara): el siguiente toque es de otra pendiente.
    const otraPendiente = c.bebidas.findIndex((_, j) => j !== i && !p.entregadas[j]);
    const bien = (RECETAS[b][p.hechos] ?? RECETAS[c.bebidas[otraPendiente] as Bebida][0]) as Ingrediente;
    const ing = azar() < j.error ? (INGREDIENTES.find((x) => x !== bien) as Ingrediente) : bien;
    const q = tocarIngrediente(p, ing, t);
    if (q.evento?.tipo === 'tirada' && q.evento.n !== p.evento?.n) t += 0.5; // lo que tarda en tirarla
    p = q;
    // Si el cliente se fue mientras, el siguiente ya esta: seguir con el reloj donde va.
    if (p.actual !== actual && p.llegada !== null) t = Math.max(t, p.llegada);
  }
  return p;
}

const JUGADORES: Jugador[] = [
  { nombre: 'perfecto y rapido', toque: 0.32, ruido: 0.3, leer: 0.35, error: 0 },
  { nombre: 'bueno', toque: 0.55, ruido: 0.5, leer: 0.8, error: 0.03 },
  { nombre: 'lento', toque: 0.95, ruido: 0.6, leer: 1.5, error: 0.06 },
];

test('ninguna partida supera PUNTUACION_MAXIMA (ni el jugador instantaneo)', () => {
  const instantaneo: Jugador = { nombre: 'instantaneo', toque: 0.0001, ruido: 0, leer: 0, error: 0 };
  for (let s = 1; s <= 2000; s++) {
    const p = jugar(s, instantaneo);
    assert.ok(p.puntos <= PUNTUACION_MAXIMA, `semilla ${s}: ${p.puntos}`);
    assert.equal(p.servidos, PEDIDOS);
  }
});

test('los tres jugadores simulados: el bueno NO saca el maximo casi nunca', () => {
  const resumen: Record<string, { media: number; p50: number; p90: number; max: number; servidos: number; cerca: number }> = {};
  for (const j of JUGADORES) {
    const notas: number[] = [];
    let servidos = 0;
    for (let s = 1; s <= 2000; s++) {
      const p = jugar(s, j);
      notas.push(p.puntos);
      servidos += p.servidos;
      assert.ok(p.puntos <= PUNTUACION_MAXIMA);
    }
    notas.sort((a, b) => a - b);
    const q = (x: number) => notas[Math.floor(x * (notas.length - 1))] as number;
    resumen[j.nombre] = {
      media: Math.round(notas.reduce((a, b) => a + b, 0) / notas.length),
      p50: q(0.5),
      p90: q(0.9),
      max: q(1),
      servidos: Math.round((servidos / notas.length) * 10) / 10,
      cerca: notas.filter((n) => n >= 0.9 * PUNTUACION_MAXIMA).length / notas.length,
    };
  }
  console.log(JSON.stringify(resumen));
  const [perfecto, bueno, lento] = JUGADORES.map((j) => resumen[j.nombre] as (typeof resumen)[string]);
  assert.ok(perfecto.p50 > bueno.p50 && bueno.p50 > lento.p50, 'mas habilidad, mas nota');
  assert.ok(bueno.cerca < 0.01, 'el bueno no se acerca al maximo');
  assert.ok(perfecto.cerca < 0.01, 'ni el perfecto: la cota pide las comandas mas largas');
  assert.ok(bueno.p50 < 0.8 * perfecto.p50, 'hay recorrido entre bueno y perfecto');
  assert.ok(perfecto.servidos === 20, 'el perfecto los sirve todos');
  assert.ok(lento.servidos < 16, 'al lento se le van clientes al final');
});

test('con una bebida a medias no se cambia a otra (un toque sin querer no tira los pasos hechos)', () => {
  let p: Partida = { ...crearPartida(3), comandas: [{ bebidas: ['vermut', 'cana'], ronda: false, cliente: 0 }, ...crearPartida(3).comandas.slice(1)], entregadas: [false, false] };
  p = empezar(p, 0);
  p = tocarIngrediente(p, 'vaso', 0.1);
  p = tocarIngrediente(p, 'hielo', 0.2);
  assert.equal(p.hechos, 2);
  const q = elegirBebida(p, 1, 0.3);
  assert.equal(q, p, 'no cambia');
  assert.equal(q.hechos, 2);
});

test('fallar con el vaso vacio es fallo (rompe la racha) pero no "bebida a la basura"', () => {
  let p: Partida = { ...crearPartida(6), comandas: [{ bebidas: ['cana'], ronda: false, cliente: 0 }, ...crearPartida(6).comandas.slice(1)], entregadas: [false] };
  p = empezar(p, 0);
  p = tocarIngrediente(p, 'grifo', 0.1); // antes del vaso
  assert.equal(p.fallo, true);
  assert.equal(totalTiradas(p), 0);
  assert.equal(p.evento?.tipo, 'equivocado');
  assert.equal(multiplicadorActual(p), 4, 'este pedido ya va a x1');
  assert.equal(masResistida(p), 'cana', 'el primer paso equivocado tambien cuenta para la que mas se resistio');
  p = tocarIngrediente(p, 'vaso', 0.2);
  p = tocarIngrediente(p, 'grifo', 0.3);
  assert.equal(p.servidos, 1);
  assert.equal(p.racha, 0);
});

test('el multiplicador que se ensena es el que se llevara el pedido actual', () => {
  const p = empezar(crearPartida(1), 0);
  assert.equal(multiplicadorActual(p), 4, 'el primero: x1');
  assert.equal(multiplicadorActual({ ...p, racha: 1 }), 5, 'tras uno limpio: x1,25');
  assert.equal(multiplicadorActual({ ...p, racha: 30 }), 8, 'tope x2');
  assert.equal(multiplicadorActual({ ...p, racha: 4, fallo: true }), 4, 'con un fallo en este pedido: x1');
});

test('el ingrediente elige la bebida: empezar por otra de la comanda no es un fallo', () => {
  const con = (bebidas: Bebida[]): Partida =>
    empezar({ ...crearPartida(9), comandas: [{ bebidas, ronda: false, cliente: 0 }, ...crearPartida(9).comandas.slice(1)], entregadas: bebidas.map(() => false) }, 0);
  // [caña, chupito] y se empieza por el chupito: ni fallo ni culpa a la caña.
  let p = con(['cana', 'chupito']);
  p = tocarIngrediente(p, 'vasito', 0.1);
  assert.equal(p.fallo, false);
  assert.equal(p.elegida, 1);
  assert.equal(p.hechos, 1);
  assert.equal(masResistida(p), null);
  p = tocarIngrediente(p, 'casa', 0.2);
  assert.deepEqual(p.entregadas, [false, true]);
  // [caña, vermut]: vaso (vale para las dos) y hielo pasa al vermut sin fallo.
  let q = con(['cana', 'vermut']);
  q = tocarIngrediente(q, 'vaso', 0.1);
  q = tocarIngrediente(q, 'hielo', 0.2);
  assert.equal(q.fallo, false);
  assert.equal(q.elegida, 1);
  assert.equal(q.hechos, 2);
  // Pero lo que no encaja con NINGUNA pendiente sigue siendo fallo.
  let r = con(['cana', 'chupito']);
  r = tocarIngrediente(r, 'naranja', 0.1);
  assert.equal(r.fallo, true);
  assert.equal(r.evento?.tipo, 'equivocado');
  // Y una bebida ya entregada no se "reelige".
  let t = con(['chupito', 'cana']);
  t = tocarIngrediente(t, 'vasito', 0.1);
  t = tocarIngrediente(t, 'casa', 0.2);
  t = tocarIngrediente(t, 'vasito', 0.3);
  assert.equal(t.fallo, true, 'el chupito ya esta servido: el vasito ya no encaja');
});

test('caña y clara, en los dos ordenes: lo que hay en el vaso decide (sin fallos)', () => {
  const con = (bebidas: Bebida[]): Partida =>
    empezar({ ...crearPartida(9), comandas: [{ bebidas, ronda: false, cliente: 0 }, ...crearPartida(9).comandas.slice(1)], entregadas: bebidas.map(() => false) }, 0);
  const tocarTodo = (p: Partida, ings: Ingrediente[]) => ings.reduce((q, ing, k) => tocarIngrediente(q, ing, 0.1 * (k + 1)), p);

  // [caña, clara], la clara primero: vaso, grifo, refresco -> clara; luego la caña.
  let p = tocarTodo(con(['cana', 'clara']), ['vaso', 'grifo', 'refresco-limon']);
  assert.deepEqual(p.entregadas, [false, true], 'la clara, no la caña');
  assert.equal(p.fallo, false);
  p = tocarTodo(p, ['vaso', 'grifo']);
  assert.equal(p.servidos, 1);
  assert.equal(p.racha, 1, 'sin fallos');

  // [caña, clara], la caña primero: vaso, grifo (caña en la mano), vaso -> se entrega la caña.
  let q = tocarTodo(con(['cana', 'clara']), ['vaso', 'grifo']);
  assert.deepEqual(q.entregadas, [false, false], 'la caña espera: podria ser una clara');
  q = tocarIngrediente(q, 'vaso', 0.5);
  assert.deepEqual(q.entregadas, [true, false]);
  assert.equal(q.hechos, 1, 'el vaso ya es de la clara');
  q = tocarTodo(q, ['grifo', 'refresco-limon']);
  assert.equal(q.servidos, 1);
  assert.equal(q.racha, 1);

  // [clara, caña], la caña primero: vaso, grifo, vaso -> caña entregada, sin tirar nada.
  let r = tocarTodo(con(['clara', 'cana']), ['vaso', 'grifo', 'vaso']);
  assert.deepEqual(r.entregadas, [false, true]);
  assert.equal(r.fallo, false);
  assert.equal(totalTiradas(r), 0);
  r = tocarTodo(r, ['grifo', 'refresco-limon']);
  assert.equal(r.servidos, 1);
  assert.equal(r.racha, 1);

  // Una caña sola se entrega en el acto (nada que la alargue).
  const s1 = tocarTodo(con(['cana']), ['vaso', 'grifo']);
  assert.equal(s1.servidos, 1);
  // Dos cañas: la primera se entrega en el acto (la otra no la alarga, es igual).
  const s2 = tocarTodo(con(['cana', 'cana']), ['vaso', 'grifo']);
  assert.deepEqual(s2.entregadas, [true, false]);
  // Con la caña en la mano, algo que no sirve para nada pendiente: se entrega la caña y el toque es fallo de lo siguiente.
  const s3 = tocarTodo(con(['cana', 'clara']), ['vaso', 'grifo', 'naranja']);
  assert.deepEqual(s3.entregadas, [true, false]);
  assert.equal(s3.fallo, true);
});

const con1 = (bebidas: Bebida[]): Partida =>
  empezar({ ...crearPartida(9), comandas: [{ bebidas, ronda: false, cliente: 0 }, ...crearPartida(9).comandas.slice(1)], entregadas: bebidas.map(() => false) }, 0);

test('tras servir hay una pausa: el siguiente llega despues y los toques no cuentan', () => {
  let p = con1(['cana']);
  p = tocarIngrediente(p, 'vaso', 1);
  p = tocarIngrediente(p, 'grifo', 2);
  assert.equal(p.servidos, 1);
  assert.equal(p.actual, 1);
  assert.equal(p.llegada, 2 + PAUSA_SERVIDO);
  assert.equal(enPausa(p, 2.5), true);
  assert.equal(enPausa(p, 2 + PAUSA_SERVIDO), false);
  // En la pausa, un toque no hace nada (ni paso, ni fallo).
  const igual = tocarIngrediente(p, 'vaso', 2.5);
  assert.equal(igual, p);
  assert.equal(elegirBebida(p, 0, 2.5), p);
  // Al llegar, ya cuenta.
  const q = tocarIngrediente(p, comandaActual(p)?.bebidas[0] ? RECETAS[(comandaActual(p) as { bebidas: Bebida[] }).bebidas[0] as Bebida][0] as Ingrediente : 'vaso', 2 + PAUSA_SERVIDO + 0.01);
  assert.equal(q.hechos, 1);
});

test('la pausa no le gasta paciencia al siguiente cliente: llega con la barra llena', () => {
  let p = con1(['cana']);
  p = tocarIngrediente(p, 'vaso', 1);
  p = tocarIngrediente(p, 'grifo', 2);
  assert.equal(pacienciaRestante(p, 2.5), 1, 'en la pausa, intacta');
  assert.equal(pacienciaRestante(p, 2 + PAUSA_SERVIDO), 1, 'recien llegado');
  // Y no se va nadie durante la pausa por mucho que se mire.
  assert.equal(avanzar(p, 2.9).actual, 1);
  assert.equal(avanzar(p, 2.9).perdidos, 0);
});

test('un cliente que se va enfadado NO lleva pausa: el siguiente llega en el acto', () => {
  const p = empezar(crearPartida(5), 0);
  const fuera = avanzar(p, pacienciaActual(p));
  assert.equal(fuera.actual, 1);
  assert.equal(fuera.llegada, pacienciaActual(p));
});

test('la pausa no cambia los puntos: misma partida con y sin ella, mismo resultado (la propina sale de la paciencia al servir)', () => {
  // Un pedido servido al mismo instante relativo a su llegada puntua igual en el pedido 1 y en el 2.
  let p = con1(['cana']);
  p = tocarIngrediente(p, 'vaso', 0.5);
  p = tocarIngrediente(p, 'grifo', 1.0);
  const puntos1 = p.puntos;
  const llegada = p.llegada as number;
  p = tocarIngrediente(p, RECETAS[(comandaActual(p) as { bebidas: Bebida[] }).bebidas[0] as Bebida][0] as Ingrediente, llegada + 0.01);
  assert.ok(puntos1 > 0);
  assert.equal(p.puntos, puntos1);
});

test('la duda: tras DUDA_DESPUES s sin tocar, se ensena que tocar; un toque lo apaga', () => {
  let p = con1(['cana']);
  assert.equal(hayDuda(p, DUDA_DESPUES - 0.01), false);
  assert.equal(hayDuda(p, DUDA_DESPUES), true);
  assert.deepEqual(ingredientesValidos(p), ['vaso']);
  p = tocarIngrediente(p, 'vaso', 1);
  assert.equal(hayDuda(p, 1 + DUDA_DESPUES - 0.01), false, 'se mide desde el ultimo toque');
  assert.equal(hayDuda(p, 1 + DUDA_DESPUES + 0.001), true);
  assert.deepEqual(ingredientesValidos(p), ['grifo']);
  // En la pausa de "bien hecho" no hay duda (aun no ha llegado nadie).
  p = tocarIngrediente(p, 'grifo', 2);
  assert.equal(hayDuda(p, 2.5), false);
  assert.equal(hayDuda(p, 2 + PAUSA_SERVIDO + DUDA_DESPUES - 0.01), false);
  assert.equal(hayDuda(p, 2 + PAUSA_SERVIDO + DUDA_DESPUES + 0.001), true);
});

test('la pista: el siguiente paso, y con varias bebidas, las opciones que valen', () => {
  // Vaso vacio con dos bebidas: la que toca (la primera pendiente).
  let p = con1(['vermut', 'chupito']);
  assert.deepEqual(ingredientesValidos(p), ['vaso']);
  // Tras el vaso: lo que sigue del vermut.
  p = tocarIngrediente(p, 'vaso', 1);
  assert.deepEqual(ingredientesValidos(p), ['hielo']);
  // Con una caña en la mano que podria ser clara: el refresco (clara) y el primero de lo que sigue.
  let q = con1(['cana', 'clara', 'chupito']);
  q = tocarIngrediente(q, 'vaso', 1);
  q = tocarIngrediente(q, 'grifo', 2);
  const valen = ingredientesValidos(q);
  assert.ok(valen.includes('refresco-limon'));
  // Y se puede seguir con cualquiera de ellos sin fallo.
  for (const ing of valen) {
    const r = tocarIngrediente(q, ing, 3);
    assert.equal(r.fallo, false, ing);
  }
  // Sin cliente (partida terminada) no hay pista.
  assert.deepEqual(ingredientesValidos({ ...q, actual: PEDIDOS }), []);
});

test('la pista siempre es valida: ningun ingrediente que ensena produce un fallo (partidas al azar)', () => {
  const azar = crearAzar(77);
  for (let s = 1; s <= 300; s++) {
    let p = empezar(crearPartida(s), 0);
    let t = 0;
    for (let n = 0; n < 400 && !terminada(p); n++) {
      t = Math.max(t + 0.2, p.llegada ?? 0);
      const valen = ingredientesValidos(p);
      if (valen.length === 0) break;
      const ing = valen[Math.floor(azar() * valen.length)] as Ingrediente;
      const q = tocarIngrediente(p, ing, t);
      if (q === p) continue;
      assert.equal(q.fallo, p.fallo, `semilla ${s}, toque ${n}: la pista ${ing} dio fallo`);
      p = q;
    }
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAPAS } from './mapas.ts';
import {
  alto,
  ancho,
  avanzar,
  CADUCA_TAPA,
  crearEstado,
  DURACION_DOBLE,
  girar,
  intervalo,
  INTERVALO_INICIAL,
  INTERVALO_MINIMO,
  MAX_COLA,
  mensajeFinal,
  multiplicador,
  pasarTiempo,
  PUNTOS_JARRA,
  PUNTUACION_MAXIMA,
  PUNTOS_TAPA,
  VARIANTES_AMIGO,
  type Estado,
  type Item,
  type Mapa,
} from './modelo.ts';

/** Sala abierta de 6x6, sin obstaculos; la salida esta en (2, 3). */
const SALA: Mapa = {
  id: 'sala',
  nombre: 'Sala',
  filas: ['......', '......', '......', '..P...', '......', '......'],
};
/** Azar fijo: siempre el mismo valor. */
const fijo = (v: number) => () => v;
/** Estado a mano: sin objetos salvo los que se pasen, para no depender del azar. */
function estado(parcial: Partial<Estado> = {}): Estado {
  return {
    cuerpo: [{ x: 2, y: 3 }],
    amigos: [],
    dir: 'arriba',
    cola: [],
    items: [],
    puntos: 0,
    jarras: 0,
    tiempo: 0,
    dobleHasta: 0,
    vivo: true,
    causa: null,
    ...parcial,
  };
}
const jarraEn = (x: number, y: number): Item => ({ tipo: 'jarra', pos: { x, y }, caduca: null });

test('los mapas estan bien formados y se puede llegar a todo el suelo desde la salida', () => {
  assert.ok(MAPAS.length >= 1);
  for (const m of MAPAS) {
    assert.ok(alto(m) > 0 && ancho(m) > 0, m.id);
    for (const f of m.filas) assert.equal(f.length, ancho(m), `${m.id}: fila de otro ancho`);
    assert.equal(m.filas.join('').split('P').length - 1, 1, `${m.id}: debe haber una sola salida`);
    const suelo = new Set<string>();
    m.filas.forEach((f, y) => [...f].forEach((c, x) => (c === '.' || c === 'P') && suelo.add(`${x},${y}`)));
    // Recorrido desde la salida.
    const y0 = m.filas.findIndex((f) => f.includes('P'));
    const visto = new Set<string>([`${m.filas[y0].indexOf('P')},${y0}`]);
    const pendientes = [...visto].map((k) => k.split(',').map(Number));
    while (pendientes.length) {
      const [x, y] = pendientes.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (suelo.has(k) && !visto.has(k)) {
          visto.add(k);
          pendientes.push([x + dx, y + dy]);
        }
      }
    }
    assert.equal(visto.size, suelo.size, `${m.id}: hay suelo al que no se llega`);
  }
});

test('la partida empieza con la cabeza en la salida y una jarra en el suelo', () => {
  const e = crearEstado(MAPAS[0], Math.random);
  assert.equal(e.cuerpo.length, 1);
  assert.equal(e.items.length, 1);
  assert.equal(e.items[0].tipo, 'jarra');
  const { x, y } = e.items[0].pos;
  assert.equal(MAPAS[0].filas[y][x], '.');
});

test('la conga avanza una casilla en su direccion', () => {
  const e = avanzar(estado(), SALA, fijo(0));
  assert.deepEqual(e.cuerpo, [{ x: 2, y: 2 }]);
});

test('no se puede dar la vuelta de golpe, ni con el buffer', () => {
  let e = estado({ dir: 'arriba' });
  assert.equal(girar(e, 'abajo'), e);
  assert.equal(girar(e, 'arriba'), e);
  e = girar(e, 'izquierda');
  // Tras pedir izquierda, derecha seria dar la vuelta aunque aun no se haya aplicado.
  assert.equal(girar(e, 'derecha'), e);
  assert.deepEqual(e.cola, ['izquierda']);
});

test('dos giros rapidos seguidos se guardan y se aplican uno por paso', () => {
  let e = estado({ dir: 'arriba' });
  e = girar(e, 'izquierda');
  e = girar(e, 'abajo');
  assert.deepEqual(e.cola, ['izquierda', 'abajo']);
  e = avanzar(e, SALA, fijo(0));
  assert.deepEqual(e.cuerpo[0], { x: 1, y: 3 });
  assert.deepEqual(e.cola, ['abajo']);
  e = avanzar(e, SALA, fijo(0));
  assert.deepEqual(e.cuerpo[0], { x: 1, y: 4 });
  assert.equal(e.dir, 'abajo');
});

test('el buffer tiene un tope', () => {
  let e = estado({ dir: 'arriba' });
  for (const g of ['izquierda', 'abajo', 'derecha', 'arriba'] as const) e = girar(e, g);
  assert.equal(e.cola.length, MAX_COLA);
});

test('chocar con un muro o salirse del mapa acaba la partida', () => {
  const borde = avanzar(estado({ cuerpo: [{ x: 2, y: 0 }] }), SALA, fijo(0));
  assert.equal(borde.vivo, false);
  assert.equal(borde.causa, 'muro');
  const conMuro: Mapa = { id: 'm', nombre: 'm', filas: ['......', '..E...', '..P...'] };
  const e = avanzar(estado({ cuerpo: [{ x: 2, y: 2 }] }), conMuro, fijo(0));
  assert.equal(e.causa, 'muro');
});

test('una partida terminada no se mueve', () => {
  const muerto = estado({ vivo: false, causa: 'muro' });
  assert.equal(avanzar(muerto, SALA, fijo(0)), muerto);
  assert.equal(girar(muerto, 'izquierda'), muerto);
});

test('la jarra suma 10, alarga la conga con un amigo y saca otra jarra', () => {
  const e = avanzar(estado({ items: [jarraEn(2, 2)] }), SALA, fijo(0.99));
  assert.equal(e.puntos, PUNTOS_JARRA);
  assert.equal(e.cuerpo.length, 2);
  assert.equal(e.amigos.length, 1);
  assert.equal(e.jarras, 1);
  assert.ok(e.amigos[0] >= 0 && e.amigos[0] < VARIANTES_AMIGO);
  assert.equal(e.items.filter((i) => i.tipo === 'jarra').length, 1);
  assert.notDeepEqual(e.items.find((i) => i.tipo === 'jarra')!.pos, { x: 2, y: 2 });
});

test('los amigos se eligen al azar entre los que hay', () => {
  const primero = avanzar(estado({ items: [jarraEn(2, 2)] }), SALA, fijo(0));
  const ultimo = avanzar(estado({ items: [jarraEn(2, 2)] }), SALA, fijo(0.999999));
  assert.equal(primero.amigos[0], 0);
  assert.equal(ultimo.amigos[0], VARIANTES_AMIGO - 1);
});

test('la tapa suma 25 y NO alarga la conga', () => {
  const tapa: Item = { tipo: 'tapa', pos: { x: 2, y: 2 }, caduca: 6 };
  const e = avanzar(estado({ items: [tapa, jarraEn(5, 5)] }), SALA, fijo(0));
  assert.equal(e.puntos, PUNTOS_TAPA);
  assert.equal(e.cuerpo.length, 1);
  assert.equal(e.jarras, 0);
  assert.deepEqual(e.items.map((i) => i.tipo), ['jarra']);
});

test('la jarra dorada activa el doble durante 5 segundos', () => {
  const dorada: Item = { tipo: 'dorada', pos: { x: 2, y: 2 }, caduca: 8 };
  let e = avanzar(estado({ tiempo: 1, items: [dorada, jarraEn(5, 5)] }), SALA, fijo(0.99));
  assert.equal(e.dobleHasta, 1 + DURACION_DOBLE);
  assert.equal(multiplicador(e), 2);
  assert.equal(e.cuerpo.length, 2);

  // Con el doble activo, una jarra vale 20.
  const antes = e.puntos;
  e = avanzar({ ...e, items: [jarraEn(2, 1)], dir: 'arriba', cola: [] }, SALA, fijo(0.99));
  assert.equal(e.puntos - antes, PUNTOS_JARRA * 2);

  // Pasados los 5 segundos, vuelve a valer 10.
  e = pasarTiempo(e, DURACION_DOBLE + 0.1);
  assert.equal(multiplicador(e), 1);
});

test('las tapas desaparecen solas al caducar y la jarra normal no', () => {
  const tapa: Item = { tipo: 'tapa', pos: { x: 4, y: 4 }, caduca: CADUCA_TAPA };
  let e = estado({ items: [tapa, jarraEn(0, 0)] });
  e = pasarTiempo(e, CADUCA_TAPA - 0.5);
  assert.equal(e.items.length, 2);
  e = pasarTiempo(e, 1);
  assert.deepEqual(e.items.map((i) => i.tipo), ['jarra']);
});

test('el reloj de juego no avanza con dt <= 0', () => {
  const e = estado();
  assert.equal(pasarTiempo(e, 0), e);
  assert.equal(pasarTiempo(e, -1), e);
});

test('chocar con la propia conga acaba la partida', () => {
  // La cabeza va hacia arriba y se encuentra con su propio cuerpo.
  const cuerpo = [
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
    { x: 1, y: 3 },
  ];
  const e = avanzar(estado({ cuerpo, amigos: [0, 0, 0, 0, 0] }), SALA, fijo(0));
  assert.equal(e.vivo, false);
  assert.equal(e.causa, 'conga');
});

test('la cabeza SI puede entrar donde estaba la punta de la cola: se retira en ese paso', () => {
  const cuerpo = [
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 2 },
    { x: 2, y: 2 },
  ];
  const e = avanzar(estado({ cuerpo, amigos: [0, 0, 0] }), SALA, fijo(0));
  assert.equal(e.vivo, true);
  assert.deepEqual(e.cuerpo[0], { x: 2, y: 2 });
  assert.equal(e.cuerpo.length, 4);
});

test('si se llena todo el mapa, la partida acaba como completada', () => {
  const pasillo: Mapa = { id: 'p', nombre: 'p', filas: ['.P.'] };
  // Cabeza en (1,0), amigo en (2,0) y la unica casilla libre con la jarra: al comerla no queda sitio.
  const e = avanzar(
    estado({ cuerpo: [{ x: 1, y: 0 }, { x: 2, y: 0 }], amigos: [0], dir: 'izquierda', items: [jarraEn(0, 0)] }),
    pasillo,
    fijo(0),
  );
  assert.equal(e.vivo, false);
  assert.equal(e.causa, 'completo');
});

test('la velocidad sube con cada jarra pero tiene un suelo', () => {
  assert.equal(intervalo(0), INTERVALO_INICIAL);
  for (let n = 0; n < 40; n++) assert.ok(intervalo(n + 1) <= intervalo(n));
  assert.ok(intervalo(5) < intervalo(0));
  assert.equal(intervalo(500), INTERVALO_MINIMO);
  assert.equal(intervalo(-3), INTERVALO_INICIAL);
});

test('ningun mapa permite pasarse del tope del ranking (0039)', () => {
  for (const m of MAPAS) {
    const libres = m.filas.join('').split('').filter((c) => c === '.' || c === 'P').length;
    // Cada jarra deja un amigo en una casilla: como mucho (libres - 1) jarras. En el peor
    // caso cada una con el doble y seguida de una tapa doble (las tapas solo salen tras una jarra).
    const maximo = (libres - 1) * (PUNTOS_JARRA * 2 + PUNTOS_TAPA * 2);
    assert.ok(maximo <= PUNTUACION_MAXIMA, `${m.id}: hasta ${maximo} puntos y el servidor acepta ${PUNTUACION_MAXIMA}`);
  }
});

test('mensaje final con singular, plural y tramos', () => {
  assert.match(mensajeFinal(0), /solitario/);
  assert.equal(mensajeFinal(1), 'Has reclutado 1 amigo para la ruta');
  assert.equal(mensajeFinal(14), 'Has reclutado 14 amigos para la ruta');
  assert.match(mensajeFinal(8), /Plaza de Cervantes/);
  assert.match(mensajeFinal(30), /legendaria/);
});

test('una partida entera con el azar real no rompe ninguna regla', () => {
  let e = crearEstado(MAPAS[0], Math.random);
  const dirs = ['arriba', 'izquierda', 'abajo', 'derecha'] as const;
  for (let paso = 0; paso < 2000 && e.vivo; paso++) {
    if (paso % 3 === 0) e = girar(e, dirs[Math.floor(Math.random() * 4)]);
    e = pasarTiempo(avanzar(e, MAPAS[0], Math.random), 0.1);
    assert.equal(e.cuerpo.length, e.amigos.length + 1);
    assert.equal(new Set(e.cuerpo.map((p) => `${p.x},${p.y}`)).size, e.cuerpo.length, 'celdas repetidas');
    assert.ok(e.cola.length <= MAX_COLA);
    if (e.vivo) assert.ok(e.items.some((i) => i.tipo === 'jarra'), 'siempre hay una jarra');
  }
});

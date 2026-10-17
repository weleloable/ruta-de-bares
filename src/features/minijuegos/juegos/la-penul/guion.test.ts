import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { BARRA, CIERRE, INICIO, NODOS, PERSONAS, RONDAS } from './guion.ts';
import { crearMotor, leer, type Estado } from './motor.ts';
import type { Genero, Nodo, Pagina, PersonaId } from './tipos.ts';

/**
 * El guion como grafo. Se recorren TODAS las partidas posibles (el estado es
 * pequeno: nodo, rondas y a quien ya se intento), con los dos generos, y se
 * comprueba lo que pide el juego: sin callejones, todo camino termina, cada
 * personaje tiene final bueno y malo, y ninguna opcion que presiona acaba bien.
 */

const guion = { nodos: NODOS, inicio: INICIO, barra: BARRA, cierre: CIERRE, rondas: RONDAS };
const motor = crearMotor(guion);
const porId = new Map(NODOS.map((n) => [n.id, n]));
const PERSONAS_IDS = Object.keys(PERSONAS) as PersonaId[];

type Paso = { estado: Estado; presiono: boolean };
const clave = (p: Paso) => `${p.estado.nodo}|${p.estado.rondas}|${[...p.estado.intentados].sort().join(',')}|${p.presiono}`;

/** Todas las partidas desde el inicio: estados alcanzables, finales a los que se llega y si hay ciclos. */
function explorar(genero: Genero) {
  const visto = new Set<string>();
  const enPila = new Set<string>();
  const finales: { nodo: string; presiono: boolean }[] = [];
  const nodos = new Set<string>();
  let ciclo: string | null = null;
  let profundidadMax = 0;

  const ir = (p: Paso, prof: number) => {
    const k = clave(p);
    if (enPila.has(k)) {
      ciclo = k;
      return;
    }
    if (visto.has(k)) return;
    visto.add(k);
    nodos.add(p.estado.nodo);
    profundidadMax = Math.max(profundidadMax, prof);
    const n = porId.get(p.estado.nodo) as Nodo;
    if (n.final) {
      finales.push({ nodo: n.id, presiono: p.presiono });
      return;
    }
    enPila.add(k);
    // Leer hasta la ultima pagina y probar cada opcion que se puede elegir.
    let e = p.estado;
    while (!motor.enUltimaPagina(e)) e = motor.siguientePagina(e);
    for (const o of motor.opciones(e)) {
      if (o.tachada) continue;
      const opcion = n.opciones?.[o.indice];
      const siguiente = motor.elegir(e, o.indice);
      assert.notEqual(siguiente, e, `elegir ${n.id}[${o.indice}] no hizo nada`);
      ir({ estado: siguiente, presiono: p.presiono || !!opcion?.etiquetas?.includes('presiona') }, prof + 1);
    }
    enPila.delete(k);
  };
  ir({ estado: motor.empezar(0, genero), presiono: false }, 0);
  return { finales, nodos, ciclo, profundidadMax, estados: visto.size };
}

const RECORRIDOS = { h: explorar('h'), m: explorar('m') };

test('los ids son unicos y todo destino existe', () => {
  assert.equal(new Set(NODOS.map((n) => n.id)).size, NODOS.length);
  for (const n of NODOS) for (const o of n.opciones ?? []) assert.ok(porId.has(o.va), `${n.id} -> ${o.va} no existe`);
  for (const id of [INICIO, BARRA, CIERRE]) assert.ok(porId.has(id), id);
});

test('ningun callejon sin salida: o tiene opciones o es un final (y no las dos cosas)', () => {
  for (const n of NODOS) {
    const tiene = (n.opciones?.length ?? 0) > 0;
    assert.ok(tiene !== !!n.final, `${n.id}: ${tiene ? 'tiene opciones y final' : 'ni opciones ni final'}`);
    assert.ok(n.paginas.length > 0, `${n.id} sin texto`);
  }
});

test('todo nodo es alcanzable desde el inicio, con los dos generos', () => {
  for (const g of ['h', 'm'] as const) {
    const sueltos = NODOS.map((n) => n.id).filter((id) => !RECORRIDOS[g].nodos.has(id));
    assert.deepEqual(sueltos, [], `genero ${g}`);
  }
});

test('todo camino termina: sin ciclos y siempre en un final', () => {
  for (const g of ['h', 'm'] as const) {
    assert.equal(RECORRIDOS[g].ciclo, null, `ciclo en ${RECORRIDOS[g].ciclo}`);
    assert.ok(RECORRIDOS[g].finales.length > 0);
  }
});

test('volver a la barra siempre cuesta una ronda (es lo que cierra el bar), salvo al entrar', () => {
  for (const n of NODOS) {
    for (const o of n.opciones ?? []) {
      if (o.va === BARRA && n.id !== 'puerta') assert.equal(o.ronda, true, `${n.id}: "${o.texto}" vuelve a la barra sin gastar ronda`);
    }
  }
  // Y dentro de una conversacion no hay vuelta atras: sin las aristas a la barra, el grafo no tiene ciclos.
  const color = new Map<string, number>();
  const dfs = (id: string): void => {
    color.set(id, 1);
    for (const o of porId.get(id)?.opciones ?? []) {
      if (o.va === BARRA) continue;
      const c = color.get(o.va) ?? 0;
      assert.notEqual(c, 1, `ciclo dentro de una conversacion en ${o.va}`);
      if (c === 0) dfs(o.va);
    }
    color.set(id, 2);
  };
  for (const n of NODOS) if (!color.has(n.id)) dfs(n.id);
});

test('cada personaje tiene al menos un final bueno y uno malo, y los dos generos llegan a todos los buenos', () => {
  for (const p of PERSONAS_IDS) {
    const buenos = NODOS.filter((n) => n.final?.tipo === 'bueno' && n.final.con === p);
    const malos = NODOS.filter((n) => n.final?.tipo === 'calabazas' && n.final.con === p);
    assert.ok(buenos.length >= 1, `${p} sin final bueno`);
    assert.ok(malos.length >= 1, `${p} sin final malo`);
    for (const g of ['h', 'm'] as const) {
      for (const b of buenos) {
        assert.ok(
          RECORRIDOS[g].finales.some((f) => f.nodo === b.id && !f.presiono),
          `${b.id} inalcanzable (sin presionar) jugando de ${g}`,
        );
      }
    }
  }
  // Y los tres de cierre (camarero, portero, solo).
  const cierres = NODOS.filter((n) => n.final?.tipo === 'cierre').map((n) => n.id);
  assert.equal(cierres.length, 3);
  for (const g of ['h', 'm'] as const) for (const c of cierres) assert.ok(RECORRIDOS[g].finales.some((f) => f.nodo === c), `${c} (${g})`);
});

test('NINGUNA opcion que presiona lleva a un final bueno, por ningun camino', () => {
  const marcadas = NODOS.flatMap((n) => (n.opciones ?? []).filter((o) => o.etiquetas?.includes('presiona')));
  assert.ok(marcadas.length >= 6, `solo ${marcadas.length} opciones marcadas: el test no probaria nada`);
  for (const g of ['h', 'm'] as const) {
    const malos = RECORRIDOS[g].finales.filter((f) => f.presiono && porId.get(f.nodo)?.final?.tipo === 'bueno');
    assert.deepEqual(malos, [], `jugando de ${g}`);
  }
  // Cada personaje tiene al menos una forma de presionar, y todas acaban en SUS calabazas.
  for (const p of PERSONAS_IDS) {
    const suyas = NODOS.filter((n) => n.id.startsWith(`${p}-`)).flatMap((n) => (n.opciones ?? []).filter((o) => o.etiquetas?.includes('presiona')));
    assert.ok(suyas.length >= 1, `${p}: ninguna opcion que presione`);
    for (const o of suyas) assert.equal(porId.get(o.va)?.final?.tipo, 'calabazas', `${p}: "${o.texto}"`);
  }
});

test('en el final bueno, la propuesta de irse sale de la otra persona: el nodo de antes lo dice ella o el', () => {
  for (const n of NODOS.filter((x) => x.final?.tipo === 'bueno')) {
    const antes = NODOS.filter((x) => x.opciones?.some((o) => o.va === n.id));
    assert.ok(antes.length > 0, n.id);
    for (const a of antes) {
      const habla = a.paginas.filter((p): p is { habla: string; texto: string } => typeof p !== 'string').map((p) => p.habla);
      const nombre = PERSONAS[n.final?.con as PersonaId].nombre;
      assert.ok(habla.includes(nombre), `${a.id}: antes de ${n.id} tiene que proponerlo ${nombre}`);
      assert.ok(!a.opciones?.some((o) => o.va === n.id && o.etiquetas?.includes('presiona')), a.id);
    }
  }
});

/** Todos los textos del guion, con donde estan. */
function textos(): [string, string][] {
  const t: [string, string][] = [];
  const pag = (donde: string, p: Pagina) => t.push([donde, typeof p === 'string' ? p : p.texto]);
  for (const n of NODOS) {
    n.paginas.forEach((p, i) => pag(`${n.id}.paginas[${i}]`, p));
    for (const [i, o] of (n.opciones ?? []).entries()) {
      t.push([`${n.id}.opciones[${i}]`, o.texto]);
      if (o.replica) pag(`${n.id}.opciones[${i}].replica`, o.replica);
    }
    if (n.final) {
      t.push([`${n.id}.titular`, n.final.titular]);
      t.push([`${n.id}.remate`, n.final.remate]);
    }
  }
  return t;
}

test('ninguna variante de genero queda sin texto ni con marcas sueltas', () => {
  let conMarca = 0;
  for (const [donde, texto] of textos()) {
    for (const m of texto.matchAll(/\{([^{}|]*)\|([^{}|]*)\}/g)) {
      conMarca++;
      assert.ok((m[1] as string) !== '' || (m[2] as string) !== '', `${donde}: marca vacia por los dos lados`);
    }
    for (const g of ['h', 'm'] as const) {
      const leido = leer(texto, g);
      assert.ok(leido.trim().length > 0, `${donde} (${g}) vacio`);
      assert.doesNotMatch(leido, /[{}|]/, `${donde} (${g}): queda una marca sin leer: ${leido}`);
    }
  }
  assert.ok(conMarca >= 10, 'casi no hay variantes de genero: el test no probaria nada');
  // Las dos lecturas de verdad son distintas donde hay marca.
  assert.notEqual(leer('cansad{o|a}', 'h'), leer('cansad{o|a}', 'm'));
});

test('los textos caben: paginas de hasta 240 caracteres y opciones de hasta 120 (se pagina, no hay scroll)', () => {
  for (const [donde, texto] of textos()) {
    for (const g of ['h', 'm'] as const) {
      const largo = leer(texto, g).length;
      const tope = donde.includes('.opciones[') && !donde.endsWith('.replica') ? 120 : 240;
      assert.ok(largo <= tope, `${donde} (${g}): ${largo} > ${tope}`);
    }
  }
  // Ningun nodo con mas de 3 opciones salvo la barra (que se pinta como cuadricula de caras).
  for (const n of NODOS) if (!n.barra && n.opciones) assert.ok(n.opciones.length <= 3, `${n.id}: ${n.opciones.length} opciones`);
});

test('toda imagen que nombra el guion existe, generada y en el original', () => {
  for (const n of NODOS) {
    const fondo = n.fondo === 'portal' ? 'exterior-portal' : n.fondo;
    assert.ok(existsSync(`assets/la-penul/fondos/${n.fondo}.jpg`), `${n.id}: falta assets/la-penul/fondos/${n.fondo}.jpg`);
    assert.ok(existsSync(`assets/ultima-ronda/fondos/${fondo}.png`), `${n.id}: falta el original de ${fondo}`);
    if (n.imagen) {
      assert.ok(existsSync(`assets/la-penul/personajes/${n.imagen}.png`), `${n.id}: falta ${n.imagen}`);
      assert.ok(existsSync(`assets/ultima-ronda/personajes/${n.imagen}.png`), `${n.id}: falta el original de ${n.imagen}`);
    }
  }
  // Las seis personas con quien ligar son seis caras distintas, y ni Paco ni Rober.
  const caras = PERSONAS_IDS.map((p) => PERSONAS[p].imagen);
  assert.equal(new Set(caras).size, 6);
  assert.ok(!caras.includes('peep-10') && !caras.includes('peep-47'));
});

test('una partida dura lo que debe: entre 8 y 30 decisiones', () => {
  for (const g of ['h', 'm'] as const) {
    assert.ok(RECORRIDOS[g].profundidadMax <= 30, `${RECORRIDOS[g].profundidadMax}`);
  }
  // El camino mas corto a un final bueno no es un atajo de dos toques.
  const cortos = (desde: string): number => {
    const n = porId.get(desde) as Nodo;
    if (n.final) return n.final.tipo === 'bueno' ? 0 : Infinity;
    return 1 + Math.min(...(n.opciones ?? []).filter((o) => o.va !== BARRA).map((o) => cortos(o.va)));
  };
  for (const p of PERSONAS_IDS) assert.ok(cortos(`${p}-1`) >= 4, `${p}: final bueno demasiado rapido (${cortos(`${p}-1`)})`);
});

test('cada nodo que no es final tiene entre 2 y 3 opciones (la barra aparte)', () => {
  for (const n of NODOS) {
    if (n.final || n.barra) continue;
    const k = n.opciones?.length ?? 0;
    assert.ok(k >= 2 && k <= 3, `${n.id}: ${k} opciones`);
  }
});

test('quien juega siempre puede decir que no antes de irse con alguien', () => {
  // Los finales en los que sales acompanad@: los buenos y el del camarero.
  const conAlguien = new Set(NODOS.filter((n) => n.final?.tipo === 'bueno' || n.id === 'final-camarero').map((n) => n.id));
  assert.ok(conAlguien.has('final-camarero'));
  for (const n of NODOS) {
    const ahi = (n.opciones ?? []).filter((o) => conAlguien.has(o.va));
    if (ahi.length === 0) continue;
    const salida = (n.opciones ?? []).filter((o) => !conAlguien.has(o.va));
    assert.ok(salida.length >= 1, `${n.id}: solo se puede decir que si`);
    // Y quien propone es la otra persona: habla en ese nodo.
    assert.ok(n.paginas.some((p) => typeof p !== 'string'), `${n.id}: nadie lo propone`);
  }
});

test('con Vane, Carmela y Lola, un plural que os incluye a las dos concuerda con quien juega', () => {
  // "Vosotros" con dos mujeres es "vosotras": todo plural que incluya a quien juega lleva marca.
  const masculino = /\b(vosotros|juntos|ocupados|solos|íntimos|cansados|listos|desnudos|nosotros)\b/i;
  for (const n of NODOS.filter((x) => /^(vane|carmela|lola)-/.test(x.id))) {
    const todo = [
      ...n.paginas.map((p) => (typeof p === 'string' ? p : p.texto)),
      ...(n.opciones ?? []).flatMap((o) => [o.texto, o.replica ? (typeof o.replica === 'string' ? o.replica : o.replica.texto) : '']),
      n.final?.titular ?? '',
      n.final?.remate ?? '',
    ];
    for (const t of todo) {
      const sinMarcas = t.replace(/\{[^{}|]*\|[^{}|]*\}/g, '');
      assert.doesNotMatch(sinMarcas, masculino, `${n.id}: "${t}"`);
    }
  }
  // Y la marca de verdad se lee bien: jugando de mujer con Lola, "vosotras".
  const lola = NODOS.find((n) => n.id === 'lola-bueno');
  const texto = lola?.paginas.map((p) => (typeof p === 'string' ? p : p.texto)).join(' ') ?? '';
  assert.match(leer(texto, 'm'), /Vosotras también/);
  assert.match(leer(texto, 'h'), /Vosotros también/);
});

test('despues de que te den largas, insistir es presionar y acaba en calabazas', () => {
  for (const n of NODOS.filter((x) => /-fuera/.test(x.id))) {
    const insistir = (n.opciones ?? []).filter((o) => o.va !== BARRA);
    assert.ok(insistir.length >= 1, n.id);
    for (const o of insistir) {
      assert.ok(o.etiquetas?.includes('presiona'), `${n.id}: "${o.texto}" insiste y no esta marcada`);
      assert.equal(porId.get(o.va)?.final?.tipo, 'calabazas', n.id);
    }
  }
});

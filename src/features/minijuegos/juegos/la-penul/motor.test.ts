import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BARRA, CIERRE, INICIO, NODOS, RONDAS } from './guion.ts';
import { crearMotor, generoDe, leer, leerPagina, type Estado } from './motor.ts';

const motor = crearMotor({ nodos: NODOS, inicio: INICIO, barra: BARRA, cierre: CIERRE, rondas: RONDAS });

/** Lee hasta la ultima pagina y elige la opcion cuyo texto empieza por `inicio`. */
function elegir(e: Estado, inicio: string): Estado {
  let x = e;
  while (!motor.enUltimaPagina(x)) x = motor.siguientePagina(x);
  const o = motor.opciones(x).find((op) => op.texto.startsWith(inicio));
  assert.ok(o, `no hay opcion "${inicio}" en ${x.nodo}: ${motor.opciones(x).map((op) => op.texto).join(' / ')}`);
  return motor.elegir(x, o.indice);
}

test('leer: variantes de genero, tambien frases enteras y lados vacios', () => {
  assert.equal(leer('cansad{o|a}', 'h'), 'cansado');
  assert.equal(leer('cansad{o|a}', 'm'), 'cansada');
  assert.equal(leer('director{|a}', 'h'), 'director');
  assert.equal(leer('director{|a}', 'm'), 'directora');
  assert.equal(leer('{Eres un hombre.|Eres una mujer.} Bien.', 'm'), 'Eres una mujer. Bien.');
  assert.equal(leer('sin marcas', 'h'), 'sin marcas');
  assert.deepEqual(leerPagina({ habla: 'Lola', texto: 'sincer{o|a}' }, 'm'), { habla: 'Lola', texto: 'sincera' });
});

test('el genero sale al azar con semilla: reproducible y de los dos tipos', () => {
  assert.equal(generoDe(42), generoDe(42));
  const vistos = new Set(Array.from({ length: 200 }, (_, s) => generoDe(s)));
  assert.deepEqual([...vistos].sort(), ['h', 'm']);
  // Mas o menos la mitad de cada.
  const hombres = Array.from({ length: 2000 }, (_, s) => generoDe(s)).filter((g) => g === 'h').length;
  assert.ok(hombres > 800 && hombres < 1200, String(hombres));
  assert.equal(motor.empezar(7).genero, generoDe(7));
  assert.equal(motor.empezar(7, 'm').genero, 'm');
});

test('la frase del principio dice el genero', () => {
  assert.match(motor.paginas(motor.empezar(1, 'h'))[0]?.texto ?? '', /eres un hombre/);
  assert.match(motor.paginas(motor.empezar(1, 'm'))[0]?.texto ?? '', /eres una mujer/);
});

test('no se elige sin haber leido todas las paginas', () => {
  let e = elegir(motor.empezar(1, 'h'), 'Entrar');
  assert.equal(e.nodo, 'puerta');
  assert.equal(motor.elegir(e, 0), e, 'en la primera pagina de dos, elegir no hace nada');
  e = motor.siguientePagina(e);
  assert.notEqual(motor.elegir(e, 0), e);
});

test('la replica se ve antes del nodo de destino', () => {
  let e = elegir(motor.empezar(1, 'm'), 'Entrar');
  e = elegir(e, 'A ligar');
  assert.equal(e.nodo, BARRA);
  assert.deepEqual(motor.paginas(e)[0], { habla: 'Rober', texto: 'Por lo menos eres sincera. Pasa, anda.' });
});

test('partida de Lola hasta su final bueno (la conversacion validada)', () => {
  let e = elegir(elegir(motor.empezar(3, 'h'), 'Entrar'), 'A beber');
  e = elegir(e, 'Lola');
  e = elegir(e, 'Vengo a preguntarte');
  e = elegir(e, 'Dame una moneda');
  e = elegir(e, 'Mover la cabeza');
  e = elegir(e, '¿Y qué me vas a dejar');
  assert.equal(e.nodo, 'lola-bueno');
  assert.equal(motor.final(e)?.tipo, 'bueno');
  assert.equal(motor.nodoActual(e).fondo, 'portal');
});

test('a quien ya se lo intentaste sale tachado y no se puede elegir', () => {
  let e = elegir(elegir(motor.empezar(3, 'h'), 'Entrar'), 'A beber');
  e = elegir(e, 'Toni');
  e = elegir(e, '¿Pipas en un bar?');
  e = elegir(e, 'Volver');
  assert.equal(e.nodo, BARRA);
  assert.equal(e.rondas, 1);
  const toni = motor.opciones(e).find((o) => o.persona === 'toni');
  assert.equal(toni?.tachada, true);
  let x = e;
  while (!motor.enUltimaPagina(x)) x = motor.siguientePagina(x);
  assert.equal(motor.elegir(x, toni?.indice ?? -1), x);
});

test('tres rondas y el bar cierra', () => {
  let e = elegir(elegir(motor.empezar(3, 'm'), 'Entrar'), 'A beber');
  for (let i = 0; i < RONDAS; i++) {
    assert.equal(e.nodo, BARRA, `ronda ${i + 1}`);
    e = elegir(e, 'Pedirle otra a Paco');
    e = elegir(e, 'Solo la caña');
  }
  assert.equal(e.rondas, RONDAS);
  assert.equal(e.nodo, CIERRE);
  assert.equal(elegir(e, 'Ayudar a Paco').nodo, 'camarero');
  assert.equal(elegir(e, 'Esperar a que Rober').nodo, 'final-portero');
  const solo = elegir(e, 'Irte a casa');
  assert.equal(motor.final(solo)?.titular, 'SOL{O|A}, PERO CON KEBAB');
  assert.equal(leer(motor.final(solo)?.titular ?? '', solo.genero), 'SOLA, PERO CON KEBAB');
});

test('presionar acaba en calabazas en el acto', () => {
  let e = elegir(elegir(motor.empezar(3, 'h'), 'Entrar'), 'A beber');
  e = elegir(e, 'Lola');
  e = elegir(e, '¡Paco, dos chupitos');
  assert.equal(motor.final(e)?.tipo, 'calabazas');
  assert.equal(motor.final(e)?.con, 'lola');
});

test('en un final no hay nada que elegir', () => {
  let e = elegir(elegir(motor.empezar(3, 'h'), 'Entrar'), 'A beber');
  e = elegir(elegir(e, 'Lola'), '¡Paco, dos chupitos');
  while (!motor.enUltimaPagina(e)) e = motor.siguientePagina(e);
  assert.deepEqual(motor.opciones(e), []);
  assert.equal(motor.elegir(e, 0), e);
  assert.equal(motor.siguientePagina(e), e);
});

test('mientras se lee la replica sale quien la dice, aunque el destino sea la barra', () => {
  let e = elegir(elegir(motor.empezar(3, 'h'), 'Entrar al bar'), 'A beber');
  assert.equal(e.nodo, BARRA);
  assert.equal(motor.leyendoReplica(e), true);
  assert.equal(motor.imagen(e), 'peep-47', 'Rober dice "Respuesta correcta" en la barra');
  e = motor.siguientePagina(e);
  assert.equal(motor.leyendoReplica(e), false);
  assert.equal(motor.imagen(e), null, 'la barra no tiene a nadie delante');
});

test('el camarero pregunta y quien juega decide', () => {
  let e = elegir(elegir(motor.empezar(3, 'm'), 'Entrar al bar'), 'A beber');
  for (let i = 0; i < RONDAS; i++) e = elegir(elegir(e, 'Pedirle otra a Paco'), 'Solo la caña');
  e = elegir(e, 'Ayudar a Paco');
  assert.equal(e.nodo, 'camarero');
  assert.equal(motor.final(e), null, 'ayudar a recoger todavia no es un final');
  assert.equal(elegir(e, 'Gracias, Paco').nodo, 'final-solo');
  assert.equal(elegir(e, '¿Tu sofá tiene manta?').nodo, 'final-camarero');
});

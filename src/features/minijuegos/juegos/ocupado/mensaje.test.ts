import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatoTiempo,
  leerMensajeOcupado,
  origenDe,
  puntuacionOcupado,
  resultadoOcupado,
  URL_OCUPADO_POR_DEFECTO,
  urlOcupado,
} from './mensaje.ts';

const ORIGEN = 'https://weleloable.github.io';
const bueno = { tipo: 'ocupado:fin', version: 1, final: 'door', segundos: 612.4, temperatura: 9.3, pistas: 2 };

test('la URL por defecto es la web publicada del juego, y su origen es el de GitHub Pages', () => {
  assert.equal(urlOcupado(undefined), URL_OCUPADO_POR_DEFECTO);
  assert.equal(urlOcupado(''), URL_OCUPADO_POR_DEFECTO);
  assert.equal(urlOcupado('javascript:alert(1)'), URL_OCUPADO_POR_DEFECTO);
  assert.equal(urlOcupado('http://127.0.0.1:5175/'), 'http://127.0.0.1:5175/');
  assert.equal(urlOcupado(' http:foo '), 'http://foo/');
  assert.equal(origenDe(URL_OCUPADO_POR_DEFECTO), ORIGEN);
  assert.equal(origenDe('http://127.0.0.1:5175/index.html?x=1'), 'http://127.0.0.1:5175');
});

test('una URL rota cae a la de siempre, y su origen siempre se puede sacar (si lanzase, caia la pestana de juegos)', () => {
  for (const rota of ['https://', 'http://a b', 'http://[', 'data:text/html,hola', 'ftp://x.example/', '  ']) {
    assert.equal(urlOcupado(rota), URL_OCUPADO_POR_DEFECTO, rota);
    assert.doesNotThrow(() => origenDe(urlOcupado(rota)), rota);
  }
});

test('nunca lanza, aunque los datos lo intenten (un getter que revienta)', () => {
  const trampa = { ...bueno };
  Object.defineProperty(trampa, 'temperatura', { get: () => { throw new Error('boom'); } });
  assert.equal(leerMensajeOcupado(ORIGEN, ORIGEN, trampa), null);
  assert.equal(leerMensajeOcupado(ORIGEN, ORIGEN, new Proxy({}, { get: () => { throw new Error('boom'); } })), null);
});

test('acepta el mensaje del juego tal como lo manda (el de app_bridge.gd)', () => {
  assert.deepEqual(leerMensajeOcupado(ORIGEN, ORIGEN, bueno), { final: 'door', segundos: 612.4, temperatura: 9.3, pistas: 2 });
  assert.equal(leerMensajeOcupado(ORIGEN, ORIGEN, { ...bueno, final: 'flood' })?.final, 'flood');
});

test('de OTRO origen no se acepta nada, aunque el mensaje sea perfecto (si no, cualquiera se regala un record)', () => {
  assert.equal(leerMensajeOcupado('https://evil.example', ORIGEN, bueno), null);
  assert.equal(leerMensajeOcupado('https://weleloable.github.io.evil.example', ORIGEN, bueno), null);
  assert.equal(leerMensajeOcupado('null', ORIGEN, bueno), null);
});

test('ignora lo que no es el aviso de fin o no tiene sentido', () => {
  for (const roto of [
    null,
    'ocupado:fin',
    42,
    { ...bueno, tipo: 'otra-cosa' },
    { ...bueno, version: 2 },
    { ...bueno, final: 'ventana' },
    { ...bueno, segundos: -1 },
    { ...bueno, segundos: Number.NaN },
    { ...bueno, segundos: 1e9 },
    { ...bueno, temperatura: 1 },
    { ...bueno, temperatura: 999 },
    { ...bueno, temperatura: '9' },
    { ...bueno, pistas: 1.5 },
    { ...bueno, pistas: -1 },
    { ...bueno, pistas: 1000 },
  ]) {
    assert.equal(leerMensajeOcupado(ORIGEN, ORIGEN, roto), null, JSON.stringify(roto));
  }
});

test('puntos: 2 °C = 100, cada grado resta 4, nunca baja de 0 ni pasa de 100', () => {
  assert.equal(puntuacionOcupado(2), 100);
  assert.equal(puntuacionOcupado(4.1), 92);
  assert.equal(puntuacionOcupado(8), 76);
  assert.equal(puntuacionOcupado(14), 52);
  assert.equal(puntuacionOcupado(20), 28);
  assert.equal(puntuacionOcupado(27), 0);
  assert.equal(puntuacionOcupado(60), 0);
  assert.equal(puntuacionOcupado(0), 100);
});

test('puntos: mas fria, mas puntos (nunca al reves)', () => {
  let anterior = Infinity;
  for (let t = 2; t <= 30; t += 0.1) {
    const p = puntuacionOcupado(t);
    assert.ok(p <= anterior, `${t}`);
    anterior = p;
  }
});

test('el resultado lleva los puntos y los datos de la partida, redondeados', () => {
  assert.deepEqual(resultadoOcupado({ final: 'flood', segundos: 612.4, temperatura: 9.34, pistas: 2 }), {
    juego: 'ocupado',
    puntuacion: 71,
    detalles: { final: 'flood', segundos: 612, temperatura: 9.3, pistas: 2 },
  });
});

test('tiempo en m:ss', () => {
  assert.equal(formatoTiempo(0), '0:00');
  assert.equal(formatoTiempo(754), '12:34');
  assert.equal(formatoTiempo(59.6), '1:00');
  assert.equal(formatoTiempo(-3), '0:00');
});

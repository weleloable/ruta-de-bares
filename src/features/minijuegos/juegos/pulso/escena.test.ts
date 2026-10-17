import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AVISO_EMPUJON, AVISO_ESQUIVA, crearRecorrido, empuje, RONDAS, type Recorrido } from './modelo.ts';
import { camara as camaraDe, escala, HORIZONTE, obstaculos as obstaculosDe, proyectar, SALIDA } from './escena.ts';

const MARCO = { ancho: 360, alto: 330 };
const LEJOS = AVISO_ESQUIVA;
const AVISOS = { esquiva: AVISO_ESQUIVA, empujon: AVISO_EMPUJON };
const obstaculos = (rec: Recorrido, t: number) => obstaculosDe(rec, t, AVISOS);
const camara = (rec: Recorrido, t: number) => camaraDe(empuje(rec, t), (RONDAS[rec.ronda] as { empuje: number }).empuje);
const unaEsquiva = (lado: 1 | -1): Recorrido => ({ ronda: 1, esquivas: [{ t: 10, lado, nitidez: 1 }], empujones: [] });

describe('la perspectiva', () => {
  it('lo lejano es pequeno y lo cercano grande, sin saltos, y 1 en la bandeja', () => {
    assert.equal(escala(0), 1);
    let anterior = 0;
    for (let z = LEJOS; z >= 0; z -= 0.05) {
      const e = escala(z);
      assert.ok(e > anterior, `no crece en z=${z}`);
      anterior = e;
    }
    assert.ok(escala(LEJOS) < 0.25 && escala(LEJOS) > 0.1, `a ${LEJOS} s se ve a ${escala(LEJOS)}`);
    assert.ok(escala(-0.3) > 1, 'ya pasado, mayor que 1: se sale por abajo');
  });

  it('los pies bajan del horizonte al suelo segun se acerca, y se centra si no hay lateral ni giro', () => {
    const lejos = proyectar({ z: LEJOS, lateral: 0 }, MARCO, 0, 150);
    const cerca = proyectar({ z: 0, lateral: 0 }, MARCO, 0, 150);
    assert.ok(Math.abs(lejos.y - MARCO.alto * HORIZONTE) < MARCO.alto * 0.3);
    assert.ok(lejos.y < cerca.y);
    assert.ok(cerca.y <= MARCO.alto);
    assert.equal(lejos.x, MARCO.ancho / 2);
    assert.equal(cerca.x, MARCO.ancho / 2);
  });

  it('el lateral se abre al acercarse (parallax): lo mismo a un lado se ve mas lejos del centro cuanto mas cerca', () => {
    const l = proyectar({ z: LEJOS, lateral: 1 }, MARCO, 0, 150).x - 180;
    const c = proyectar({ z: 0, lateral: 1 }, MARCO, 0, 150).x - 180;
    assert.ok(c > l && l > 0);
  });
});

describe('la camara y los obstaculos', () => {
  it('girar a la derecha mueve la camara a la derecha (el mundo se desliza a la izquierda) cuando la bandeja cae a la izquierda', () => {
    for (const lado of [1, -1] as const) {
      const rec = unaEsquiva(lado);
      let pico = 0;
      let empujePico = 0;
      for (let t = 10; t < 13; t += 0.01) {
        if (Math.abs(camara(rec, t)) > Math.abs(pico)) {
          pico = camara(rec, t);
          empujePico = empuje(rec, t);
        }
      }
      assert.equal(Math.sign(pico), lado, 'la camara va del lado hacia el que se gira');
      assert.equal(Math.sign(empujePico), -lado, 'y la bandeja, al contrario');
    }
  });

  it('una esquiva se ve desde 2 s antes hasta justo despues de pasar, y el obstaculo esta del lado contrario al giro', () => {
    for (const lado of [1, -1] as const) {
      const rec = unaEsquiva(lado);
      assert.equal(obstaculos(rec, 10 - AVISO_ESQUIVA - 0.01).length, 0);
      const visto = obstaculos(rec, 10 - AVISO_ESQUIVA + 0.01);
      assert.equal(visto.length, 1);
      assert.equal(Math.sign(visto[0]?.lateral as number), -lado);
      assert.equal(obstaculos(rec, 10 + SALIDA - 0.01).length, 1);
      assert.equal(obstaculos(rec, 10 + SALIDA + 0.01).length, 0);
    }
  });

  it('el cliente que roza solo se ve los ultimos 0,3 s y entra por su lado', () => {
    const rec: Recorrido = { ronda: 2, esquivas: [], empujones: [{ t: 20, lado: -1, grados: 9 }] };
    assert.equal(obstaculos(rec, 20 - AVISO_EMPUJON - 0.01).length, 0);
    const o = obstaculos(rec, 20 - 0.2)[0];
    assert.ok(o?.roce);
    assert.equal(Math.sign(o?.lateral as number), -1);
    // Y se acerca al centro mientras llega.
    const antes = Math.abs(obstaculos(rec, 20 - 0.25)[0]?.lateral as number);
    const despues = Math.abs(obstaculos(rec, 20 - 0.05)[0]?.lateral as number);
    assert.ok(despues < antes);
    assert.ok(AVISO_EMPUJON < AVISO_ESQUIVA / 4, 'el empujon se ve mucho menos tiempo que una esquiva');
  });

  it('salen ordenados de lejos a cerca y con claves estables de un fotograma al siguiente', () => {
    const rec = crearRecorrido(2, 321);
    for (let t = 3; t < 33; t += 0.5) {
      const lista = obstaculos(rec, t);
      for (let i = 1; i < lista.length; i++) assert.ok((lista[i - 1] as { z: number }).z >= (lista[i] as { z: number }).z);
      const otra = obstaculos(rec, t + 0.016);
      for (const o of lista) if (o.z - 0.016 > -SALIDA + 0.02) assert.ok(otra.some((x) => x.clave === o.clave), `se pierde ${o.clave} en t=${t}`);
    }
    assert.equal(new Set(RONDAS.map((_, r) => crearRecorrido(r, 1).esquivas.length)).size > 1, true);
  });

  it('con la bandeja en reposo no hay nada que ver y la camara esta centrada', () => {
    const vacio: Recorrido = { ronda: 0, esquivas: [], empujones: [] };
    assert.deepEqual(obstaculos(vacio, 5), []);
    assert.equal(camara(vacio, 5), 0);
  });
});

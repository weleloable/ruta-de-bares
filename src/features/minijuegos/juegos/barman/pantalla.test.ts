import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ANCHO_MAXIMO, BOTON_ALTO_MAXIMO, CLIENTE_MAXIMO, LADO_MINIMO_BOTON, repartir } from './pantalla.ts';

test('cabe en 740, 808 y 915 de alto y en 360, 390 y 412 de ancho, con botones comodos', () => {
  for (const ancho of [360, 390, 412]) {
    for (const alto of [740, 808, 915]) {
      const r = repartir(ancho, alto);
      assert.ok(r.cabe, `${ancho}x${alto}: ${JSON.stringify(r)}`);
      assert.ok(r.total <= alto, `${ancho}x${alto}: mide ${r.total}`);
      assert.ok(r.botonAncho >= LADO_MINIMO_BOTON && r.botonAlto >= LADO_MINIMO_BOTON);
      assert.ok(r.icono >= 32, `${ancho}x${alto}: icono de ${r.icono}`);
    }
  }
  // A 360 x 740, lo que se le enseno al usuario: botones de ~76 x 64.
  const r = repartir(360, 740);
  assert.equal(r.botonAncho, 76);
  assert.equal(r.botonAlto, 64);
});

test('en tablet o PC no se pasa de grande', () => {
  const r = repartir(1400, 1000);
  assert.ok(r.ancho <= ANCHO_MAXIMO);
  assert.ok(r.botonAlto <= BOTON_ALTO_MAXIMO);
  assert.ok(r.alturaCliente <= CLIENTE_MAXIMO);
  assert.ok(r.cabe);
});

test('por debajo de lo razonable lo dice (no cabe), en vez de montar los botones encima', () => {
  assert.equal(repartir(360, 560).cabe, false);
  assert.equal(repartir(200, 740).cabe, false);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { ALTURA_SALIDA, CABEZA, ficha } from '../src/features/minijuegos/juegos/tapon/modelo.ts';
import { DIBUJADO_CON, LARGO_BRAZO, PIVOTE, SPRITES } from '../src/features/minijuegos/juegos/tapon/spritesGeometria.ts';

/**
 * Los dibujos de Tapon al Vuelo (assets/tapon/, scripts/generar-sprites-tapon.py)
 * tienen que cuadrar con la fisica: la boca que se ve es la que choca. Si alguien
 * cambia una medida en modelo.ts y no regenera, o retoca un PNG a mano, esto falla.
 */

const FICHEROS: Record<keyof typeof SPRITES, string> = {
  vaso: 'vaso.png',
  jarra: 'jarra.png',
  caja: 'caja.png',
  camarero: 'camarero.png',
  base: 'catapulta-base.png',
  brazo: 'catapulta-brazo.png',
  chapa: 'chapa.png',
};

/** Ancho y alto de un PNG, de su cabecera IHDR. */
function medidaPng(ruta: string): [number, number] {
  const b = readFileSync(ruta);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${ruta} no es un PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('dibujos de Tapon al Vuelo', () => {
  it('cada PNG existe y mide lo que dice la geometria generada', () => {
    for (const [nombre, fichero] of Object.entries(FICHEROS) as [keyof typeof SPRITES, string][]) {
      assert.deepEqual(medidaPng(`assets/tapon/${fichero}`), [...SPRITES[nombre].px], nombre);
    }
  });

  it('se dibujaron con las medidas de la fisica (si no, regenerar)', () => {
    for (const id of ['vaso', 'jarra', 'caja'] as const) {
      const f = ficha(id);
      const d = DIBUJADO_CON[id];
      assert.deepEqual([d.boca, d.ancho, d.alto], [f.boca, f.ancho, f.alturaBoca], id);
    }
    assert.deepEqual([DIBUJADO_CON.oreja.boca, DIBUJADO_CON.oreja.alto], [ficha('oreja').boca, ficha('oreja').alturaBoca]);
    assert.deepEqual(DIBUJADO_CON.cabeza, CABEZA);
    assert.equal(DIBUJADO_CON.alturaSalida, ALTURA_SALIDA);
  });

  it('la cuchara de la catapulta, en reposo, esta justo donde sale la chapa', () => {
    assert.ok(Math.abs(LARGO_BRAZO - Math.hypot(-PIVOTE.x, ALTURA_SALIDA - PIVOTE.y)) < 1e-5);
  });

  it('pesan poco: la app no se hincha por un minijuego', () => {
    let total = 0;
    for (const f of [...Object.values(FICHEROS), 'fondo.jpg', 'barra.jpg']) total += readFileSync(`assets/tapon/${f}`).length;
    assert.ok(total < 300_000, `${total} bytes`);
  });
});

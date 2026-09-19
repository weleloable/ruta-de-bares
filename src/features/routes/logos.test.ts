import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { CATALOGO_BARES } from './catalogo.ts';

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const CARPETA = join(RAIZ, 'assets', 'bares');
// logos.ts no se importa: hace require() de .png, que Node no sabe abrir. Se lee como texto.
const fuenteLogos = readFileSync(join(import.meta.dirname, 'logos.ts'), 'utf8');

/** Ids con entrada en LOGOS y la ruta que cada uno requiere. */
function entradasDeLogos(): Map<string, string> {
  const entradas = new Map<string, string>();
  for (const m of fuenteLogos.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*require\('([^']+)'\)/gm)) {
    entradas.set(m[1], m[2]);
  }
  return entradas;
}

describe('logos de los bares', () => {
  const entradas = entradasDeLogos();

  it('cada bar del catalogo tiene entrada en LOGOS', () => {
    for (const bar of CATALOGO_BARES) {
      assert.ok(entradas.has(bar.id), `${bar.id} no esta en logos.ts`);
    }
  });

  it('LOGOS no tiene entradas huerfanas', () => {
    const ids = new Set(CATALOGO_BARES.map((b) => b.id));
    for (const id of entradas.keys()) assert.ok(ids.has(id), `${id} sobra en logos.ts`);
  });

  it('cada require apunta a assets/bares/<id>.png y el fichero existe', () => {
    for (const [id, ruta] of entradas) {
      assert.equal(ruta, `../../../assets/bares/${id}.png`, id);
      assert.ok(existsSync(join(CARPETA, `${id}.png`)), `falta assets/bares/${id}.png`);
    }
  });

  it('no hay pngs sueltos en assets/bares sin bar en el catalogo', () => {
    const ids = new Set(CATALOGO_BARES.map((b) => b.id));
    for (const f of readdirSync(CARPETA)) {
      assert.ok(ids.has(f.replace(/\.png$/, '')), `${f} sobra`);
    }
  });

  it('cada fichero es un PNG cuadrado y ligero (se pinta a 36-44 px)', () => {
    for (const bar of CATALOGO_BARES) {
      const buf = readFileSync(join(CARPETA, `${bar.id}.png`));
      assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${bar.id} no es PNG`);
      const ancho = buf.readUInt32BE(16);
      const alto = buf.readUInt32BE(20);
      assert.equal(ancho, alto, `${bar.id} no es cuadrado`);
      assert.ok(ancho >= 128 && ancho <= 512, `${bar.id} mide ${ancho}px`);
      assert.ok(buf.length < 200 * 1024, `${bar.id} pesa ${buf.length} bytes`);
    }
  });
});

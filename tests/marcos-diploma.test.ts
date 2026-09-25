import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Marcos del diploma (marcos.tsx). Importa react-native, asi que no se puede
 * cargar en Node: se lee el codigo y se comprueba que las tres tablas
 * (lista, medidas y figuras) hablan de las mismas variantes, y que las medidas
 * son razonables.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const codigo = readFileSync(join(raiz, 'src/features/diploma/marcos.tsx'), 'utf8').replace(/\r\n/g, '\n');

const variantes = /VARIANTES_MARCO: readonly VarianteMarco\[\] = \[([\s\S]*?)\];/.exec(codigo)?.[1].match(/'(\w+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
const medidas = [...(/MEDIDAS_MARCO[^=]*= \{([\s\S]*?)\n\};/.exec(codigo)?.[1] ?? '').matchAll(/(\w+): \{ relleno: (\d+), margenMapa: (\d+), fondo: (\d+) \}/g)].map((m) => ({
  nombre: m[1],
  relleno: Number(m[2]),
  margenMapa: Number(m[3]),
  fondo: Number(m[4]),
}));
// El tipo de FIGURAS lleva una flecha (`() => ReactNode`), asi que se busca el `> = {` que lo cierra.
const figuras = [...(/const FIGURAS[^\n]*> = \{([\s\S]*?)\n\};/.exec(codigo)?.[1] ?? '').matchAll(/(\w+): \w+,/g)].map((m) => m[1]);

describe('marcos del diploma', () => {
  it('hay siete variantes, con el friso de tercios entre ellas', () => {
    assert.equal(variantes.length, 7);
    assert.ok(variantes.includes('tercios'));
  });

  it('cada variante tiene sus medidas y su figura, y no sobra ninguna', () => {
    assert.deepEqual([...variantes].sort(), medidas.map((m) => m.nombre).sort());
    assert.deepEqual([...variantes].sort(), [...figuras].sort());
  });

  it('las medidas son razonables: dejan sitio al contenido y al mapa', () => {
    for (const m of medidas) {
      assert.ok(m.relleno >= 10 && m.relleno <= 44, `${m.nombre} relleno ${m.relleno}`);
      assert.ok(m.margenMapa >= 16 && m.margenMapa <= 44, `${m.nombre} margenMapa ${m.margenMapa}`);
      assert.ok(m.fondo >= 6 && m.fondo <= m.margenMapa + 6, `${m.nombre} fondo ${m.fondo}`);
    }
  });

  it('el friso de tercios lleva doce botellas arriba y doce abajo', () => {
    const tercios = /function Tercios\(\)[\s\S]*?\n\}\n/.exec(codigo)?.[0] ?? '';
    assert.equal((tercios.match(/<Fila n=\{12\}/g) ?? []).length, 2);
    assert.match(tercios, /<Tercio alto=/);
  });

  it('las figuras no reciben toques y no dependen de imagenes (solo Views)', () => {
    assert.match(codigo, /<View pointerEvents="none" style=\{abs\}>/);
    assert.doesNotMatch(codigo, /require\(|from 'expo-image'|Image\b/);
  });
});

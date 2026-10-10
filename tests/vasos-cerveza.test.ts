import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { MALTAS } from '../src/features/minijuegos/juegos/maestro/datos.ts';

/**
 * Los vasos de Maestro Cervecero son imagenes (assets/vasos/<malta>.png, de
 * scripts/generar-vasos-cerveza.py), una por malta.
 *
 * Red rapida y PARCIAL (lee el codigo y las cabeceras PNG, no pinta nada): si se
 * anade una malta sin su vaso, el `require` falla al empaquetar, pero si falta
 * en el mapa solo se ve la palida en su lugar, y eso no da error.
 */
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

/** Ancho, alto y tipo de color de un PNG, de su cabecera IHDR. */
function cabeceraPng(ruta: string) {
  const b = readFileSync(ruta);
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', ruta);
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), tipoColor: b[25] };
}

describe('vasos de cerveza', () => {
  const vaso = leer('src/features/minijuegos/juegos/maestro/VasoCerveza.tsx');

  it('cada malta tiene su vaso en el mapa y su fichero en assets/vasos', () => {
    for (const malta of MALTAS) {
      assert.match(vaso, new RegExp(`${malta.id}: require\\('\\.\\./\\.\\./\\.\\./\\.\\./\\.\\./assets/vasos/${malta.id}\\.png'\\)`), malta.id);
      assert.ok(existsSync(`assets/vasos/${malta.id}.png`), malta.id);
    }
  });

  it('cada vaso es un PNG con canal alfa (sin fondo beige pegado) y de tamano util', () => {
    for (const malta of MALTAS) {
      const { ancho, alto, tipoColor } = cabeceraPng(`assets/vasos/${malta.id}.png`);
      assert.equal(tipoColor, 6, `${malta.id}: no es RGBA`);
      assert.ok(alto >= 200 && ancho >= 100, `${malta.id}: ${ancho}x${alto}`);
      assert.ok(alto > ancho, `${malta.id}: un vaso es mas alto que ancho`);
    }
  });

  it('una malta desconocida pinta la palida y no deja hueco', () => {
    assert.match(vaso, /VASOS\[malta as MaltaId\] \?\? VASOS\.palida/);
  });

  it('los tres sitios que pintan un vaso le pasan la malta, no un color', () => {
    for (const f of [
      'src/features/minijuegos/juegos/maestro/MaestroCervecero.tsx',
      'src/features/minijuegos/juegos/maestro/ResultadoCerveza.tsx',
      'src/features/minijuegos/ListaCervezas.tsx',
    ]) {
      const fuente = leer(f);
      assert.match(fuente, /<VasoCerveza malta=\{/, f);
      assert.doesNotMatch(fuente, /<VasoCerveza color=/, f);
    }
  });

  it('el generador y su fuente estan en el repo, para poder rehacerlos', () => {
    assert.ok(existsSync('scripts/generar-vasos-cerveza.py'));
    assert.ok(existsSync('scripts/vasos-cerveza/fuente.jpg'));
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Red rapida y PARCIAL (lee el codigo, no lo ejecuta) para el cableado de 0035:
 * el logo de un bar propio viaja de `catalog_bars` a `route_bars.logo` y de ahi
 * a cada sitio que pinta una parada. Si alguien quita un eslabon no hay error:
 * el jugador ve un sello con iniciales, que es exactamente el bug que se arreglo.
 */
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

describe('el logo llega a los jugadores', () => {
  it('saveBar escribe el logo en la parada', () => {
    assert.match(leer('src/features/routes/api.ts'), /logo: input\.logo/);
  });

  it('el formulario de bar copia el logo del catalogo y conserva el de una parada ya guardada', () => {
    const bar = leer('app/editor/[routeId]/bar.tsx');
    assert.match(bar, /logo: bar\.logoUri \?\? null/);
    assert.match(bar, /logo: existente\.logo/);
    assert.match(bar, /logo: elegido\.logo/);
  });

  it('cada sitio que pinta una parada de la ruta le pasa su logo a BarLogo', () => {
    assert.match(leer('src/components/StampSeal.tsx'), /<BarLogo nombre=\{name\} logo=\{logo\}/);
    assert.match(leer('src/features/diploma/MapaEstatico.tsx'), /<BarLogo nombre=\{paradas\[i\]\.nombre\} logo=\{paradas\[i\]\.logo\}/);
    assert.match(leer('app/editor/[routeId]/index.tsx'), /<BarLogo nombre=\{bar\.name\} logo=\{bar\.logo\}/);
    const sellos = leer('app/(tabs)/index.tsx');
    assert.match(sellos, /logo=\{bar\.logo\}/);
    assert.match(sellos, /logo: b\.logo/);
  });

  it('el logo de la parada manda sobre el del catalogo y este sobre el de assets/', () => {
    assert.match(leer('src/features/routes/BarLogo.tsx'), /uri \?\? logo \?\? bar\?\.logoUri/);
  });
});

describe('el catalogo ya no vive en el dispositivo', () => {
  it('guardarBarPropio no escribe en AsyncStorage (solo lo lee y lo borra para migrar)', () => {
    const store = leer('src/features/routes/catalogoStore.ts');
    assert.doesNotMatch(store, /AsyncStorage\.setItem/);
    assert.match(store, /crearBarCompartido/);
  });
});

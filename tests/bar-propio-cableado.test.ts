import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Cableado del alta de "un bar que no esta en la lista".
 *
 * Guardia de lectura de codigo, como navegacion-atras.test.ts: la logica pura
 * (validar, leer, fusionar) tiene sus tests en catalogoPropio.test.ts, pero las
 * uniones entre pantallas solo se ven de verdad en un navegador, y son faciles
 * de romper sin que ninguna prueba se entere. Comprobado en Chrome: el
 * desplegable arranca cerrado, "Otro bar" va a la pantalla nueva, y un bar
 * guardado sobrevive a recargar la pagina.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) =>
  readFileSync(join(raiz, ruta), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('desplegable de bares', () => {
  const selector = leer('src/features/routes/SelectorBar.tsx');

  it('arranca cerrado, tambien cuando aun no hay bar elegido', () => {
    assert.match(selector, /useState\(false\)/);
    assert.doesNotMatch(selector, /useState\(\s*elegido\s*===\s*null\s*\)/);
  });

  it('ofrece "Otro bar" fuera del scroll, para que no se pierda al final de la lista', () => {
    const scroll = selector.slice(selector.indexOf('<ScrollView'), selector.indexOf('</ScrollView>'));
    assert.ok(scroll.length > 0);
    assert.doesNotMatch(scroll, /onNuevo/);
    assert.match(selector, /onNuevo\(\)/);
  });
});

describe('alta de un bar propio', () => {
  it('la pantalla nueva esta registrada en el layout raiz', () => {
    assert.ok(leer('app/_layout.tsx').includes('name="editor/[routeId]/bar-nuevo"'));
  });

  it('el formulario de bar navega a ella y recoge el bar recien creado al volver', () => {
    const bar = leer('app/editor/[routeId]/bar.tsx');
    assert.match(bar, /onNuevo=\{[^}]*bar-nuevo/);
    assert.match(bar, /useFocusEffect/);
    assert.match(bar, /consumirUltimoCreado\(\)/);
  });

  it('la pantalla nueva guarda por catalogoStore y vuelve atras', () => {
    const nuevo = leer('app/editor/[routeId]/bar-nuevo.tsx');
    assert.match(nuevo, /guardarBarPropio\(/);
    assert.match(nuevo, /router\.back\(\)/);
  });

  it('el formulario de bar lee el catalogo vivo, no la constante: si no, los propios no salen', () => {
    const bar = leer('app/editor/[routeId]/bar.tsx');
    assert.match(bar, /useCatalogo\(\)/);
    assert.doesNotMatch(bar, /CATALOGO_BARES/);
  });

  it('BarLogo tambien lee el catalogo vivo: los logos propios salen en Sellos, Ruta y el editor', () => {
    assert.match(leer('src/features/routes/BarLogo.tsx'), /useCatalogo\(\)/);
  });

  it('el almacen espera a leer antes de escribir, o guardar machacaria lo que ya habia', () => {
    const store = leer('src/features/routes/catalogoStore.ts');
    const cuerpo = store.slice(store.indexOf('export async function guardarBarPropio'));
    assert.ok(cuerpo.indexOf('await cargar()') > -1, 'guardarBarPropio no espera a cargar()');
    assert.ok(cuerpo.indexOf('await cargar()') < cuerpo.indexOf('setItem'), 'espera despues de escribir');
  });

  it('el almacen solo publica en memoria DESPUES de guardar en el dispositivo', () => {
    const store = leer('src/features/routes/catalogoStore.ts');
    const cuerpo = store.slice(store.indexOf('export async function guardarBarPropio'));
    assert.ok(cuerpo.indexOf('setItem') < cuerpo.indexOf('publicar(nuevos)'));
  });
});

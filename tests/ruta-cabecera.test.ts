import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Cabecera de Ruta: los enlaces de Instagram y Social a la derecha (donde estuvo
 * el boton de Sellos) y la atribucion del mapa.
 *
 * Guardia de lectura de codigo, como barra-superior.test.ts: el comportamiento
 * de verdad se ve en un navegador, pero estas uniones son faciles de romper sin
 * que nada falle:
 *  - Sellos vuelve a tener su pestana abajo, asi que Ruta ya NO lleva el boton
 *    de Sellos (dos accesos al mismo sitio confunden).
 *  - La atribucion de OpenStreetMap es un REQUISITO de su licencia y de las
 *    condiciones de las teselas: puede no ser un enlace pero no desaparecer.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const sinComentarios = (ruta: string) =>
  readFileSync(join(raiz, ruta), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const ruta = sinComentarios('app/(tabs)/ruta.tsx');

describe('Ruta: ya no lleva el boton de Sellos', () => {
  it('no navega a "/" ni pinta el texto "Sellos" como boton', () => {
    assert.doesNotMatch(ruta, /router\.navigate/);
    assert.doesNotMatch(ruta, /botonSellos/);
    assert.doesNotMatch(ruta, />Sellos</);
  });

  it('ya no importa el router ni Ionicons (no los usa)', () => {
    assert.doesNotMatch(ruta, /useRouter/);
    assert.doesNotMatch(ruta, /Ionicons/);
  });
});

describe('Ruta: los enlaces ocupan el sitio del boton de Sellos', () => {
  const cabecera = ruta.slice(ruta.indexOf('style={styles.cabecera}'), ruta.indexOf('{error ?'));

  it('<EnlacesRuta /> esta en la cabecera, DESPUES del bloque de texto (a la derecha)', () => {
    const texto = cabecera.indexOf('styles.cabeceraTexto');
    const enlaces = cabecera.indexOf('<EnlacesRuta />');
    assert.ok(texto > 0 && enlaces > 0, 'falta el bloque de texto o EnlacesRuta en la cabecera');
    assert.ok(texto < enlaces, 'los enlaces tienen que ir DESPUES del texto para quedar a la derecha');
  });

  it('la cabecera es una fila y el texto se recorta antes que los enlaces (minWidth 0)', () => {
    assert.match(ruta, /cabecera:\s*\{[\s\S]*?flexDirection:\s*'row'/);
    assert.match(ruta, /cabeceraTexto:\s*\{[^}]*minWidth:\s*0/);
  });

  it('importa el componente', () => {
    assert.match(ruta, /import \{ EnlacesRuta \} from '\.\.\/\.\.\/src\/features\/routes\/EnlacesRuta'/);
  });
});

describe('Atribucion de OpenStreetMap en la cabecera de Ruta', () => {
  it('sigue VISIBLE en web: es un requisito de la licencia, no un adorno', () => {
    assert.match(ruta, /Mapa:\s*©\s*OpenStreetMap/);
    assert.match(ruta, /Platform\.OS\s*===\s*'web'/);
  });

  it('pero no es un enlace: no abre la web de OpenStreetMap con un toque torcido', () => {
    assert.doesNotMatch(ruta, /Linking/);
    assert.doesNotMatch(ruta, /openURL/);
    assert.doesNotMatch(ruta, /OSM_COPYRIGHT_URL/);
    assert.doesNotMatch(ruta, /openstreetmap\.org/);
    const atribucion = ruta.slice(ruta.indexOf('styles.atribucion') - 40, ruta.indexOf('Mapa:') + 40);
    assert.doesNotMatch(atribucion, /accessibilityRole="link"/);
    assert.doesNotMatch(atribucion, /onPress/);
  });
});

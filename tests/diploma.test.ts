import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Medalla animada -> diploma vertical para Instagram. Sin renderizador en el
 * repo, se vigila el cableado por codigo.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('pantalla Sellos', () => {
  const codigo = sinComentarios(leer('app/(tabs)/index.tsx'));

  it('pulsar la medalla abre el diploma', () => {
    assert.match(codigo, /<Medalla onPress=\{\(\) => setDiplomaAbierto\(true\)\} \/>/);
  });

  it('el diploma solo existe con la credencial completa y con los datos de la persona y la ruta', () => {
    const bloque = /credencialCompleta\(conseguidos, bars\.length\) \? \(\s*<DiplomaModal([\s\S]*?)\/>/.exec(codigo);
    assert.ok(bloque, 'no hay DiplomaModal condicionado a la credencial completa');
    assert.match(bloque[1], /nombre=\{profile\?\.display_name \?\? ''\}/);
    assert.match(bloque[1], /ruta=\{activeRoute\.name\}/);
    assert.match(bloque[1], /foto=\{profile\?\.avatar_url \?\? null\}/);
    assert.match(bloque[1], /paradas=\{bars\}/);
  });
});

describe('Medalla animada', () => {
  const codigo = sinComentarios(leer('src/components/Medalla.tsx'));

  it('se balancea y destella en bucle, con el driver nativo', () => {
    assert.match(codigo, /Animated\.loop\(/);
    assert.ok((codigo.match(/useNativeDriver: true/g) ?? []).length >= 4);
    assert.match(codigo, /transformOrigin: 'center top'/);
  });

  it('respeta "reducir movimiento" del sistema y se queda quieta', () => {
    assert.match(codigo, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
    assert.match(codigo, /'reduceMotionChanged'/);
    assert.match(codigo, /if \(quieta\) \{/);
  });

  it('para las animaciones al desmontarse (sin fugas)', () => {
    assert.match(codigo, /animacionBalanceo\.stop\(\);\s*animacionDestello\.stop\(\);/);
  });

  it('es un boton accesible que avisa de que abre el diploma', () => {
    assert.match(codigo, /accessibilityRole="button"/);
    assert.match(codigo, /Toca para ver tu diploma/);
  });
});

describe('Diploma', () => {
  const codigo = sinComentarios(leer('src/features/diploma/Diploma.tsx'));

  it('dos mitades: arriba el diploma, abajo el mapa', () => {
    assert.match(codigo, /const MITAD = DIPLOMA_ALTO \/ 2;/);
    assert.match(codigo, /styles\.arriba/);
    assert.match(codigo, /<MapaEstatico paradas=\{paradas\}/);
  });

  it('lleva el titulo (la ruta), la foto dentro de la chapa verde y la frase de honor', () => {
    assert.match(codigo, /\{ruta\}\s*<\/Text>/);
    assert.match(codigo, /<AvatarCana nombre=\{nombre\} foto=\{foto\} tamano=\{TAMANO_FOTO\} \/>/);
    assert.match(codigo, /<ChapaSellado tamanoLogo=\{TAMANO_FOTO\} \/>/);
    assert.match(codigo, /fraseDiploma\(nombre, ruta\)/);
  });

  it('el zoom NO va en el propio diploma: el nodo que se exporta tiene que estar a su tamano', () => {
    assert.doesNotMatch(codigo, /transform: \[\{ scale/);
  });

  it('formato 9:16 vertical', () => {
    assert.match(leer('src/features/diploma/textoDiploma.ts'), /DIPLOMA_ANCHO = 360;/);
    assert.match(leer('src/features/diploma/textoDiploma.ts'), /DIPLOMA_ALTO = 640;/);
  });
});

describe('Mapa del diploma', () => {
  const codigo = sinComentarios(leer('src/features/diploma/MapaEstatico.tsx'));

  it('mismo trazo que la pantalla Ruta: linea discontinua roja de 12 y 8', () => {
    assert.match(codigo, /width: 12, height: 4, marginRight: 8, backgroundColor: colors\.stamp/);
  });

  it('lleva la atribucion de OpenStreetMap, que su licencia exige visible', () => {
    assert.match(codigo, /© OpenStreetMap/);
  });

  it('no usa Leaflet ni react-native-maps: no pide la ubicacion y se puede convertir en imagen', () => {
    assert.doesNotMatch(codigo, /leaflet|react-native-maps/i);
  });
});

describe('Exportar', () => {
  it('la web usa html-to-image a x3 (1080 x 1920) y captura solo el nodo del diploma', () => {
    const codigo = sinComentarios(leer('src/features/diploma/exportar.web.ts'));
    assert.match(codigo, /from 'html-to-image'/);
    assert.match(codigo, /pixelRatio: DIPLOMA_PIXEL_RATIO/);
    assert.match(codigo, /width: DIPLOMA_ANCHO/);
    assert.match(codigo, /height: DIPLOMA_ALTO/);
    assert.match(codigo, /PUEDE_EXPORTAR = true;/);
  });

  it('el movil nativo NO importa html-to-image (tocaria el DOM) y no ofrece exportar todavia', () => {
    const codigo = sinComentarios(leer('src/features/diploma/exportar.ts'));
    assert.doesNotMatch(codigo, /html-to-image/);
    assert.match(codigo, /PUEDE_EXPORTAR = false;/);
  });

  it('el modal ofrece compartir solo si el navegador puede, y guardar siempre que se pueda exportar', () => {
    const codigo = sinComentarios(leer('src/features/diploma/DiplomaModal.tsx'));
    assert.match(codigo, /const puedeCompartir = PUEDE_EXPORTAR && puedeCompartirFicheros\(\);/);
    assert.match(codigo, /title="Compartir imagen"/);
    assert.match(codigo, /title="Guardar imagen"/);
  });

  it('el zoom de la vista previa va en un contenedor PADRE del diploma', () => {
    const codigo = sinComentarios(leer('src/features/diploma/DiplomaModal.tsx'));
    assert.match(codigo, /transform: \[\{ scale: escala \}\][\s\S]*<Diploma ref=\{diplomaRef\}/);
  });

  it('html-to-image esta en package.json', () => {
    assert.match(leer('package.json'), /"html-to-image":/);
  });
});

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
    assert.match(bloque[1], /paradas=\{bars\.map\(\(b\) => \(\{ id: b\.id, nombre: b\.name, lat: b\.lat, lng: b\.lng \}\)\)\}/);
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

  it('dos mitades, cada una con su marco: arriba el diploma, abajo el reverso con el mapa', () => {
    assert.match(codigo, /const MITAD = DIPLOMA_ALTO \/ 2;/);
    assert.equal((codigo.match(/<MarcoDiploma variante=\{marco\} \/>/g) ?? []).length, 2, 'las dos mitades llevan marco');
    const reverso = /<View style=\{styles\.mitad\}>\s*<MarcoDiploma variante=\{marco\} \/>\s*<View style=\{\[styles\.mapa, [^\]]*\]\}>\s*<MapaEstatico paradas=\{paradas\}/.exec(codigo);
    assert.ok(reverso, 'el mapa va dentro del marco de la segunda mitad');
  });

  it('el marco por defecto es el friso de tercios', () => {
    assert.match(codigo, /MARCO_POR_DEFECTO: VarianteMarco = 'tercios';/);
  });

  it('lleva la foto dentro de la chapa verde, "<nombre> ha completado: <RUTA>" y un cierre', () => {
    assert.match(codigo, /<AvatarCana nombre=\{nombre\} foto=\{foto\} tamano=\{TAMANO_FOTO\} \/>/);
    assert.match(codigo, /<ChapaSellado tamanoLogo=\{TAMANO_FOTO\} \/>/);
    assert.match(codigo, /\{lineaCompletado\(nombre\)\}/);
    assert.match(codigo, /\{rutaEnDiploma\(ruta\)\}/);
    assert.match(codigo, /\{cierreDiploma\(nombre, ruta\)\}/);
    assert.doesNotMatch(codigo, /con honores/i, 'la frase de "con honores" se cambio por el cierre con guasa');
  });

  it('el fondo es la ilustracion de Ruta de Bares recortada, mezclada en multiply y dentro del marco', () => {
    assert.match(codigo, /require\('\.\.\/\.\.\/\.\.\/assets\/marca\/fondo-diploma\.jpg'\)/);
    assert.match(codigo, /mixBlendMode: 'multiply'/);
    assert.match(codigo, /resizeMode="contain"/, 'zoom out: la ilustracion entera, sin recortar');
    assert.match(codigo, /cajaFondo: \{ position: 'absolute', overflow: 'hidden' \}/);
    assert.match(codigo, /\{ top: fondo, left: fondo, right: fondo, bottom: fondo \}/);
  });

  it('la opacidad del fondo deja el texto legible: entre 10 % y 25 %', () => {
    const m = /OPACIDAD_FONDO_DIPLOMA = ([0-9.]+);/.exec(codigo);
    assert.ok(m);
    const valor = Number(m[1]);
    assert.ok(valor >= 0.1 && valor <= 0.25, `opacidad ${valor}`);
  });

  it('el JPG de fondo existe y es ligero (no engorda la app)', () => {
    const ruta = join(raiz, 'assets/marca/fondo-diploma.jpg');
    const bytes = readFileSync(ruta);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    assert.ok(bytes.length < 400_000, `${bytes.length} bytes`);
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

  it('las paradas se marcan por defecto con el SELLO (logo) del bar, y hay opcion de numeros', () => {
    assert.match(codigo, /marca = 'sellos'/);
    assert.match(codigo, /marca\?: 'sellos' \| 'numeros'/);
    assert.match(codigo, /<BarLogo nombre=\{paradas\[i\]\.nombre\} tamano=\{radio \* 2 - 4\} \/>/);
  });

  it('las teselas se dibujan con el lado que compensa el zoom decimal, no con 256 fijo', () => {
    assert.match(codigo, /width: t\.lado, height: t\.lado/);
    assert.doesNotMatch(codigo, /LADO_TESELA/);
  });

  it('el zoom del mapa es el justo: el margen es el radio de la marca mas un poco de aire', () => {
    assert.match(codigo, /calcularVista\(paradas, ancho, alto, radio \+ AIRE, 18\)/);
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

  it('Story: boton con el logo de Instagram, a la DERECHA de Guardar imagen y solo en movil', () => {
    const codigo = sinComentarios(leer('src/features/diploma/DiplomaModal.tsx'));
    const fila = /<View style=\{styles\.fila\}>([\s\S]*?)<\/View>\s*\) : null\}/.exec(codigo);
    assert.ok(fila, 'no encuentro la fila de Guardar + Story');
    const iGuardar = fila[1].indexOf('title="Guardar imagen"');
    const iStory = fila[1].indexOf('title="Story"');
    assert.ok(iGuardar > -1 && iStory > iGuardar, 'Story tiene que ir despues (a la derecha) de Guardar imagen');
    assert.match(fila[1], /icon="logo-instagram"/);
    assert.match(codigo, /const conStory = PUEDE_EXPORTAR && puedeStory\(\);/);
    assert.match(fila[1], /\{conStory \? \(/);
  });

  it('Story copia la cuenta al portapapeles DENTRO del toque, antes de esperar a nada', () => {
    const codigo = sinComentarios(leer('src/features/diploma/DiplomaModal.tsx'));
    const iCopia = codigo.indexOf('copiarTexto(CUENTA_INSTAGRAM)');
    const iBlob = codigo.indexOf('imagen.current ?? (await diplomaABlob');
    assert.ok(iCopia > -1 && iBlob > iCopia, 'el portapapeles se pide antes de generar la imagen');
  });

  it('Story usa la hoja de compartir si hay; si no, guarda la imagen y abre la camara de historias', () => {
    const codigo = sinComentarios(leer('src/features/diploma/DiplomaModal.tsx'));
    assert.match(codigo, /if \(puedeCompartir\) \{\s*await compartirImagen\(blob, nombreFichero\);/);
    assert.match(codigo, /descargarImagen\(blob, nombreFichero\);[\s\S]*setTimeout\(abrirCamaraDeStories, 700\)/);
    assert.match(sinComentarios(leer('src/features/diploma/exportar.web.ts')), /'instagram:\/\/story-camera'/);
  });

  it('el aviso es honesto: la etiqueta la pega la persona, no se hace sola', () => {
    const codigo = leer('src/features/diploma/DiplomaModal.tsx');
    assert.match(codigo, /pégalo con la pegatina de texto para etiquetarnos/);
    assert.doesNotMatch(codigo, /etiquetad[oa] automaticamente/i);
  });

  it('la imagen se prepara al abrir y se reutiliza: el menu de compartir exige abrirse al instante', () => {
    const codigo = sinComentarios(leer('src/features/diploma/DiplomaModal.tsx'));
    assert.match(codigo, /const imagen = useRef<Blob \| null>\(null\);/);
    assert.match(codigo, /ESPERA_PREPARAR_MS/);
    assert.match(codigo, /imagen\.current = null;/);
  });

  it('en nativo Story no sale (no hay exportacion todavia)', () => {
    const codigo = sinComentarios(leer('src/features/diploma/exportar.ts'));
    assert.match(codigo, /export function puedeStory\(\): boolean \{\s*return false;/);
  });

  it('html-to-image esta en package.json', () => {
    assert.match(leer('package.json'), /"html-to-image":/);
  });
});

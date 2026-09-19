import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * BarraSuperior pone el margen del notch de todas las pestanas.
 *
 * React Navigation NO descuenta ese margen a las pantallas con cabecera:
 * useSafeAreaInsets sigue devolviendo el top del telefono. Si una pestana pide
 * el borde 'top' a su SafeAreaView (o no pasa edges, que equivale a todos),
 * aparece un hueco doble bajo la barra. En web de escritorio el margen es 0 y
 * no se ve, por eso lo vigila un test y no los ojos.
 *
 * Lo mismo para el mapa: ruta.tsx le pasa margenSeguroArriba 0, porque el mapa
 * ya empieza debajo de la barra; con insets.top los pines bajarian de mas.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8');

const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Descripcion de cada <SafeAreaView> que reserva el margen de arriba. */
export function safeAreasConTop(codigo: string): string[] {
  const problemas: string[] = [];
  // (?:=>|[^>]) para no cortar la etiqueta en la flecha de un callback.
  for (const m of sinComentarios(codigo).matchAll(/<SafeAreaView\b((?:=>|[^>])*)>/g)) {
    const props = m[1];
    const edges = /edges=\{\s*\[([^\]]*)\]/.exec(props);
    if (!edges) problemas.push(`sin edges (equivale a todos, incluido top): <SafeAreaView${props}>`);
    else if (/['"]top['"]/.test(edges[1])) problemas.push(`edges con 'top': <SafeAreaView${props}>`);
  }
  return problemas;
}

const pestanas = readdirSync(join(raiz, 'app', '(tabs)')).filter(
  (f) => f.endsWith('.tsx') && !f.startsWith('_') && !f.includes('.test.'),
);

describe('BarraSuperior: margen del notch una sola vez', () => {
  it('hay pestanas que revisar (el test no mira una carpeta vacia)', () => {
    assert.ok(pestanas.includes('ruta.tsx') && pestanas.includes('perfil.tsx'));
  });

  for (const fichero of pestanas) {
    it(`${fichero}: ningun SafeAreaView pide el borde de arriba`, () => {
      assert.deepEqual(safeAreasConTop(leer(`app/(tabs)/${fichero}`)), []);
    });
  }

  it('el layout de pestanas usa BarraSuperior y ninguna pestana la oculta', () => {
    const codigo = sinComentarios(leer('app/(tabs)/_layout.tsx'));
    assert.match(codigo, /header:\s*\(\{\s*options\s*\}\)\s*=>\s*<BarraSuperior\s+titulo=\{options\.title/);
    assert.doesNotMatch(codigo, /headerShown:\s*false/);
  });

  it('cada pestana tiene title: sin el, la barra saldria sin titulo', () => {
    const codigo = sinComentarios(leer('app/(tabs)/_layout.tsx'));
    const pantallas = codigo.split('<Tabs.Screen').slice(1);
    assert.equal(pantallas.length, pestanas.length);
    for (const pantalla of pantallas) assert.match(pantalla, /\btitle:\s*'[^']+'/);
  });

  it('ruta.tsx no suma el notch al hueco de arriba del mapa', () => {
    const codigo = sinComentarios(leer('app/(tabs)/ruta.tsx'));
    assert.match(codigo, /margenSeguroArriba:\s*0\s*,/);
    assert.doesNotMatch(codigo, /insets\.top/);
  });

  it('BarraSuperior si reserva el notch', () => {
    assert.match(sinComentarios(leer('src/components/BarraSuperior.tsx')), /paddingTop:\s*insets\.top/);
  });

  describe('barra inferior: solo Ruta y Caña', () => {
    const layout = sinComentarios(leer('app/(tabs)/_layout.tsx'));
    // Se parte por "<Tabs.Screen" y no con un regex hasta el primer "/>": el
    // icono de la pestana (<Ionicons ... />) cierra antes de llegar a `href`.
    const opciones = (nombre: string) => {
      const bloque = layout
        .replace(/"/g, "'")
        .split('<Tabs.Screen')
        .find((b) => b.trimStart().startsWith(`name='${nombre}'`));
      assert.ok(bloque, `no hay Tabs.Screen ${nombre}`);
      return bloque;
    };

    it('perfil no tiene boton abajo (href: null sin condicion)', () => {
      assert.match(opciones('perfil'), /\bhref:\s*null\s*,/);
    });

    it('sellos tampoco tiene boton abajo: se entra por el boton de la cabecera de Ruta', () => {
      assert.match(opciones('index'), /\bhref:\s*null\s*,/);
    });

    it('ruta y cana si lo tienen', () => {
      for (const nombre of ['ruta', 'cana']) assert.doesNotMatch(opciones(nombre), /\bhref:/);
    });

    it('editor ya no es una pestana: no hay Tabs.Screen para el', () => {
      assert.doesNotMatch(layout.replace(/"/g, "'"), /<Tabs\.Screen\s+name='editor'/);
    });
  });

  describe('editor de rutas: pantalla del Stack raiz, con flecha atras', () => {
    it('vive en app/editor.tsx y no en app/(tabs)/', () => {
      assert.doesNotMatch(
        sinComentarios(leer('app/(tabs)/_layout.tsx')),
        /<Tabs\.Screen\s+name="editor"/,
      );
    });

    it('el Stack raiz la registra con su titulo', () => {
      assert.match(
        sinComentarios(leer('app/_layout.tsx')),
        /<Stack\.Screen\s+name="editor"\s+options=\{\{\s*title:\s*'Editor de rutas'\s*\}\}\s*\/>/,
      );
    });

    it('el if (!isAdmin) sigue siendo quien protege la pantalla, no la navegacion', () => {
      assert.match(sinComentarios(leer('app/editor.tsx')), /if\s*\(\s*!isAdmin\s*\)\s*\{\s*return/);
    });

    it('el boton del editor en Perfil solo se pinta para admins', () => {
      // Comillas unificadas: "/editor" y '/editor' son el mismo enlace.
      const perfil = sinComentarios(leer('app/(tabs)/perfil.tsx')).replace(/["`]/g, "'");
      const bloqueAdmin = /\{isAdmin \? \(([\s\S]*?)\) : null\}/.exec(perfil);
      assert.ok(bloqueAdmin, 'no hay bloque {isAdmin ? (...) : null} en perfil.tsx');
      assert.match(bloqueAdmin[1], /router\.push\('\/editor'\)/);
      assert.equal(perfil.split("'/editor'").length - 1, 1, 'el editor se enlaza tambien fuera del bloque de admins');
    });
  });

  describe('titulos del Stack: mismo color que "Detras de la barra"', () => {
    it('headerTitleStyle fija el color, no solo headerTintColor', () => {
      const codigo = sinComentarios(leer('app/_layout.tsx'));
      assert.match(codigo, /headerTitleStyle:\s*\{[^}]*color:\s*'#8A7A69'[^}]*\}/);
    });

    it('es el mismo color que perfil.tsx usa para "Detras de la barra"', () => {
      const perfil = sinComentarios(leer('app/(tabs)/perfil.tsx'));
      assert.match(perfil, /tituloTarjeta:\s*\{[^}]*color:\s*'#8A7A69'[^}]*\}/);
    });
  });

  describe('el detector funciona', () => {
    it("caza edges con 'top' (el perfil.tsx anterior)", () => {
      assert.equal(safeAreasConTop(`<SafeAreaView style={s.p} edges={['top', 'left', 'right']}>`).length, 1);
    });
    it('caza un SafeAreaView sin edges (el estado vacio anterior de ruta.tsx)', () => {
      assert.equal(safeAreasConTop('<SafeAreaView style={styles.pantalla}>').length, 1);
    });
    it('caza el top aunque haya una flecha antes de edges', () => {
      assert.equal(safeAreasConTop(`<SafeAreaView onLayout={() => {}} edges={["bottom", "top"]}>`).length, 1);
    });
    it('no se queja de edges sin top ni de un comentario', () => {
      assert.deepEqual(
        safeAreasConTop(`// antes: <SafeAreaView edges={['top']}>\n<SafeAreaView style={s.p} edges={['bottom']}>`),
        [],
      );
    });
  });
});

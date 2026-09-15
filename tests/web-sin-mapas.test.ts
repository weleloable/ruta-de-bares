import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Guardia del bundle web.
 *
 * react-native-maps no tiene build web y revienta solo con importarlo
 * ("codegenNativeComponent is not a function"): `npm run web` se queda en
 * blanco. expo-router carga todas las rutas de app/ al arrancar, asi que un
 * `Platform.OS === 'web'` dentro de la pantalla no sirve, el import ya ha roto
 * el bundle. Reglas, para cada paquete de PAQUETES_SIN_WEB:
 *
 *  - ningun archivo de app/ lo importa;
 *  - un modulo fuera de app/ que lo importa tiene variante .web.<ext> que Metro
 *    elija DE VERDAD. metro-resolver (resolveSourceFile) recorre sourceExts en
 *    orden y para cada extension prueba .web.<ext> y luego .<ext>: con
 *    Mapa.ts + Mapa.web.tsx gana Mapa.ts. La variante tiene que usar una
 *    extension que no vaya detras de la del modulo en ese orden;
 *  - ninguna variante .web.* lo importa.
 *
 * Y para cualquier import local (relativo o con el alias @/):
 *  - sin extension explicita si el destino tiene variante web: con extension,
 *    Metro encuentra el archivo exacto antes de mirar plataformas;
 *  - nunca una variante nativa (.native/.ios/.android) directamente: en web
 *    Metro la cargaria tal cual.
 *
 * Los imports se leen con el parser de TypeScript, no con regex: comentarios,
 * strings, template literals, parentesis e `import type` se resuelven como los
 * ve Babel. `expo export --platform web` no sirve de guardia: no ejecuta el JS
 * y el bundle roto se genera sin error.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const PAQUETES_SIN_WEB = ['react-native-maps'];

/** Orden de sourceExts de Metro para codigo (comprobado contra expo/metro-config abajo). */
export const ORDEN_EXTENSIONES = ['ts', 'tsx', 'mjs', 'js', 'jsx', 'cjs'];

/** Alias de import (comprobado contra tsconfig.json abajo). */
export const ALIAS: Record<string, string> = { '@/': 'src/' };

const EXTENSION = /\.(tsx?|[mc]js|jsx?)$/;
const VARIANTE_WEB = /\.web\.(tsx?|[mc]js|jsx?)$/;
const VARIANTE_NATIVA = /\.(native|ios|android)\.(tsx?|[mc]js|jsx?)$/;
const ESPECIFICADOR_NATIVO = /\.(native|ios|android)(\.(tsx?|[mc]js|jsx?))?$/;

function tipoDeScript(ruta: string): ts.ScriptKind {
  if (ruta.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (ruta.endsWith('.ts')) return ts.ScriptKind.TS;
  if (ruta.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

/**
 * Quita lo que Babel borra al compilar y deja la expresion de dentro:
 * parentesis, `as`, `satisfies`, `!` y `<T>`. `require('x' as string)` llega
 * a Metro como `require('x')`.
 */
function sinEnvoltorios(nodo: ts.Expression): ts.Expression {
  let actual = nodo;
  while (
    ts.isParenthesizedExpression(actual) ||
    ts.isAsExpression(actual) ||
    ts.isSatisfiesExpression(actual) ||
    ts.isNonNullExpression(actual) ||
    ts.isTypeAssertionExpression(actual)
  ) {
    actual = actual.expression;
  }
  return actual;
}

function textoLiteral(nodo: ts.Node | undefined): string | null {
  if (nodo === undefined) return null;
  const limpio = ts.isExpression(nodo) ? sinEnvoltorios(nodo) : nodo;
  return ts.isStringLiteral(limpio) || ts.isNoSubstitutionTemplateLiteral(limpio) ? limpio.text : null;
}

/**
 * Marca de un `require(...)` / `import(...)` cuyo argumento no es un literal.
 * En dev Metro lo rechaza, pero en produccion el transform de Expo pliega
 * constantes antes de recoger dependencias: `require('react-native-' + 'maps')`
 * acaba siendo `require('react-native-maps')` y la web se queda en blanco.
 */
export const NO_LITERAL = '\0require-no-literal';

/** Todos los especificadores que el archivo carga en tiempo de ejecucion. */
export function importsEnEjecucion(codigo: string, ruta = 'fixture.tsx'): string[] {
  const fuente = ts.createSourceFile(ruta, codigo, ts.ScriptTarget.Latest, false, tipoDeScript(ruta));
  const encontrados: string[] = [];
  const anotar = (texto: string | null) => {
    if (texto !== null) encontrados.push(texto);
  };

  const visitar = (nodo: ts.Node): void => {
    if (ts.isImportDeclaration(nodo)) {
      const clausula = nodo.importClause;
      // Babel quita el import si solo trae tipos: `import type {..}` o
      // `import { type A, type B }`. Sin clausula es un import de efecto lateral.
      const soloTipos =
        clausula !== undefined &&
        (clausula.isTypeOnly ||
          (clausula.name === undefined &&
            clausula.namedBindings !== undefined &&
            ts.isNamedImports(clausula.namedBindings) &&
            clausula.namedBindings.elements.length > 0 &&
            clausula.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (!soloTipos) anotar(textoLiteral(nodo.moduleSpecifier));
    } else if (ts.isExportDeclaration(nodo) && nodo.moduleSpecifier !== undefined) {
      const soloTipos =
        nodo.isTypeOnly ||
        (nodo.exportClause !== undefined &&
          ts.isNamedExports(nodo.exportClause) &&
          nodo.exportClause.elements.length > 0 &&
          nodo.exportClause.elements.every((e) => e.isTypeOnly));
      if (!soloTipos) anotar(textoLiteral(nodo.moduleSpecifier));
    } else if (
      ts.isImportEqualsDeclaration(nodo) &&
      !nodo.isTypeOnly &&
      ts.isExternalModuleReference(nodo.moduleReference)
    ) {
      anotar(textoLiteral(nodo.moduleReference.expression));
    } else if (ts.isCallExpression(nodo)) {
      const llamado = sinEnvoltorios(nodo.expression);
      // Las llamadas que metro/src/ModuleGraph/worker/collectDependencies.js
      // registra como dependencia: import(), require(), __prefetchImport() y
      // require.unstable_importMaybeSync(). require.resolveWeak() tambien
      // cuenta (mas estricto que Metro, que la marca como debil). require.context
      // no: es el mecanismo de expo-router y no nombra un modulo.
      const esRequireMiembro =
        ts.isPropertyAccessExpression(llamado) &&
        ts.isIdentifier(llamado.expression) &&
        llamado.expression.text === 'require' &&
        ['unstable_importMaybeSync', 'resolveWeak'].includes(llamado.name.text);
      if (
        llamado.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(llamado) && (llamado.text === 'require' || llamado.text === '__prefetchImport')) ||
        esRequireMiembro
      ) {
        const argumento = nodo.arguments[0];
        const texto = textoLiteral(argumento);
        if (texto !== null) anotar(texto);
        else if (argumento !== undefined) anotar(NO_LITERAL);
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return encontrados;
}

/** true si el codigo carga el paquete (o un subpath) en tiempo de ejecucion. */
export function importaEnEjecucion(codigo: string, paquete: string, ruta = 'fixture.tsx'): boolean {
  return importsEnEjecucion(codigo, ruta).some((e) => e === paquete || e.startsWith(`${paquete}/`));
}

/** Ruta desde la raiz del proyecto de un import local, o null si es un paquete. */
export function rutaLocal(desde: string, especificador: string): string | null {
  if (/^\.\.?(\/|$)/.test(especificador)) {
    return posix.normalize(posix.join(posix.dirname(desde), especificador));
  }
  for (const [alias, destino] of Object.entries(ALIAS)) {
    if (especificador.startsWith(alias)) return posix.normalize(destino + especificador.slice(alias.length));
  }
  return null;
}

type Archivo = { ruta: string; codigo: string };

/** Hay una variante web que Metro elegiria antes que el archivo con extension `ext`. */
function varianteWebGana(base: string, ext: string, existe: (ruta: string) => boolean): boolean {
  const hasta = ORDEN_EXTENSIONES.indexOf(ext);
  const candidatas = hasta === -1 ? ORDEN_EXTENSIONES : ORDEN_EXTENSIONES.slice(0, hasta + 1);
  return candidatas.some((e) => existe(`${base}.web.${e}`));
}

function tieneAlgunaVarianteWeb(base: string, existe: (ruta: string) => boolean): boolean {
  return ORDEN_EXTENSIONES.some((e) => existe(`${base}.web.${e}`));
}

export function violaciones(archivos: readonly Archivo[], existe: (ruta: string) => boolean): string[] {
  const problemas: string[] = [];
  for (const { ruta, codigo } of archivos) {
    // Una variante nativa fuera de app/ no entra en el bundle web (Metro elige
    // la .web). En app/ si: el require.context de expo-router acepta
    // ".native/.ios/.android" en su regex y Metro recoge el archivo y sus
    // dependencias para web aunque luego la ruta no se use.
    if (VARIANTE_NATIVA.test(ruta) && !ruta.startsWith('app/')) continue;
    const especificadores = importsEnEjecucion(codigo, ruta);

    if (especificadores.includes(NO_LITERAL)) {
      problemas.push(`${ruta}: require/import() con un argumento que no es un literal; escribe el nombre del modulo tal cual`);
    }

    for (const paquete of PAQUETES_SIN_WEB) {
      if (!especificadores.some((e) => e === paquete || e.startsWith(`${paquete}/`))) continue;
      const base = ruta.replace(EXTENSION, '');
      const ext = ruta.match(EXTENSION)?.[1] ?? '';
      if (VARIANTE_WEB.test(ruta)) {
        problemas.push(`${ruta}: es la variante web y aun asi importa ${paquete}`);
      } else if (ruta.startsWith('app/')) {
        problemas.push(`${ruta}: una ruta no puede importar ${paquete}; muevelo a src/components con variante .web.tsx`);
      } else if (!varianteWebGana(base, ext, existe)) {
        problemas.push(
          tieneAlgunaVarianteWeb(base, existe)
            ? `${ruta}: importa ${paquete} y su variante web usa una extension que Metro prueba despues; usa ${base}.web.${ext}`
            : `${ruta}: importa ${paquete} y falta ${base}.web.${ext}`,
        );
      }
    }

    for (const especificador of especificadores) {
      const destino = rutaLocal(ruta, especificador);
      if (destino === null) continue;
      if (ESPECIFICADOR_NATIVO.test(destino)) {
        problemas.push(`${ruta}: importa '${especificador}', una variante nativa, directamente; en web se cargaria tal cual`);
      } else if (EXTENSION.test(destino) && !VARIANTE_WEB.test(destino)) {
        if (tieneAlgunaVarianteWeb(destino.replace(EXTENSION, ''), existe)) {
          problemas.push(`${ruta}: importa '${especificador}' con extension y se salta su variante web; quita la extension`);
        }
      }
    }
  }
  return problemas;
}

/**
 * Si un archivo entra en el escaneo. En app/ entra todo archivo de codigo,
 * tambien `x.test.tsx`: el require.context de expo-router (expo-router/_ctx.web.js)
 * lo acepta como ruta y lo carga al arrancar. Fuera de app/ un test solo entra
 * en el bundle si alguien lo importa, y entonces el import ya lo marca.
 */
export function entraEnElEscaneo(ruta: string): boolean {
  if (!EXTENSION.test(ruta)) return false;
  return ruta.startsWith('app/') || !/\.test\.(tsx?|[mc]js|jsx?)$/.test(ruta);
}

function listar(dir: string): string[] {
  return readdirSync(join(raiz, dir), { withFileTypes: true }).flatMap((entrada) => {
    const ruta = `${dir}/${entrada.name}`;
    if (entrada.isDirectory()) return listar(ruta);
    return entraEnElEscaneo(ruta) ? [ruta] : [];
  });
}

/** Archivos de codigo sueltos en la raiz: una app/ puede importar '../mapa'. */
export function archivosDeRaiz(): string[] {
  return readdirSync(raiz, { withFileTypes: true })
    .filter((e) => e.isFile() && entraEnElEscaneo(e.name))
    .map((e) => e.name);
}

/** Carpetas de primer nivel que nunca entran en el bundle de la app. */
const FUERA_DEL_BUNDLE = new Set([
  'node_modules',
  'tests', // tests de node, no se importan desde la app
  'supabase', // Edge Functions en Deno
  'docs',
  'assets',
  'android',
  'ios',
  'dist',
  'web-build',
  'coverage',
]);

/**
 * Carpetas de primer nivel con codigo que Metro puede alcanzar. Por exclusion,
 * no por lista: una carpeta nueva (lib/, components/) entra sola en el guardia.
 */
export function carpetasDeCodigo(): string[] {
  return readdirSync(raiz, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !FUERA_DEL_BUNDLE.has(e.name))
    .map((e) => e.name);
}

const mapas = (codigo: string) => importaEnEjecucion(codigo, 'react-native-maps');

describe('bundle web sin react-native-maps', () => {
  const archivosDelProyecto = () =>
    [...archivosDeRaiz(), ...carpetasDeCodigo().flatMap((carpeta) => listar(carpeta))].map((ruta) => ({
      ruta,
      codigo: readFileSync(join(raiz, ruta), 'utf8'),
    }));

  it('app/ y src/ cumplen la regla', () => {
    const archivos = archivosDelProyecto();
    assert.ok(archivos.length > 10, `se esperaban archivos, hay ${archivos.length}`);
    assert.deepEqual(violaciones(archivos, (ruta) => existsSync(join(raiz, ruta))), []);
  });

  // Aparte del anterior para que un fallo no tape al otro.
  it('el guardia esta mirando algo: algun archivo usa el mapa', () => {
    assert.ok(
      archivosDelProyecto().some((a) => importaEnEjecucion(a.codigo, 'react-native-maps', a.ruta)),
      'ningun archivo importa react-native-maps; si se quito el mapa, borra este guardia',
    );
  });

  it('el orden de extensiones es el sourceExts real de Metro y el alias es el de tsconfig.json', () => {
    // La misma configuracion que usa `expo start`: si Expo cambia el orden o
    // anade una extension de codigo, este test falla antes que el bundle.
    const requerir = createRequire(join(raiz, 'package.json'));
    const { getDefaultConfig } = requerir('expo/metro-config') as {
      getDefaultConfig(raiz: string): { resolver: { sourceExts: string[] } };
    };
    const deCodigo = getDefaultConfig(raiz).resolver.sourceExts.filter((ext) => /^([mc]?js|jsx|tsx?)$/.test(ext));
    assert.deepEqual(deCodigo, ORDEN_EXTENSIONES);

    const tsconfig = ts.readConfigFile(join(raiz, 'tsconfig.json'), ts.sys.readFile);
    const paths = tsconfig.config?.compilerOptions?.paths as Record<string, string[]>;
    const desdeTsconfig = Object.fromEntries(
      Object.entries(paths).map(([alias, [destino]]) => [
        alias.replace(/\*$/, ''),
        posix.normalize(destino.replace(/\*$/, '')).replace(/^\.\//, ''),
      ]),
    );
    assert.deepEqual(desdeTsconfig, ALIAS);
  });

  it('detecta el fallo original: una pantalla con import estatico y guardia Platform.OS', () => {
    const rutaVieja = {
      ruta: 'app/(tabs)/ruta.tsx',
      codigo:
        "import MapView, { Marker } from 'react-native-maps';\n" +
        "export default function R() { if (Platform.OS === 'web') return <EmptyState />; return <MapView />; }",
    };
    assert.equal(violaciones([rutaVieja], () => true).length, 1);
  });

  it('detecta todas las formas de cargar el paquete', () => {
    for (const codigo of [
      "import MapView from 'react-native-maps'",
      'import { Marker } from "react-native-maps";',
      "import 'react-native-maps';",
      "import X from 'react-native-maps/lib/MapView';",
      "import * as M from 'react-native-maps'",
      "import{Marker}from'react-native-maps'",
      "import type from 'react-native-maps';",
      "import { type LatLng, Marker } from 'react-native-maps';",
      "import {\n  Marker,\n  Circle,\n} from 'react-native-maps';",
      "const M = await import('react-native-maps');",
      'const M = await import(`react-native-maps`);',
      "const M = await import(('react-native-maps'));",
      "const M = require('react-native-maps');",
      "const M = require ('react-native-maps');",
      'const M = require(`react-native-maps`);',
      "const M = require(('react-native-maps'));",
      "const M = (require)('react-native-maps');",
      "const M = require('react-native-maps' as string);",
      "const M = await import('react-native-maps' as const);",
      "const M = require('react-native-maps'!);",
      "const M = require('react-native-maps' satisfies string);",
      "const M = (require as any)('react-native-maps');",
      "__prefetchImport('react-native-maps');",
      "const M = require.unstable_importMaybeSync('react-native-maps');",
      "const id = require.resolveWeak('react-native-maps');",
      "import M = require('react-native-maps');",
      "export { Marker } from 'react-native-maps';",
      "export{Marker}from'react-native-maps'",
      "export * from 'react-native-maps';",
      "const u = 'a//b'; import M from 'react-native-maps';",
      "const patron = 'src/*';\nimport M from 'react-native-maps';\n/** doc */",
    ]) {
      assert.equal(mapas(codigo), true, codigo);
    }
    // `<T>x` solo existe en .ts: en .tsx es JSX y el archivo ni compila.
    assert.equal(importaEnEjecucion("const M = require(<any>'react-native-maps');", 'react-native-maps', 'x.ts'), true);
  });

  it('no marca lo que no llega al bundle', () => {
    for (const codigo of [
      "import type { LatLng } from 'react-native-maps';",
      "import { type LatLng, type Region } from 'react-native-maps';",
      "export type { LatLng } from 'react-native-maps';",
      "export { type LatLng } from 'react-native-maps';",
      "// import MapView from 'react-native-maps';",
      "/* import MapView from 'react-native-maps'; */",
      'const s = "import M from \'react-native-maps\'";',
      "const t = `import M from 'react-native-maps'`;",
      'const aviso = <Text>react-native-maps necesita el mapa nativo.</Text>;',
      "import x from 'react-native-maps-extra';",
      "import a from 'b';\nimport type T from 'react-native-maps';",
      'const M = require(`react-native-maps${sufijo}`);',
    ]) {
      assert.equal(mapas(codigo), false, codigo);
    }
  });

  it('la variante web de src/ tiene que ser la que Metro elige', () => {
    const conMapa = (ruta: string) => ({ ruta, codigo: "import 'react-native-maps';" });
    const soloExiste = (...rutas: string[]) => (ruta: string) => rutas.includes(ruta);

    assert.equal(violaciones([conMapa('src/components/Mapa.tsx')], () => false).length, 1);
    // Misma extension o una que Metro prueba antes: vale.
    assert.equal(violaciones([conMapa('src/components/Mapa.tsx')], soloExiste('src/components/Mapa.web.tsx')).length, 0);
    assert.equal(violaciones([conMapa('src/components/Mapa.tsx')], soloExiste('src/components/Mapa.web.ts')).length, 0);
    assert.equal(violaciones([conMapa('src/components/Mapa.js')], soloExiste('src/components/Mapa.web.mjs')).length, 0);
    // Una extension que Metro prueba despues: gana el nativo.
    const tsConWebTsx = violaciones([conMapa('src/components/Mapa.ts')], soloExiste('src/components/Mapa.web.tsx'));
    assert.equal(tsConWebTsx.length, 1);
    assert.match(tsConWebTsx[0], /despues/);
    assert.equal(violaciones([conMapa('src/components/Mapa.tsx')], soloExiste('src/components/Mapa.web.js')).length, 1);
    // .cjs tambien es codigo para Metro, y va el ultimo.
    const cjs = violaciones([conMapa('src/lib/mapa.cjs')], () => false);
    assert.equal(cjs.length, 1);
    assert.match(cjs[0], /falta src\/lib\/mapa\.web\.cjs$/);
    assert.equal(violaciones([conMapa('src/lib/mapa.cjs')], soloExiste('src/lib/mapa.web.js')).length, 0);
  });

  it('una variante .web.* que importa el paquete es una violacion; .native.* no', () => {
    const web = { ruta: 'src/components/Mapa.web.tsx', codigo: "import M from 'react-native-maps';" };
    const nativa = { ruta: 'src/components/Mapa.native.tsx', codigo: "import M from 'react-native-maps';" };
    assert.equal(violaciones([web], () => true).length, 1);
    assert.equal(violaciones([nativa], () => false).length, 0);
  });

  it('un import con extension explicita a un modulo con variante web es una violacion, tambien con el alias @/', () => {
    const existe = (ruta: string) => ruta === 'src/components/RutaMapa.web.tsx';
    const desdeRuta = (codigo: string) => violaciones([{ ruta: 'app/(tabs)/ruta.tsx', codigo }], existe).length;

    assert.equal(desdeRuta("import { RutaMapa } from '../../src/components/RutaMapa.tsx';"), 1);
    assert.equal(desdeRuta("import { RutaMapa } from '@/components/RutaMapa.tsx';"), 1);
    assert.equal(desdeRuta("const { RutaMapa } = require('@/components/RutaMapa.tsx');"), 1);
    assert.equal(desdeRuta("import { RutaMapa } from '../../src/components/RutaMapa';"), 0);
    assert.equal(desdeRuta("import { RutaMapa } from '@/components/RutaMapa';"), 0);
    assert.equal(desdeRuta("import { Banner } from '../../src/components/ui.tsx';"), 0);
    assert.equal(desdeRuta("import { RutaMapa } from '../../src/components/RutaMapa.web.tsx';"), 0);
  });

  it('importar una variante nativa directamente es una violacion, con o sin extension', () => {
    const desde = (codigo: string) => violaciones([{ ruta: 'app/x.tsx', codigo }], () => true).length;
    assert.equal(desde("import M from '../src/components/Mapa.native';"), 1);
    assert.equal(desde("import M from '@/components/Mapa.ios.tsx';"), 1);
    assert.equal(desde("import M from '../src/components/Mapa.android';"), 1);
    assert.equal(desde("import M from 'some-package/native';"), 0);
  });

  it('una ruta con extension nativa en app/ tambien cuenta: expo-router la mete en el bundle web', () => {
    const rutaNativa = { ruta: 'app/(tabs)/mapa.native.tsx', codigo: "import MapView from 'react-native-maps';" };
    const rutaIos = { ruta: 'app/x.ios.tsx', codigo: "import 'react-native-maps';" };
    assert.equal(violaciones([rutaNativa], () => true).length, 1);
    assert.equal(violaciones([rutaIos], () => true).length, 1);
    // Fuera de app/ la variante nativa sigue exenta: Metro elige la .web.
    const componenteNativo = { ruta: 'src/components/Mapa.native.tsx', codigo: "import 'react-native-maps';" };
    assert.equal(violaciones([componenteNativo], () => false).length, 0);
  });

  it('un require/import() con argumento no literal es una violacion', () => {
    const desde = (codigo: string) => violaciones([{ ruta: 'src/lib/x.ts', codigo }], () => false);
    for (const codigo of [
      "const M = require('react-native-' + 'maps');",
      "const M = require(cond ? 'react-native-maps' : 'x');",
      'const M = await import(nombre);',
      'const M = require(`react-native-${"maps"}`);',
      "const M = require.unstable_importMaybeSync('react-native-' + 'maps');",
      '__prefetchImport(nombre);',
    ]) {
      const problemas = desde(codigo);
      assert.equal(problemas.length, 1, codigo);
      assert.match(problemas[0], /no es un literal/, codigo);
    }
    for (const codigo of [
      "const ctx = require.context('./app', true);",
      "const M = require('react-native-safe-area-context');",
      'require();',
    ]) {
      assert.deepEqual(desde(codigo), [], codigo);
    }
  });

  it('escanea toda carpeta de primer nivel con codigo, no solo app/ y src/', () => {
    const carpetas = carpetasDeCodigo();
    assert.ok(carpetas.includes('app') && carpetas.includes('src'), carpetas.join(', '));
    for (const fuera of ['node_modules', 'tests', 'supabase']) assert.ok(!carpetas.includes(fuera), fuera);
    assert.ok(!carpetas.some((c) => c.startsWith('.')), carpetas.join(', '));
    // Un modulo en una carpeta nueva recibe la misma regla que src/.
    const nuevo = { ruta: 'lib/mapa.tsx', codigo: "import 'react-native-maps';" };
    assert.equal(violaciones([nuevo], () => false).length, 1);
  });

  it('en app/ escanea tambien los .test.*, y escanea los archivos de la raiz', () => {
    assert.equal(entraEnElEscaneo('app/mapa.test.tsx'), true);
    assert.equal(entraEnElEscaneo('app/(tabs)/ruta.test.tsx'), true);
    assert.equal(entraEnElEscaneo('src/lib/coordenadas.test.ts'), false);
    assert.equal(entraEnElEscaneo('mapa.tsx'), true);
    assert.equal(entraEnElEscaneo('app/fondo.png'), false);

    const deRaiz = archivosDeRaiz();
    assert.ok(deRaiz.includes('app.config.ts'), deRaiz.join(', '));
    const raizConMapa = { ruta: 'mapa.tsx', codigo: "import 'react-native-maps';" };
    assert.equal(violaciones([raizConMapa], () => false).length, 1);
    const testDeRutaConMapa = { ruta: 'app/mapa.test.tsx', codigo: "import 'react-native-maps';" };
    assert.equal(violaciones([testDeRutaConMapa], () => true).length, 1);
  });

  it('rutaLocal resuelve relativos y alias, y deja los paquetes', () => {
    assert.equal(rutaLocal('app/(tabs)/ruta.tsx', '../../src/components/RutaMapa'), 'src/components/RutaMapa');
    assert.equal(rutaLocal('app/x.tsx', '@/lib/theme'), 'src/lib/theme');
    assert.equal(rutaLocal('src/components/A.tsx', './B'), 'src/components/B');
    assert.equal(rutaLocal('app/x.tsx', 'react-native-maps'), null);
    assert.equal(rutaLocal('app/x.tsx', '@expo/vector-icons'), null);
  });
});

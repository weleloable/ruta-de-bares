import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Leaflet solo puede cargarse en web.
 *
 * Leaflet toca `window` nada mas importarse. En el movil no hay `window`, asi
 * que un import desde codigo que llegue al bundle nativo tumba la app al
 * arrancar, y ningun test de Node lo veria. Regla: `leaflet`, `react-leaflet`
 * y src/lib/mapaWeb.ts solo se importan desde variantes `.web.*` (Metro no las
 * mete en el bundle nativo), o desde el propio mapaWeb.ts.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONES = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function listar(carpeta: string): string[] {
  const absoluta = join(raiz, carpeta);
  return readdirSync(absoluta).flatMap((nombre) => {
    const ruta = join(absoluta, nombre);
    const rel = relative(raiz, ruta).replace(/\\/g, '/');
    if (statSync(ruta).isDirectory()) return listar(rel);
    return EXTENSIONES.test(nombre) && !/\.test\./.test(nombre) ? [rel] : [];
  });
}

/**
 * Especificadores que cargan Leaflet, directa o indirectamente: los paquetes,
 * src/lib/mapaWeb.ts, y cualquier variante `.web` importada por su nombre
 * completo (`./RutaMapa.web`), que se salta la eleccion de Metro y mete el
 * codigo web en el bundle nativo.
 */
const PROHIBIDO = /^(leaflet|react-leaflet)(\/.*)?$|(^|\/)mapaWeb(\.ts)?$|\.web(\.[a-z]+)?$/;

export function importsDe(codigo: string): string[] {
  const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const especificadores: string[] = [];
  const patrones = [
    /\bimport\s+(?!type\b)(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?!type\b)[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const patron of patrones) {
    for (const coincidencia of sinComentarios.matchAll(patron)) especificadores.push(coincidencia[1]);
  }
  return especificadores;
}

export function violaciones(archivos: { ruta: string; codigo: string }[]): string[] {
  return archivos.flatMap(({ ruta, codigo }) => {
    const permitido = /\.web\.[a-z]+$/.test(ruta) || ruta === 'src/lib/mapaWeb.ts';
    if (permitido) return [];
    return importsDe(codigo)
      .filter((especificador) => PROHIBIDO.test(especificador))
      .map((especificador) => `${ruta} importa ${especificador}`);
  });
}

describe('leaflet solo en web', () => {
  // app/, src/ y los ficheros de codigo de la raiz (app.config.ts y compania).
  const deRaiz = () =>
    readdirSync(raiz).filter(
      (nombre) => EXTENSIONES.test(nombre) && !/\.test\./.test(nombre) && statSync(join(raiz, nombre)).isFile(),
    );
  const archivos = () =>
    [...deRaiz(), ...['app', 'src'].flatMap(listar)].map((ruta) => ({
      ruta,
      codigo: readFileSync(join(raiz, ruta), 'utf8'),
    }));

  it('app/ y src/ cumplen la regla', () => {
    assert.deepEqual(violaciones(archivos()), []);
  });

  it('el guardia mira algo: alguna variante web usa react-leaflet', () => {
    assert.ok(archivos().some(({ ruta, codigo }) => /\.web\./.test(ruta) && importsDe(codigo).includes('react-leaflet')));
  });

  it('detecta imports de leaflet, react-leaflet y mapaWeb fuera de .web.*', () => {
    const casos = [
      "import L from 'leaflet';",
      "import 'leaflet/dist/leaflet.css';",
      "import { MapContainer } from 'react-leaflet';",
      "import { OSM_TILES } from '../lib/mapaWeb';",
      "import { OSM_TILES } from '@/lib/mapaWeb';",
      "const L = require('leaflet');",
      "const m = await import('react-leaflet');",
      "export { iconoParada } from './mapaWeb';",
      "import { RutaMapa } from '../../src/components/RutaMapa.web';",
      "import { RutaMapa } from './RutaMapa.web.tsx';",
    ];
    for (const codigo of casos) {
      assert.equal(violaciones([{ ruta: 'app/(tabs)/ruta.tsx', codigo }]).length, 1, codigo);
    }
  });

  it('no marca variantes web, imports de solo tipos, comentarios ni paquetes parecidos', () => {
    assert.deepEqual(violaciones([{ ruta: 'src/components/X.web.tsx', codigo: "import 'react-leaflet';" }]), []);
    assert.deepEqual(violaciones([{ ruta: 'src/lib/mapaWeb.ts', codigo: "import * as L from 'leaflet';" }]), []);
    const limpio = [
      "import type * as L from 'leaflet';",
      "// import L from 'leaflet';",
      "/* require('leaflet') */",
      "import x from 'leaflet-extra-cosa';",
      "import { OSM_COPYRIGHT_URL } from '../lib/osm';",
    ].join('\n');
    assert.deepEqual(violaciones([{ ruta: 'app/(tabs)/ruta.tsx', codigo: limpio }]), []);
  });
});

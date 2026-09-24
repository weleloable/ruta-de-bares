import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

/**
 * Los iconos salen de scripts/generar-iconos.py, a partir de assets/marca/.
 *
 * Lo que se vigila es lo que se rompe sin que nadie lo vea en el ordenador:
 * - que un icono cuadrado lleve las esquinas blancas de la maqueta original
 *   (el movil aplica su mascara y asoman cunas blancas en la pantalla de inicio);
 * - que el logo de la barra o del login tenga fondo opaco (se veria un cuadrado);
 * - que vuelva el sello "RB" viejo o el icono de plantilla de Expo;
 * - que app.config.ts o el manifest apunten a un fichero que no existe o con
 *   otro tamano del que declaran.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8');

type Png = { ancho: number; alto: number; canales: number; pixel: (x: number, y: number) => number[] };

/** Lector minimo de PNG de 8 bits sin entrelazar (lo que escribe Pillow para RGB/RGBA). */
export function leerPng(rel: string): Png {
  const buf = readFileSync(join(raiz, rel));
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${rel} no es un PNG`);
  let pos = 8;
  let ancho = 0;
  let alto = 0;
  let canales = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const tipo = buf.subarray(pos + 4, pos + 8).toString('latin1');
    const datos = buf.subarray(pos + 8, pos + 8 + largo);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      assert.equal(datos[8], 8, `${rel}: se esperan 8 bits por canal`);
      assert.equal(datos[12], 0, `${rel}: entrelazado no soportado`);
      canales = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[datos[9]];
      assert.ok(canales, `${rel}: tipo de color ${datos[9]} no soportado (paleta?)`);
    } else if (tipo === 'IDAT') idat.push(datos);
    pos += 12 + largo;
  }
  const crudo = inflateSync(Buffer.concat(idat));
  const fila = ancho * canales;
  const px = Buffer.alloc(fila * alto);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)];
    for (let i = 0; i < fila; i++) {
      const v = crudo[y * (fila + 1) + 1 + i];
      const a = i >= canales ? px[y * fila + i - canales] : 0;
      const b = y > 0 ? px[(y - 1) * fila + i] : 0;
      const c = i >= canales && y > 0 ? px[(y - 1) * fila + i - canales] : 0;
      let pred = 0;
      if (filtro === 1) pred = a;
      else if (filtro === 2) pred = b;
      else if (filtro === 3) pred = (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * fila + i] = (v + pred) & 0xff;
    }
  }
  return {
    ancho,
    alto,
    canales,
    pixel: (x, y) => [...px.subarray(y * fila + x * canales, y * fila + (x + 1) * canales)],
  };
}

const esquinas = (p: Png) => [
  p.pixel(0, 0),
  p.pixel(p.ancho - 1, 0),
  p.pixel(0, p.alto - 1),
  p.pixel(p.ancho - 1, p.alto - 1),
];

// Crema del logo: CREMA en generar-iconos.py.
const CREMA = [251, 247, 235];

// Iconos cuadrados con fondo liso hasta el borde, y su lado.
const CUADRADOS: Record<string, number> = {
  'assets/icon.png': 1024,
  'assets/android-icon-background.png': 1024,
  'assets/favicon.png': 48,
  'public/icons/icon-192.png': 192,
  'public/icons/icon-512.png': 512,
  'public/icons/apple-touch-icon.png': 180,
  'public/icons/maskable-512.png': 512,
};

// Con transparencia alrededor: se pintan sobre otro color.
const TRANSPARENTES: Record<string, number> = {
  'assets/android-icon-foreground.png': 1024,
  'assets/android-icon-monochrome.png': 1024,
  'assets/logo.png': 288,
  'assets/logo-barra.png': 144,
};

describe('iconos: tamano y fondo', () => {
  for (const [rel, lado] of Object.entries(CUADRADOS)) {
    it(`${rel}: ${lado}x${lado}, esquinas del crema del logo (no blancas)`, () => {
      const png = leerPng(rel);
      assert.deepEqual([png.ancho, png.alto], [lado, lado]);
      for (const p of esquinas(png)) assert.deepEqual(p.slice(0, 3), CREMA);
      if (png.canales === 4) for (const p of esquinas(png)) assert.equal(p[3], 255);
    });
  }

  for (const [rel, lado] of Object.entries(TRANSPARENTES)) {
    it(`${rel}: ${lado}x${lado}, esquinas transparentes y centro opaco`, () => {
      const png = leerPng(rel);
      assert.deepEqual([png.ancho, png.alto], [lado, lado]);
      assert.equal(png.canales, 4, 'necesita canal alfa');
      for (const p of esquinas(png)) assert.equal(p[3], 0);
      // En el monocromo el centro cae entre letras; basta con que algo sea opaco.
      const centro = png.pixel(lado >> 1, lado >> 1)[3];
      if (!rel.includes('monochrome')) assert.equal(centro, 255);
    });
  }

  it('el logo de la barra (pato) no es el mismo que el de la app', () => {
    const logo = readFileSync(join(raiz, 'assets/marca/logo-10.png'));
    const pato = readFileSync(join(raiz, 'assets/marca/logo-11.png'));
    assert.notDeepEqual(logo, pato);
  });
});

describe('iconos: quien los usa', () => {
  const sinComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('app.config.ts apunta a ficheros que existen', () => {
    const config = sinComentarios(leer('app.config.ts'));
    const rutas = [...config.matchAll(/'\.\/(assets\/[^']+\.png)'/g)].map((m) => m[1]);
    assert.deepEqual(
      [...rutas].sort(),
      [
        'assets/android-icon-background.png',
        'assets/android-icon-foreground.png',
        'assets/android-icon-monochrome.png',
        'assets/favicon.png',
        'assets/icon.png',
      ],
    );
    for (const r of rutas) assert.ok(existsSync(join(raiz, r)), r);
    // El fondo del adaptativo es el crema del logo, no el marron de la plantilla.
    assert.match(config, /backgroundColor:\s*'#FBF7EB'/);
  });

  it('el manifest declara el tamano real de cada icono', () => {
    const manifest = JSON.parse(leer('public/manifest.json')) as { icons: { src: string; sizes: string }[] };
    assert.ok(manifest.icons.length >= 3);
    for (const { src, sizes } of manifest.icons) {
      const png = leerPng(`public/${src}`);
      assert.equal(`${png.ancho}x${png.alto}`, sizes, src);
    }
  });

  it('la barra superior pinta el pato y el login el logo de la app', () => {
    assert.match(leer('src/components/BarraSuperior.tsx'), /require\('\.\.\/\.\.\/assets\/logo-barra\.png'\)/);
    assert.match(leer('app/(auth)/login.tsx'), /require\('\.\.\/\.\.\/assets\/logo\.png'\)/);
  });

  it('no queda el sello "RB" viejo en ninguna pantalla ni en la pagina sin conexion', () => {
    const ficheros: string[] = ['public/sw.js', 'public/index.html'];
    const recorrer = (dir: string) => {
      for (const f of readdirSync(join(raiz, dir))) {
        const rel = `${dir}/${f}`;
        if (statSync(join(raiz, rel)).isDirectory()) recorrer(rel);
        else if (/\.tsx?$/.test(f) && !f.includes('.test.')) ficheros.push(rel);
      }
    };
    recorrer('app');
    recorrer('src');
    for (const rel of ficheros) {
      const codigo = leer(rel);
      assert.doesNotMatch(codigo, />\s*RB\s*</, `${rel} pinta el sello RB`);
      assert.doesNotMatch(codigo, /icono-web\.png/, `${rel} usa el icono viejo`);
    }
  });
});

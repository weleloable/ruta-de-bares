import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * El estilo del juego: La Mancha a pleno sol, en colores vivos y con sombreado
 * de dibujos animados (por bandas, sin degradados) y contorno negro en los
 * personajes y obstaculos, a lo Subway Surfers. Siempre es de dia.
 */
export const PALETA = {
  // Cielo, de arriba abajo, y la bruma del horizonte (lo lejano se funde con ella).
  cieloArriba: 0x3d8fe0,
  cieloMedio: 0x7cc0f2,
  horizonte: 0xd6efff,
  niebla: 0xcde8fb,
  sol: 0xfff6c8,
  nube: 0xffffff,
  // El suelo: trigo, viñas y el camino de tierra.
  campo: 0xe7c35a,
  campoOscuro: 0xd2a945,
  vina: 0x6aa83f,
  camino: 0xdcae74,
  rayaCamino: 0xf6ead0,
  mojon: 0xeee7d6,
  monte: 0x9fbe73,
  monteLejano: 0xb9cfa0,
  // Madera, piedra, cal y teja.
  madera: 0x9a6233,
  maderaClara: 0xc98c4f,
  piedra: 0xd8c39a,
  cal: 0xf6efe0,
  ocre: 0xe9cf9c,
  teja: 0xc0582f,
  sombra: 0x8c7a5c,
  // Lo que se recoge.
  oro: 0xffbf2e,
  plata: 0xe6ecf2,
  queso: 0xffd54a,
  // El contorno.
  contorno: 0x24160e,
} as const;

/** Las bandas de luz del sombreado de dibujos (tres tonos, sin degradado). */
function gradiente(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * Materiales compartidos, uno por color (crear uno por pieza multiplica las
 * llamadas de dibujo). `toon` es el de casi todo; `pintado` el de las piezas
 * fundidas, que llevan el color en cada vertice (ver `pintar`).
 */
export class Materiales {
  private readonly cache = new Map<string, THREE.Material>();
  private readonly bandas = gradiente();

  toon(color: number): THREE.MeshToonMaterial {
    const clave = `toon-${color}`;
    let m = this.cache.get(clave) as THREE.MeshToonMaterial | undefined;
    if (!m) {
      m = new THREE.MeshToonMaterial({ color, gradientMap: this.bandas });
      this.cache.set(clave, m);
    }
    return m;
  }

  /** Para geometrias fundidas con un color por pieza (atributo `color`). */
  pintado(): THREE.MeshToonMaterial {
    let m = this.cache.get('pintado') as THREE.MeshToonMaterial | undefined;
    if (!m) {
      m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: this.bandas });
      this.cache.set('pintado', m);
    }
    return m;
  }

  /** Lo que brilla por si solo (las jarras): no le afecta la luz ni la niebla. */
  brillo(color: number): THREE.MeshBasicMaterial {
    const clave = `brillo-${color}`;
    let m = this.cache.get(clave) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, fog: false });
      this.cache.set(clave, m);
    }
    return m;
  }

  /**
   * El contorno negro: la misma malla, por detras, empujada un poco hacia fuera
   * por sus normales ("casco invertido"). Barato y sin pasadas extra.
   */
  contorno(grosor = 0.06): THREE.MeshBasicMaterial {
    const clave = `contorno-${grosor}`;
    let m = this.cache.get(clave) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: PALETA.contorno, side: THREE.BackSide });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normal * ${grosor.toFixed(3)};`);
      };
      m.customProgramCacheKey = () => clave;
      this.cache.set(clave, m);
    }
    return m;
  }

  liberar() {
    this.cache.forEach((m) => m.dispose());
    this.cache.clear();
    this.bandas.dispose();
  }
}

/** Le pone contorno a todas las mallas de un objeto (no a las que brillan ni a las instanciadas). */
export function ponerContorno(objeto: THREE.Object3D, mats: Materiales, grosor?: number) {
  const mallas: THREE.Mesh[] = [];
  objeto.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && !(o.material instanceof THREE.MeshBasicMaterial)) mallas.push(o);
  });
  for (const m of mallas) {
    const borde = new THREE.Mesh(m.geometry, mats.contorno(grosor));
    m.add(borde);
  }
}

/** Le da un color a toda una geometria (atributo `color`), para fundirla con otras de otro color. */
export function pintar(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const limpia = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = limpia.attributes.position!.count;
  const datos = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) datos.set([c.r, c.g, c.b], k * 3);
  limpia.setAttribute('color', new THREE.BufferAttribute(datos, 3));
  return limpia;
}

/** Funde piezas ya pintadas en una sola geometria (una llamada de dibujo). */
export function fundirPintadas(partes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(partes, false)!;
}

/** Una caja ya colocada. */
export function caja(x: number, y: number, z: number, px: number, py: number, pz: number) {
  const g = new THREE.BoxGeometry(x, y, z);
  g.translate(px, py, pz);
  return g;
}

/** Una textura de halo (degradado radial) pintada una vez en un canvas: para el sol y lo que brilla. */
export function texturaHalo(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, color);
  r.addColorStop(0.35, `${color}88`);
  r.addColorStop(1, `${color}00`);
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

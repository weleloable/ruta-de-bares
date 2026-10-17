import * as THREE from 'three';

/**
 * Colores del juego: siluetas casi negras a contraluz contra un atardecer. Lo
 * unico con color de verdad seran los objetos que se recogen (jarras, yelmo,
 * queso). El camino va un poco iluminado por el sol, para que lo oscuro se lea
 * encima.
 */
export const PALETA = {
  // Cielo, de arriba abajo, y la niebla (el color del horizonte: lo lejano se funde con el).
  cieloArriba: 0x2e1846,
  cieloMedio: 0xb2496f,
  cieloBajo: 0xee7a3a,
  horizonte: 0xffbf66,
  niebla: 0xe99257,
  sol: 0xffe39a,
  // Siluetas: casi negro, con un punto de purpura para que no sea gris.
  silueta: 0x170d14,
  siluetaClara: 0x2a1820,
  campo: 0x2a1519,
  camino: 0x8c5537,
  rayaCamino: 0xb3754a,
  // Lo unico con color.
  oro: 0xffb52e,
} as const;

/**
 * Materiales compartidos, uno por color (crear uno por pieza multiplica las
 * llamadas de dibujo). Lambert: sin brillos, barato, y la luz del cielo da un
 * poco de volumen a las siluetas cercanas.
 */
export class Materiales {
  private readonly cache = new Map<string, THREE.Material>();

  mate(color: number): THREE.MeshLambertMaterial {
    const clave = `mate-${color}`;
    let m = this.cache.get(clave) as THREE.MeshLambertMaterial | undefined;
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true });
      this.cache.set(clave, m);
    }
    return m;
  }

  /** Lo que brilla por si solo (la jarra dorada): no le afecta la luz ni la niebla. */
  brillo(color: number): THREE.MeshBasicMaterial {
    const clave = `brillo-${color}`;
    let m = this.cache.get(clave) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, fog: false });
      this.cache.set(clave, m);
    }
    return m;
  }

  liberar() {
    this.cache.forEach((m) => m.dispose());
    this.cache.clear();
  }
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

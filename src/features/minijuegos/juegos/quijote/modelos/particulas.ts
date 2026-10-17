import * as THREE from 'three';

import { texturaHalo } from './paleta';

/**
 * Particulas baratas: un solo THREE.Points con un numero fijo de puntos que se
 * reutilizan (nada se crea ni se destruye en plena partida). Sirve para el
 * polvo que levanta Rocinante y la espuma dorada al coger una jarra. Las
 * posiciones son las de la escena (el jugador en z = 0): lo que queda en el
 * suelo se va quedando atras con la velocidad del camino.
 */

const N = 220;

type Particula = { vivo: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; vida: number; total: number; gravedad: number; suelo: boolean };

export class Particulas {
  readonly puntos: THREE.Points;
  private readonly p: Particula[] = Array.from({ length: N }, () => ({ vivo: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, vida: 0, total: 1, gravedad: 0, suelo: false }));
  private readonly posiciones = new Float32Array(N * 3);
  /** Color y transparencia de cada punto (rgba): sobre un fondo claro, se desvanece en vez de oscurecerse. */
  private readonly colores = new Float32Array(N * 4);
  private readonly color = new THREE.Color();
  private readonly geo = new THREE.BufferGeometry();
  private readonly tex = texturaHalo('#ffffff');
  private readonly mat: THREE.PointsMaterial;
  private siguiente = 0;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posiciones, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colores, 4).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({
      size: 0.45,
      map: this.tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.puntos = new THREE.Points(this.geo, this.mat);
    this.puntos.frustumCulled = false;
  }

  private nueva(): Particula {
    const q = this.p[this.siguiente]!;
    this.siguiente = (this.siguiente + 1) % N;
    return q;
  }

  /** Espuma dorada: un estallido de gotas desde la jarra. */
  espuma(x: number, y: number, z: number, azar: () => number) {
    for (let k = 0; k < 10; k++) {
      const q = this.nueva();
      Object.assign(q, {
        vivo: true,
        x,
        y,
        z,
        vx: (azar() - 0.5) * 5,
        vy: 2 + azar() * 4,
        vz: (azar() - 0.5) * 3,
        vida: 0.6,
        total: 0.6,
        gravedad: 12,
        suelo: false,
      });
    }
  }

  /** Polvo de los cascos: se queda en el camino (y por tanto se va hacia atras). */
  polvo(x: number, azar: () => number) {
    const q = this.nueva();
    Object.assign(q, {
      vivo: true,
      x: x + (azar() - 0.5) * 0.8,
      y: 0.15,
      z: 0.6,
      vx: (azar() - 0.5) * 1.2,
      vy: 0.6 + azar() * 0.8,
      vz: 0,
      vida: 0.7,
      total: 0.7,
      gravedad: 0.4,
      suelo: true,
    });
  }

  /** Avanza y vuelca al buffer. `camino` es la velocidad del camino (m/s). */
  avanzar(dt: number, camino: number) {
    for (let k = 0; k < N; k++) {
      const q = this.p[k]!;
      if (q.vivo) {
        q.vida -= dt;
        if (q.vida <= 0) q.vivo = false;
        q.vy -= q.gravedad * dt;
        q.x += q.vx * dt;
        q.y = Math.max(0.05, q.y + q.vy * dt);
        // El polvo se queda en el suelo: el camino se lo lleva. La espuma va con el jugador (casi).
        q.z += (q.vz + (q.suelo ? camino : camino * 0.15)) * dt;
      }
      const f = q.vivo ? q.vida / q.total : 0;
      this.posiciones[k * 3] = q.x;
      this.posiciones[k * 3 + 1] = q.vivo ? q.y : -100;
      this.posiciones[k * 3 + 2] = q.z;
      this.color.set(q.suelo ? 0xc9a26a : 0xffc63a);
      this.colores[k * 4] = this.color.r;
      this.colores[k * 4 + 1] = this.color.g;
      this.colores[k * 4 + 2] = this.color.b;
      this.colores[k * 4 + 3] = q.suelo ? f * 0.6 : f;
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
  }

  liberar() {
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

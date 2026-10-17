import * as THREE from 'three';

import { CONFIG, OBSTACULOS, xDeCarril, type Estado, type Obstaculo, type TipoObstaculo } from './modelo';

/**
 * Don Quijote Cervecero en 3D (three.js, solo web). Solo pinta: la logica es
 * modelo.ts. El jugador esta siempre en z = 0 y el mundo se le acerca: lo que
 * esta a `s` metros del camino se pinta en z = -(s - dist).
 *
 * Fase 1: cubos. Pensado para moviles normales desde ya: sin sombras, densidad
 * de pixeles como mucho 2, materiales sin luces caras y los obstaculos sacados
 * de un POOL (se reutilizan, no se crean ni se destruyen en plena partida).
 */

const CIELO = 0x3a2140;
const SUELO = 0x1a1210;
const CAMINO = 0x2b1d16;

/** La camara: por detras y por encima del jugador, mirando al horizonte. */
export const CAMARA = { altura: 4.4, detras: 7.5, mira: 14, fovMin: 60, fovMax: 72 };

type Pool = { libres: THREE.Object3D[]; usados: Map<number, THREE.Object3D> };

export class Escena3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly escena = new THREE.Scene();
  private readonly camara = new THREE.PerspectiveCamera(CAMARA.fovMin, 1, 0.1, 400);
  private readonly jugador = new THREE.Group();
  private readonly cuerpo: THREE.Mesh;
  private readonly rayas: THREE.Mesh[] = [];
  private readonly postes: THREE.Mesh[] = [];
  private readonly suelo: THREE.Mesh;
  private readonly pools: Record<TipoObstaculo, Pool>;
  private readonly geometrias: THREE.BufferGeometry[] = [];
  private readonly materiales: THREE.Material[] = [];
  private camX = 0;
  private readonly tam = new THREE.Vector2();
  private densidad = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(CIELO);
    this.escena.background = new THREE.Color(CIELO);
    this.escena.fog = new THREE.Fog(CIELO, 30, 150);
    this.escena.add(new THREE.HemisphereLight(0xffc8a0, 0x201010, 1.6));

    // Suelo y camino: se mueven con el jugador (son "infinitos").
    this.suelo = this.malla(new THREE.PlaneGeometry(400, 400), this.mate(SUELO));
    this.suelo.rotation.x = -Math.PI / 2;
    this.escena.add(this.suelo);
    const anchoCamino = CONFIG.carriles * CONFIG.anchoCarril + 1;
    const camino = this.malla(new THREE.PlaneGeometry(anchoCamino, 400), this.mate(CAMINO));
    camino.rotation.x = -Math.PI / 2;
    camino.position.set(0, 0.01, -150);
    this.escena.add(camino);

    // Rayas entre carriles y postes a los lados: lo que da sensacion de velocidad.
    const raya = new THREE.PlaneGeometry(0.12, 2.5);
    const mRaya = this.mate(0x6b4a33);
    for (let k = 0; k < 40; k++) {
      for (const lado of [-0.5, 0.5]) {
        const r = this.malla(raya, mRaya);
        r.rotation.x = -Math.PI / 2;
        r.position.set(lado * CONFIG.anchoCarril, 0.02, 0);
        this.escena.add(r);
        this.rayas.push(r);
      }
    }
    const poste = new THREE.BoxGeometry(0.3, 1.6, 0.3);
    const mPoste = this.mate(0x120c0a);
    for (let k = 0; k < 30; k++) {
      for (const lado of [-1, 1]) {
        const p = this.malla(poste, mPoste);
        p.position.set(lado * (anchoCamino / 2 + 1.5), 0.8, 0);
        this.escena.add(p);
        this.postes.push(p);
      }
    }

    // El sol, grande y al fondo del camino, sin niebla.
    const sol = new THREE.Mesh(new THREE.CircleGeometry(26, 40), new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false }));
    sol.position.set(0, 10, -320);
    this.escena.add(sol);

    // El jugador: un cubo (Quijote y Rocinante llegan en la fase 2).
    this.cuerpo = this.malla(new THREE.BoxGeometry(CONFIG.jugador.ancho, CONFIG.jugador.alto, CONFIG.jugador.largo), this.mate(0xc67a1e));
    this.cuerpo.position.y = CONFIG.jugador.alto / 2;
    this.jugador.add(this.cuerpo);
    this.escena.add(this.jugador);

    // Un pool por tipo de obstaculo, con la geometria y el material compartidos.
    const color: Record<TipoObstaculo, number> = { bajo: 0x5a4a40, alto: 0x7a3a22, bloque: 0x2a201a };
    this.pools = { bajo: this.pool('bajo', color.bajo), alto: this.pool('alto', color.alto), bloque: this.pool('bloque', color.bloque) };
  }

  private mate(c: number) {
    const m = new THREE.MeshLambertMaterial({ color: c });
    this.materiales.push(m);
    return m;
  }

  private malla(g: THREE.BufferGeometry, m: THREE.Material) {
    if (!this.geometrias.includes(g)) this.geometrias.push(g);
    return new THREE.Mesh(g, m);
  }

  private pool(tipo: TipoObstaculo, color: number): Pool {
    const O = OBSTACULOS[tipo];
    const g = new THREE.BoxGeometry(O.ancho, O.techo - O.base, O.largo);
    g.translate(0, (O.techo + O.base) / 2, 0);
    this.geometrias.push(g);
    const m = this.mate(color);
    const libres: THREE.Object3D[] = [];
    for (let k = 0; k < 24; k++) {
      const malla = new THREE.Mesh(g, m);
      malla.visible = false;
      this.escena.add(malla);
      libres.push(malla);
    }
    return { libres, usados: new Map() };
  }

  /** Coloca los obstaculos de este fotograma: reutiliza los que siguen y devuelve al pool los que ya no. */
  private ponerObstaculos(obstaculos: readonly Obstaculo[], dist: number) {
    const vivos = new Set<number>();
    for (const o of obstaculos) {
      const pool = this.pools[o.tipo];
      let malla = pool.usados.get(o.id);
      if (!malla) {
        malla = pool.libres.pop();
        if (!malla) continue; // Pool agotado: mejor no pintarlo que crear en plena partida.
        pool.usados.set(o.id, malla);
        malla.visible = true;
      }
      malla.position.set(xDeCarril(o.carril), 0, -(o.s - dist));
      vivos.add(o.id);
    }
    for (const pool of Object.values(this.pools)) {
      for (const [id, malla] of pool.usados) {
        if (vivos.has(id)) continue;
        malla.visible = false;
        pool.usados.delete(id);
        pool.libres.push(malla);
      }
    }
  }

  dibujar(e: Estado, ancho: number, alto: number, densidad: number, temblor: number, dt: number) {
    if (densidad !== this.densidad) {
      this.densidad = densidad;
      this.renderer.setPixelRatio(densidad);
    }
    this.renderer.getSize(this.tam);
    if (this.tam.x !== ancho || this.tam.y !== alto) this.renderer.setSize(ancho, alto, false);

    // El mundo que se repite: suelo, rayas y postes, al modulo de lo recorrido.
    this.suelo.position.z = -100;
    const tramoRaya = 6;
    this.rayas.forEach((r, k) => {
      const fila = Math.floor(k / 2);
      r.position.z = -(fila * tramoRaya - (e.dist % tramoRaya)) + 6;
    });
    const tramoPoste = 10;
    this.postes.forEach((p, k) => {
      const fila = Math.floor(k / 2);
      p.position.z = -(fila * tramoPoste - (e.dist % tramoPoste)) + 8;
    });

    this.ponerObstaculos(e.obstaculos, e.dist);

    // El jugador: su carril, su salto y agachado (el cubo se aplasta).
    const agachado = e.t < e.agachadoHasta;
    this.jugador.position.set(e.x, e.y, 0);
    this.cuerpo.scale.y = agachado ? CONFIG.jugador.altoAgachado / CONFIG.jugador.alto : 1;
    this.cuerpo.position.y = (agachado ? CONFIG.jugador.altoAgachado : CONFIG.jugador.alto) / 2;
    this.jugador.visible = !(e.t < e.invulnerableHasta && Math.floor(e.t * 10) % 2 === 0);

    // La camara sigue el carril con algo de retraso y abre el angulo con la velocidad.
    this.camX += (e.x - this.camX) * (1 - Math.exp(-8 * dt));
    const rapidez = (e.velocidad - CONFIG.velocidadInicial) / (CONFIG.velocidadMaxima - CONFIG.velocidadInicial);
    this.camara.fov = CAMARA.fovMin + (CAMARA.fovMax - CAMARA.fovMin) * Math.max(0, Math.min(1, rapidez));
    this.camara.aspect = ancho / Math.max(1, alto);
    this.camara.updateProjectionMatrix();
    const tx = (Math.random() - 0.5) * temblor;
    const ty = (Math.random() - 0.5) * temblor;
    this.camara.position.set(this.camX * 0.85 + tx, CAMARA.altura + ty, CAMARA.detras);
    this.camara.lookAt(this.camX * 0.6, 1.2, -CAMARA.mira);

    this.renderer.render(this.escena, this.camara);
  }

  liberar() {
    this.geometrias.forEach((g) => g.dispose());
    this.materiales.forEach((m) => m.dispose());
    this.renderer.dispose();
  }
}

/** Si el navegador sabe hacer WebGL (si no, el juego lo dice en vez de quedarse en negro). */
export function hayWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

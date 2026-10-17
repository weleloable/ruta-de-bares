import * as THREE from 'three';

import { CONFIG, embistiendo, MOLINO, xDeCarril, type Estado, type Obstaculo, type TipoObstaculo } from './modelo';
import { Alcala } from './modelos/alcala';
import { crearCielo, type Cielo } from './modelos/cielo';
import { crearArboles, crearMontes, zReciclada, type Arboles, type Montes } from './modelos/decorado';
import { crearMolino, geometriasMolino, type Molino } from './modelos/molino';
import { FabricaObstaculos, type PiezaObstaculo } from './modelos/obstaculos';
import { Materiales, PALETA, texturaHalo } from './modelos/paleta';
import { Particulas } from './modelos/particulas';
import { crearQuijote, type Jinete } from './modelos/quijote';
import { crearRecogibles, type Recogibles } from './modelos/recogibles';
import { enAlcala } from './recorrido';

/**
 * Don Quijote Cervecero en 3D (three.js, solo web). Solo pinta: la logica es
 * modelo.ts. El jugador esta siempre en z = 0 y el mundo se le acerca: lo que
 * esta a `s` metros del camino se pinta en z = -(s - dist).
 *
 * Estetica de dibujos a pleno sol (a lo Subway Surfers): cielo azul con nubes,
 * campos de trigo, colores vivos con sombreado por bandas y contorno negro en
 * Quijote y los obstaculos. La bruma del horizonte funde lo lejano.
 *
 * Para que vaya en un movil normal: sin sombras, densidad de pixeles como mucho
 * 2, materiales mates compartidos, obstaculos sacados de un POOL (con sus
 * piezas fijas fundidas), jarras y arboles con instancing, montes fundidos en
 * una geometria por capa y unas particulas que se reutilizan.
 */

/** La camara: por detras y por encima del jugador, mirando al horizonte. */
export const CAMARA = { altura: 6.4, detras: 8.5, mira: 20, fovMin: 58, fovMax: 70 };

const MOLINOS = { n: 5, periodo: 520 };

type Pool = { libres: PiezaObstaculo[]; usados: Map<number, PiezaObstaculo> };
/** Cuantos de cada tipo puede haber a la vez en pantalla. */
const POOL: Record<TipoObstaculo, number> = { bajo: 16, alto: 12, bloque: 20, ovejas: 10, odre: 8, molino: 5 };

export class Escena3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly escena = new THREE.Scene();
  private readonly camara = new THREE.PerspectiveCamera(CAMARA.fovMin, 1, 0.1, 420);
  private readonly mats = new Materiales();
  private readonly geometrias: THREE.BufferGeometry[] = [];
  private readonly cielo: Cielo;
  private readonly montes: Montes;
  private readonly arboles: Arboles;
  private readonly molinos: { molino: Molino; s: number; x: number }[] = [];
  private readonly jinete: Jinete;
  private readonly rayas: THREE.Mesh[] = [];
  private readonly mojones: THREE.Mesh[] = [];
  private readonly pools: Record<TipoObstaculo, Pool>;
  private readonly recogibles: Recogibles & { liberar(): void };
  private readonly particulas = new Particulas();
  private polvo = 0;
  private readonly alcala: Alcala;
  private readonly luzCielo: THREE.HemisphereLight;
  private readonly luzSol: THREE.DirectionalLight;
  private embestidaVista = 0;
  private readonly sombra: THREE.Mesh;
  private readonly aura: THREE.Sprite;
  private readonly texAura: THREE.CanvasTexture;
  private readonly proyectado = new THREE.Vector3();
  private readonly tam = new THREE.Vector2();
  private densidad = 0;
  private camX = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    // Bruma clara al fondo: lo lejano se funde con el horizonte.
    this.escena.fog = new THREE.Fog(PALETA.niebla, 60, 300);
    // Luz de mediodia: cielo blanco desde arriba y el sol desde atras y a la izquierda
    // (asi lo que ve la camara esta iluminado y el sombreado de dibujos se nota).
    this.luzCielo = new THREE.HemisphereLight(0xffffff, 0xb59a62, 1.25);
    this.luzSol = new THREE.DirectionalLight(0xfff1d8, 1.9);
    this.luzSol.position.set(-40, 80, 60);
    this.escena.add(this.luzCielo, this.luzSol);

    // Azar fijo para el paisaje: el mismo en todas las partidas.
    let semilla = 11;
    const azar = () => (semilla = (semilla * 9301 + 49297) % 233280) / 233280;

    this.cielo = crearCielo();
    this.escena.add(this.cielo.grupo);
    this.montes = crearMontes(this.mats, azar, this.geometrias);
    this.escena.add(this.montes.grupo);

    // El campo de trigo con sus surcos y el camino de tierra clara.
    const campo = this.malla(new THREE.PlaneGeometry(700, 700), this.mats.toon(PALETA.campo));
    campo.rotation.x = -Math.PI / 2;
    campo.position.z = -250;
    const anchoCamino = CONFIG.carriles * CONFIG.anchoCarril + 1.2;
    const camino = this.malla(new THREE.PlaneGeometry(anchoCamino, 700), this.mats.toon(PALETA.camino));
    camino.rotation.x = -Math.PI / 2;
    camino.position.set(0, 0.01, -250);
    // Los bordes del camino, algo mas oscuros: separan la tierra del trigo.
    const borde = new THREE.PlaneGeometry(0.5, 700);
    this.geometrias.push(borde);
    for (const lado of [-1, 1]) {
      const b = new THREE.Mesh(borde, this.mats.toon(0xb98a55));
      b.rotation.x = -Math.PI / 2;
      b.position.set(lado * (anchoCamino / 2 + 0.25), 0.012, -250);
      this.escena.add(b);
    }
    // Surcos del trigo, paralelos al camino.
    const surco = new THREE.PlaneGeometry(0.9, 700);
    this.geometrias.push(surco);
    for (let k = 0; k < 14; k++) {
      for (const lado of [-1, 1]) {
        const sc = new THREE.Mesh(surco, this.mats.toon(PALETA.campoOscuro));
        sc.rotation.x = -Math.PI / 2;
        sc.position.set(lado * (anchoCamino / 2 + 3 + k * 3.2), 0.005, -250);
        this.escena.add(sc);
      }
    }
    this.escena.add(campo, camino);

    // Rayas entre carriles y mojones a los lados: lo que da sensacion de velocidad.
    const raya = new THREE.PlaneGeometry(0.1, 2.2);
    this.geometrias.push(raya);
    for (let k = 0; k < 36; k++) {
      for (const lado of [-0.5, 0.5]) {
        const r = new THREE.Mesh(raya, this.mats.toon(PALETA.rayaCamino));
        r.rotation.x = -Math.PI / 2;
        r.position.set(lado * CONFIG.anchoCarril, 0.02, 0);
        this.escena.add(r);
        this.rayas.push(r);
      }
    }
    const mojon = new THREE.BoxGeometry(0.35, 0.7, 0.25);
    mojon.translate(0, 0.35, 0);
    this.geometrias.push(mojon);
    for (let k = 0; k < 16; k++) {
      for (const lado of [-1, 1]) {
        const m = new THREE.Mesh(mojon, this.mats.toon(PALETA.mojon));
        m.position.set(lado * (anchoCamino / 2 + 0.8), 0, 0);
        this.escena.add(m);
        this.mojones.push(m);
      }
    }

    // Arboles sueltos (instancing) y molinos lejanos con las aspas girando.
    this.arboles = crearArboles(this.mats, azar, this.geometrias);
    this.escena.add(this.arboles.malla);
    const gMolino = geometriasMolino();
    this.geometrias.push(...gMolino.todas);
    for (let k = 0; k < MOLINOS.n; k++) {
      const molino = crearMolino(this.mats, gMolino, 0.8 + azar() * 0.8);
      const escala = 0.9 + azar() * 0.6;
      molino.grupo.scale.setScalar(escala);
      molino.grupo.rotation.y = (azar() - 0.5) * 0.6;
      this.escena.add(molino.grupo);
      this.molinos.push({ molino, s: (k / MOLINOS.n) * MOLINOS.periodo + 60, x: (k % 2 === 0 ? -1 : 1) * (22 + azar() * 35) });
    }

    // Don Quijote y Rocinante.
    const quijote = crearQuijote(this.mats);
    this.geometrias.push(...quijote.geometrias);
    this.jinete = quijote;
    this.escena.add(this.jinete.grupo);
    // Su sombra: un circulo oscuro en el suelo, que encoge al saltar (se nota la altura).
    const geoSombra = new THREE.CircleGeometry(0.62, 20);
    geoSombra.rotateX(-Math.PI / 2);
    geoSombra.scale(1, 1, 1.9);
    this.geometrias.push(geoSombra);
    this.sombra = new THREE.Mesh(geoSombra, new THREE.MeshBasicMaterial({ color: 0x5a3e1c, transparent: true, opacity: 0.22, depthWrite: false }));
    this.sombra.position.y = 0.03;
    this.escena.add(this.sombra);
    // El aura dorada de la Embestida, detras de Quijote.
    this.texAura = texturaHalo('#ffc53a');
    // Mezcla normal y no sumada: sobre un fondo claro, sumar luz lo deja en blanco.
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texAura, depthWrite: false, transparent: true, opacity: 0 }));
    this.aura.scale.set(6, 6, 1);
    this.escena.add(this.aura);

    // Un pool por tipo de obstaculo: todos se crean ahora, ninguno en plena partida.
    const fabrica = new FabricaObstaculos(this.mats, this.geometrias);
    const pool = (tipo: TipoObstaculo): Pool => {
      const libres: PiezaObstaculo[] = [];
      for (let k = 0; k < POOL[tipo]; k++) {
        const pieza = fabrica.crear(tipo);
        pieza.objeto.visible = false;
        this.escena.add(pieza.objeto);
        libres.push(pieza);
      }
      return { libres, usados: new Map() };
    };
    this.pools = {
      bajo: pool('bajo'),
      alto: pool('alto'),
      bloque: pool('bloque'),
      ovejas: pool('ovejas'),
      odre: pool('odre'),
      molino: pool('molino'),
    };

    // Alcala de Henares, para cuando el camino entre en ella.
    this.alcala = new Alcala(this.mats, this.geometrias);
    this.escena.add(this.alcala.grupo);

    // Jarras, yelmo y queso, y las particulas (polvo y espuma).
    this.recogibles = crearRecogibles(this.mats, this.geometrias);
    this.escena.add(this.recogibles.grupo, this.particulas.puntos);
  }

  private malla(g: THREE.BufferGeometry, m: THREE.Material) {
    this.geometrias.push(g);
    return new THREE.Mesh(g, m);
  }

  /** Coloca los obstaculos de este fotograma: reutiliza los que siguen y devuelve al pool los que ya no. */
  private ponerObstaculos(obstaculos: readonly Obstaculo[], dist: number, t: number) {
    const vivos = new Set<number>();
    for (const o of obstaculos) {
      // Lo que ya ha quedado atras no se pinta (el modelo lo guarda un poco mas, por los choques):
      // pegado a la camara taparia media pantalla. Los molinos derribados, mientras caen, si.
      if (o.s < dist - 2.5 && !(o.tipo === 'molino' && o.derribadoEn !== undefined && o.s > dist - 30)) continue;
      const pool = this.pools[o.tipo];
      let pieza = pool.usados.get(o.id);
      if (!pieza) {
        pieza = pool.libres.pop();
        if (!pieza) continue; // Pool agotado: mejor no pintarlo que crear en plena partida.
        pool.usados.set(o.id, pieza);
        pieza.reiniciar(o);
      }
      const z = -(o.s - dist);
      if (o.tipo === 'molino') {
        // La torre fuera del camino, con el plano de las aspas justo donde esta el molino en el modelo.
        pieza.objeto.position.set(o.molino!.lado * MOLINO.hx, 0, z - 2.0);
      } else {
        pieza.objeto.position.set(xDeCarril(o.carril), 0, z);
      }
      pieza.objeto.rotation.set(0, 0, 0);
      pieza.objeto.visible = true;
      pieza.animar(o, t);
      vivos.add(o.id);
    }
    for (const pool of Object.values(this.pools)) {
      for (const [id, pieza] of pool.usados) {
        if (vivos.has(id)) continue;
        pieza.objeto.visible = false;
        pool.usados.delete(id);
        pool.libres.push(pieza);
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

    // Lo que se repite, al modulo de lo recorrido.
    const tramoRaya = 6;
    this.rayas.forEach((r, k) => {
      r.position.z = zReciclada(Math.floor(k / 2) * tramoRaya, e.dist, this.rayas.length * (tramoRaya / 2), 8);
    });
    const tramoMojon = 14;
    this.mojones.forEach((m, k) => {
      m.position.z = zReciclada(Math.floor(k / 2) * tramoMojon, e.dist, this.mojones.length * (tramoMojon / 2), 10);
    });
    // Alcala, y el paisaje de La Mancha se aparta mientras se esta en ella.
    this.alcala.colocar(e.dist, CONFIG.vista.delante + 40);
    const enCiudad = (s: number) => enAlcala(s) !== null || enAlcala(s + 30) !== null;
    this.arboles.colocar(e.dist, enCiudad);
    for (const { molino, s, x } of this.molinos) {
      const z = zReciclada(s, e.dist, MOLINOS.periodo, 40);
      molino.grupo.position.set(x, 0, z);
      molino.grupo.visible = !enCiudad(e.dist - z);
      molino.girar(dt);
    }

    this.ponerObstaculos(e.obstaculos, e.dist, e.t);
    this.recogibles.colocar(e.recogibles, e.dist, e.t);

    // Espuma al coger una jarra y polvo de los cascos (solo galopando por el suelo).
    if (e.eventos.includes('jarra')) this.particulas.espuma(e.x, e.y + 1.6, -0.6, Math.random);
    if (e.y <= 0 && !e.terminado) {
      this.polvo += dt * (e.velocidad / 2.5);
      while (this.polvo >= 1) {
        this.particulas.polvo(e.x, Math.random);
        this.polvo -= 1;
      }
    }
    this.particulas.avanzar(dt, e.terminado ? 0 : e.velocidad);

    // Quijote: su carril, su salto, agachado y el galope. Parpadea si es invulnerable.
    this.jinete.grupo.position.set(e.x, e.y, 0);
    this.jinete.animar(dt, {
      velocidad: e.terminado ? 0 : e.velocidad,
      enAire: e.y > 0.01,
      agachado: e.t < e.agachadoHasta,
      embistiendo: embistiendo(e),
      escudo: e.escudo,
    });
    this.jinete.grupo.visible = !(e.t < e.invulnerableHasta && Math.floor(e.t * 10) % 2 === 0);
    const alturaSombra = Math.max(0.35, 1 - e.y / 3);
    this.sombra.position.x = e.x;
    this.sombra.scale.set(alturaSombra, 1, alturaSombra);

    // La camara sigue el carril con algo de retraso y abre el angulo con la velocidad.
    this.camX += (e.x - this.camX) * (1 - Math.exp(-8 * dt));
    const rapidez = (e.velocidad - CONFIG.velocidadInicial) / (CONFIG.velocidadMaxima - CONFIG.velocidadInicial);
    // Embistiendo, el angulo se abre algo mas (sensacion de acelerón).
    this.embestidaVista += ((embistiendo(e) ? 1 : 0) - this.embestidaVista) * (1 - Math.exp(-6 * dt));
    // El aura: late mientras embiste y se apaga al acabar.
    (this.aura.material as THREE.SpriteMaterial).opacity = this.embestidaVista * (0.55 + Math.sin(e.t * 18) * 0.2);
    this.aura.visible = this.embestidaVista > 0.02;
    this.aura.position.set(e.x, e.y + 1.7, -0.4);
    this.camara.fov = CAMARA.fovMin + (CAMARA.fovMax - CAMARA.fovMin) * Math.max(0, Math.min(1, rapidez)) + this.embestidaVista * 8;
    this.camara.aspect = ancho / Math.max(1, alto);
    this.camara.updateProjectionMatrix();
    const tx = (Math.random() - 0.5) * temblor;
    const ty = (Math.random() - 0.5) * temblor;
    this.camara.position.set(this.camX * 0.85 + tx, CAMARA.altura + ty, CAMARA.detras);
    this.camara.lookAt(this.camX * 0.6, 0.6, -CAMARA.mira);

    this.cielo.seguir(this.camara.position, e.t);
    this.montes.seguir(0);

    this.renderer.render(this.escena, this.camara);
  }

  /**
   * Donde cae en pantalla (en px CSS, desde arriba a la izquierda) un punto del
   * camino: lo que esta a `s` metros, en `x`, a `y` de altura. Para los "+250".
   * Vale para el ultimo fotograma pintado.
   */
  proyectar(s: number, x: number, y: number, dist: number, ancho: number, alto: number): { x: number; y: number } | null {
    this.proyectado.set(x, y, -(s - dist)).project(this.camara);
    if (this.proyectado.z > 1) return null;
    return { x: ((this.proyectado.x + 1) / 2) * ancho, y: ((1 - this.proyectado.y) / 2) * alto };
  }

  /** Brillos (los halos que hacen de "bloom"): se pueden apagar si el movil va justo. */
  brillos(si: boolean) {
    this.cielo.brillos(si);
    this.recogibles.brillos(si);
  }

  liberar() {
    this.cielo.liberar();
    this.alcala.liberar();
    this.texAura.dispose();
    this.recogibles.liberar();
    this.particulas.liberar();
    this.geometrias.forEach((g) => g.dispose());
    this.mats.liberar();
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

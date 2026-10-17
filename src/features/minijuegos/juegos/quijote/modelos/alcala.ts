import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ALCALA, entradasAlcala } from '../recorrido';
import { PALETA, type Materiales } from './paleta';

/**
 * Alcala de Henares en silueta, cuando el camino entra en ella (recorrido.ts):
 *  - el arco de entrada con el cartel "Bienvenido a Alcalá";
 *  - la Calle Mayor: soportales a los dos lados (columnas y, encima, las
 *    fachadas, de alturas distintas), con INSTANCING;
 *  - la fachada de la Universidad (el Colegio de San Ildefonso), a la izquierda;
 *  - la Plaza de Cervantes, a la derecha, con la estatua en su pedestal.
 * Solo hay un tramo de Alcala a la vista a la vez: las piezas son unicas y se
 * mueven al tramo que toque. Cada una se puede cambiar por un GLTF.
 */

/** A que distancia del centro del camino estan las columnas de los soportales. */
const SOPORTAL_X = 6.3;
const VANO = 4;
const MAX_VANOS = Math.ceil(ALCALA.largo / VANO) * 2;

const sinIndices = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
const fundir = (partes: THREE.BufferGeometry[]) => mergeGeometries(partes.map(sinIndices), false)!;

function caja(x: number, y: number, z: number, px: number, py: number, pz: number) {
  const g = new THREE.BoxGeometry(x, y, z);
  g.translate(px, py, pz);
  return g;
}

/** El cartel del arco, pintado una vez en un canvas. */
function texturaCartel(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a1712';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#c9954a';
  g.lineWidth = 8;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = '#ffe2a8';
  g.font = 'bold 82px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Bienvenido a Alcalá', c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Alcala {
  readonly grupo = new THREE.Group();
  private readonly arco = new THREE.Group();
  private readonly universidad: THREE.Mesh;
  private readonly plaza = new THREE.Group();
  private readonly columnas: THREE.InstancedMesh;
  private readonly muros: THREE.InstancedMesh;
  private readonly fondos: THREE.InstancedMesh;
  private readonly tex: THREE.CanvasTexture;
  private readonly matCartel: THREE.MeshBasicMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly esc = new THREE.Vector3();
  private readonly rot = new THREE.Quaternion();
  /** La altura de cada fachada (fija: siempre la misma calle). */
  private readonly alturas: number[];

  constructor(mats: Materiales, geos: THREE.BufferGeometry[]) {
    const negro = mats.mate(PALETA.silueta);
    const claro = mats.mate(PALETA.siluetaClara);

    // Arco de entrada: dos pilares fuera del camino y el dintel muy por encima de cualquier salto.
    const geoArco = fundir([
      caja(1.4, 8.4, 1.4, -6.4, 4.2, 0),
      caja(1.4, 8.4, 1.4, 6.4, 4.2, 0),
      caja(14.4, 1.2, 1.6, 0, 8.0, 0),
      ...[-6, -3, 0, 3, 6].map((x) => caja(1.0, 0.8, 1.6, x, 9.0, 0)),
    ]);
    const geoCartel = new THREE.PlaneGeometry(9.6, 1.5);
    geos.push(geoArco, geoCartel);
    this.tex = texturaCartel();
    this.matCartel = new THREE.MeshBasicMaterial({ map: this.tex });
    const cartel = new THREE.Mesh(geoCartel, this.matCartel);
    cartel.position.set(0, 6.4, 0.75);
    this.arco.add(new THREE.Mesh(geoArco, negro), cartel);

    // La Universidad: cuerpo largo, el centro mas alto con su remate y pinaculos. Mira al camino (+x).
    const geoUni = fundir([
      caja(2.2, 10, 26, 0, 5, 0),
      caja(2.6, 15, 9, 0.2, 7.5, 0),
      caja(2.8, 2.2, 5, 0.3, 16.1, 0),
      caja(3.0, 0.6, 27, 0.3, 10.3, 0),
      ...[-12, -4.5, 4.5, 12].map((z) => {
        const p = new THREE.ConeGeometry(0.45, 2.2, 4);
        p.translate(0.4, 11.6, z);
        return p;
      }),
      ...[-2.5, 2.5].map((z) => {
        const p = new THREE.ConeGeometry(0.4, 2.0, 4);
        p.translate(0.4, 16, z);
        return p;
      }),
    ]);
    geos.push(geoUni);
    this.universidad = new THREE.Mesh(geoUni, claro);
    this.grupo.add(this.universidad);

    // La Plaza de Cervantes: gradas, pedestal y la estatua con la pluma en alto.
    const geoEstatua = fundir([
      caja(5, 0.5, 5, 0, 0.25, 0),
      caja(3.6, 0.5, 3.6, 0, 0.75, 0),
      caja(2.0, 3.4, 2.0, 0, 2.7, 0),
      (() => {
        const c = new THREE.CylinderGeometry(0.42, 0.62, 2.6, 7);
        c.translate(0, 5.7, 0);
        return c;
      })(),
      (() => {
        const c = new THREE.IcosahedronGeometry(0.34, 0);
        c.translate(0, 7.25, 0);
        return c;
      })(),
      (() => {
        const c = new THREE.BoxGeometry(0.16, 1.3, 0.16);
        c.translate(0, 0.6, 0);
        c.rotateZ(0.5);
        c.translate(-0.45, 6.4, 0);
        return c;
      })(),
    ]);
    const geoFarola = fundir([caja(0.18, 4.2, 0.18, 0, 2.1, 0), caja(0.5, 0.6, 0.5, 0, 4.4, 0)]);
    geos.push(geoEstatua, geoFarola);
    this.plaza.add(new THREE.Mesh(geoEstatua, negro));
    for (const [x, z] of [
      [-3.5, -6],
      [-3.5, 6],
      [4, -9],
      [4, 9],
    ] as const) {
      const f = new THREE.Mesh(geoFarola, negro);
      f.position.set(x, 0, z);
      this.plaza.add(f);
    }

    // Los soportales: una columna por vano y, encima, el muro de la fachada; detras, el fondo oscuro.
    const geoColumna = fundir([
      (() => {
        const c = new THREE.CylinderGeometry(0.2, 0.24, 3.3, 8);
        c.translate(0, 1.65, 0);
        return c;
      })(),
      caja(0.6, 0.3, 0.6, 0, 3.45, 0),
    ]);
    const geoMuro = new THREE.BoxGeometry(1, 1, 1);
    geoMuro.translate(0, 0.5, 0);
    geos.push(geoColumna, geoMuro);
    this.columnas = new THREE.InstancedMesh(geoColumna, negro, MAX_VANOS);
    this.muros = new THREE.InstancedMesh(geoMuro, negro, MAX_VANOS);
    this.fondos = new THREE.InstancedMesh(geoMuro, claro, MAX_VANOS);
    for (const im of [this.columnas, this.muros, this.fondos]) {
      im.frustumCulled = false;
      im.count = 0;
    }
    let s = 3;
    this.alturas = Array.from({ length: MAX_VANOS }, () => 3.4 + 2.5 + ((s = (s * 9301 + 49297) % 233280) / 233280) * 4.5);

    this.grupo.add(this.arco, this.plaza, this.columnas, this.muros, this.fondos);
    this.grupo.visible = false;
  }

  /** Coloca Alcala si hay un tramo a la vista (de `dist - 30` a `dist + delante`). */
  colocar(dist: number, delante: number) {
    const entrada = entradasAlcala(dist - ALCALA.largo - 30, dist + delante)[0];
    if (entrada === undefined || entrada + ALCALA.largo < dist - 30) {
      this.grupo.visible = false;
      return;
    }
    this.grupo.visible = true;
    const z = (s: number) => -(s - dist);

    this.arco.position.set(0, 0, z(entrada));
    this.universidad.position.set(-10.8, 0, z(entrada + ALCALA.universidad));
    this.plaza.position.set(10.2, 0, z(entrada + ALCALA.plaza));

    // Vanos de soportal a los dos lados, solo los que se ven, y dejando hueco para la plaza
    // (a la derecha) y la Universidad (a la izquierda).
    let n = 0;
    const desde = Math.max(entrada + 12, dist - 20);
    const hasta = Math.min(entrada + ALCALA.largo, dist + delante);
    const primero = Math.ceil((desde - entrada) / VANO);
    for (let k = primero; entrada + k * VANO <= hasta && n < MAX_VANOS - 1; k++) {
      const local = k * VANO;
      const zz = z(entrada + local);
      for (const lado of [-1, 1] as const) {
        if (lado === 1 && Math.abs(local - ALCALA.plaza) < 26) continue;
        if (lado === -1 && Math.abs(local - ALCALA.universidad) < 15) continue;
        const alto = this.alturas[(k * 2 + (lado > 0 ? 1 : 0)) % this.alturas.length]!;
        this.pos.set(lado * SOPORTAL_X, 0, zz);
        this.esc.set(1, 1, 1);
        this.columnas.setMatrixAt(n, this.m.compose(this.pos, this.rot, this.esc));
        // El muro de encima de los soportales, al ras de las columnas.
        this.pos.set(lado * (SOPORTAL_X + 1.6), 3.6, zz);
        this.esc.set(3.6, alto - 3.6, VANO);
        this.muros.setMatrixAt(n, this.m.compose(this.pos, this.rot, this.esc));
        // El fondo del soportal (la pared de las tiendas), en sombra.
        this.pos.set(lado * (SOPORTAL_X + 3.2), 0, zz);
        this.esc.set(0.4, 3.6, VANO);
        this.fondos.setMatrixAt(n, this.m.compose(this.pos, this.rot, this.esc));
        n++;
      }
    }
    for (const im of [this.columnas, this.muros, this.fondos]) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  liberar() {
    this.tex.dispose();
    this.matCartel.dispose();
  }
}

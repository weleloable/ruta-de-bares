import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { PALETA, type Materiales } from './paleta';

/**
 * El paisaje de La Mancha a los lados del camino, todo en silueta:
 *  - montes al fondo, en dos capas (la niebla aclara la de atras: profundidad
 *    por capas). Siguen a la camara: estan tan lejos que no se acercan;
 *  - arboles sueltos, con INSTANCING (una sola llamada de dibujo para todos)
 *    y reciclados: el que queda atras vuelve a salir por delante.
 * Los molinos lejanos son de molino.ts y los recicla la escena.
 */

/** Para fundir geometrias hace falta que ninguna tenga indices (algunas ya vienen asi). */
const sinIndices = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);

/** Posicion de algo reciclado: a `s` metros de la salida, se repite cada `periodo` metros. */
export function zReciclada(s: number, dist: number, periodo: number, detras = 15): number {
  const rel = ((((s - dist + detras) % periodo) + periodo) % periodo) - detras;
  return -rel;
}

export type Montes = { grupo: THREE.Group; seguir(z: number): void };

export function crearMontes(mats: Materiales, azar: () => number, geos: THREE.BufferGeometry[]): Montes {
  const grupo = new THREE.Group();
  const capas = [
    { z: -250, alto: [18, 34], color: PALETA.siluetaClara, n: 9 },
    { z: -175, alto: [10, 22], color: PALETA.silueta, n: 11 },
  ];
  for (const capa of capas) {
    const partes: THREE.BufferGeometry[] = [];
    for (let k = 0; k < capa.n; k++) {
      const alto = capa.alto[0]! + azar() * (capa.alto[1]! - capa.alto[0]!);
      const g = new THREE.ConeGeometry(alto * (1.6 + azar()), alto, 5, 1);
      g.translate(0, alto / 2 - 1, 0);
      // Repartidos a lo ancho, dejando libre el centro (ahi va el sol).
      const lado = k % 2 === 0 ? -1 : 1;
      g.translate(lado * (35 + azar() * 170), 0, capa.z + (azar() - 0.5) * 30);
      partes.push(sinIndices(g));
    }
    const fundida = mergeGeometries(partes, false)!;
    geos.push(fundida);
    grupo.add(new THREE.Mesh(fundida, mats.mate(capa.color)));
  }
  return {
    grupo,
    seguir(z) {
      grupo.position.z = z;
    },
  };
}

export type Arboles = { malla: THREE.InstancedMesh; colocar(dist: number, ocultar?: (s: number) => boolean): void };

const PERIODO_ARBOLES = 320;

export function crearArboles(mats: Materiales, azar: () => number, geos: THREE.BufferGeometry[], n = 36): Arboles {
  const tronco = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5);
  tronco.translate(0, 1.1, 0);
  const copa = new THREE.IcosahedronGeometry(1.6, 0);
  copa.scale(1, 0.85, 1);
  copa.translate(0, 3.3, 0);
  const g = mergeGeometries([sinIndices(tronco), sinIndices(copa)], false)!;
  geos.push(g);
  const malla = new THREE.InstancedMesh(g, mats.mate(PALETA.silueta), n);
  malla.frustumCulled = false;

  // Donde esta cada uno (fijo): a que metros, a que lado y a que distancia del camino.
  const sitios = Array.from({ length: n }, (_, k) => ({
    s: (k / n) * PERIODO_ARBOLES + azar() * 6,
    x: (k % 2 === 0 ? -1 : 1) * (8 + azar() * 40),
    escala: 0.7 + azar() * 0.9,
    giro: azar() * Math.PI,
  }));
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const esc = new THREE.Vector3();
  const eje = new THREE.Vector3(0, 1, 0);

  return {
    malla,
    colocar(dist, ocultar) {
      sitios.forEach((a, k) => {
        const z = zReciclada(a.s, dist, PERIODO_ARBOLES);
        pos.set(a.x, 0, z);
        rot.setFromAxisAngle(eje, a.giro);
        // Donde no toca (dentro de Alcala), el arbol se encoge hasta desaparecer.
        esc.setScalar(ocultar?.(dist - z) ? 0 : a.escala);
        malla.setMatrixAt(k, m.compose(pos, rot, esc));
      });
      malla.instanceMatrix.needsUpdate = true;
    },
  };
}

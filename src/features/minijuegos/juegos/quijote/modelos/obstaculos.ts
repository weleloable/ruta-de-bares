import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { TipoObstaculo } from '../modelo';

/**
 * Las formas de los obstaculos, cada una FUNDIDA en una sola geometria (una
 * llamada de dibujo por obstaculo). Ocupan lo mismo que su caja de choque en
 * OBSTACULOS (modelo.ts): lo que se ve es lo que choca. Origen: el suelo, en
 * el centro del carril. Se pueden cambiar por GLTF uno a uno.
 */

function caja(x: number, y: number, z: number, px: number, py: number, pz: number) {
  const g = new THREE.BoxGeometry(x, y, z);
  g.translate(px, py, pz);
  return g;
}

function fundir(partes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Todas con los mismos atributos (sin indices mezclados) para poder fundirlas.
  const limpias = partes.map((g) => (g.index ? g.toNonIndexed() : g));
  const g = mergeGeometries(limpias, false)!;
  partes.forEach((p) => p.dispose());
  limpias.forEach((p) => p.dispose());
  return g;
}

/** Valla baja de madera (se salta): dos postes y dos travesanos, hasta 0,9 m. */
function valla() {
  return fundir([
    caja(0.14, 0.9, 0.14, -0.95, 0.45, 0),
    caja(0.14, 0.9, 0.14, 0.95, 0.45, 0),
    caja(2.0, 0.12, 0.08, 0, 0.42, 0),
    caja(2.0, 0.12, 0.08, 0, 0.8, 0),
  ]);
}

/** Cartel de posada colgado de un arco (hay que agacharse): de 1,25 m hacia arriba. */
function cartel() {
  return fundir([
    caja(0.14, 2.4, 0.14, -1.1, 1.2, 0),
    caja(0.14, 2.4, 0.14, 1.1, 1.2, 0),
    caja(2.36, 0.16, 0.16, 0, 2.32, 0),
    caja(1.8, 0.75, 0.08, 0, 1.68, 0),
  ]);
}

/** Carreta cargada de paja (tapa el carril): caja, ruedas y un monton encima, hasta 2,8 m. */
function carreta() {
  const rueda = (x: number, z: number) => {
    const g = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 10);
    g.rotateZ(Math.PI / 2);
    g.translate(x, 0.55, z);
    return g;
  };
  const paja = new THREE.DodecahedronGeometry(1.15, 0);
  paja.scale(0.85, 0.75, 1.3);
  paja.translate(0, 2.0, 0);
  return fundir([
    caja(1.9, 0.75, 3.0, 0, 1.05, 0),
    rueda(-1.0, -0.8),
    rueda(1.0, -0.8),
    rueda(-1.0, 0.9),
    rueda(1.0, 0.9),
    caja(0.12, 0.12, 1.6, 0, 0.75, -2.2),
    paja,
  ]);
}

export function geometriasObstaculos(): Record<TipoObstaculo, THREE.BufferGeometry> {
  return { bajo: valla(), alto: cartel(), bloque: carreta() };
}

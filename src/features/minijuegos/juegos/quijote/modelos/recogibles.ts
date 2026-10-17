import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { xDeCarril, type Recogible } from '../modelo';
import { PALETA, texturaHalo, type Materiales } from './paleta';

/**
 * Lo que se recoge, lo unico con color: jarras doradas, el yelmo de Mambrino
 * (una bacia de barbero, plateada) y el queso manchego. Brillan por si solos
 * (sin luz ni niebla) y llevan un halo detras, que hace de "bloom" sin pintar
 * la escena dos veces. Las jarras, que son muchas, van con INSTANCING: una
 * llamada de dibujo para todas, y otra para sus halos.
 */

const MAX_JARRAS = 80;
const PLATA = 0xe6ecf2;
const QUESO = 0xffd54a;

export type Recogibles = {
  grupo: THREE.Group;
  colocar(lista: readonly Recogible[], dist: number, t: number): void;
  /** Sin brillos: sin halos (lo que hace de "bloom"). */
  brillos(si: boolean): void;
};

/** Para fundir geometrias hace falta que ninguna tenga indices (algunas ya vienen asi). */
const sinIndices = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);

export function crearRecogibles(mats: Materiales, geos: THREE.BufferGeometry[]): Recogibles & { liberar(): void } {
  const grupo = new THREE.Group();

  // La jarra: vaso, espuma y asa, fundidos. Algo mas grande que la de verdad: se ve desde lejos.
  const vaso = new THREE.CylinderGeometry(0.3, 0.26, 0.62, 10);
  const espuma = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10);
  espuma.translate(0, 0.36, 0);
  const asa = new THREE.TorusGeometry(0.17, 0.05, 5, 10, Math.PI);
  asa.rotateZ(-Math.PI / 2);
  asa.translate(0.32, 0, 0);
  const geoJarra = mergeGeometries([sinIndices(vaso), sinIndices(espuma), sinIndices(asa)], false)!;
  const geoHalo = new THREE.PlaneGeometry(1, 1);
  geos.push(geoJarra, geoHalo);

  const jarras = new THREE.InstancedMesh(geoJarra, mats.brillo(PALETA.oro), MAX_JARRAS);
  jarras.frustumCulled = false;
  const texOro = texturaHalo('#ffb52e');
  // Halos con mezcla normal y algo transparentes: de dia, sumar luz los deja en una mancha blanca.
  const matHaloOro = new THREE.MeshBasicMaterial({ map: texOro, transparent: true, opacity: 0.65, depthWrite: false, fog: false });
  const halos = new THREE.InstancedMesh(geoHalo, matHaloOro, MAX_JARRAS);
  halos.frustumCulled = false;
  grupo.add(halos, jarras);

  // El yelmo (bacia) y el queso: pocos a la vez, mallas sueltas.
  const geoBacia = new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4);
  geoBacia.rotateX(Math.PI);
  const geoQueso = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 12, 1, false, 0, Math.PI * 1.6);
  geos.push(geoBacia, geoQueso);
  const texPlata = texturaHalo('#e6ecf2');
  const texQueso = texturaHalo('#ffd54a');
  const matHaloPlata = new THREE.SpriteMaterial({ map: texPlata, depthWrite: false, fog: false, transparent: true, opacity: 0.6 });
  const matHaloQueso = new THREE.SpriteMaterial({ map: texQueso, depthWrite: false, fog: false, transparent: true, opacity: 0.65 });
  const especiales = (geo: THREE.BufferGeometry, color: number, halo: THREE.SpriteMaterial) =>
    Array.from({ length: 3 }, () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo, mats.brillo(color)));
      const s = new THREE.Sprite(halo);
      s.scale.set(2.0, 2.0, 1);
      g.add(s);
      g.visible = false;
      grupo.add(g);
      return g;
    });
  const yelmos = especiales(geoBacia, PLATA, matHaloPlata);
  const quesos = especiales(geoQueso, QUESO, matHaloQueso);

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const esc = new THREE.Vector3(1, 1, 1);
  const escHalo = new THREE.Vector3();
  const eje = new THREE.Vector3(0, 1, 0);
  const quieto = new THREE.Quaternion();

  return {
    grupo,
    colocar(lista, dist, t) {
      let n = 0;
      let ny = 0;
      let nq = 0;
      for (const r of lista) {
        if (r.cogidoEn !== undefined) continue;
        const z = -(r.s - dist);
        if (z > 6) continue;
        const x = xDeCarril(r.carril);
        // Flotan un poco y giran: asi se ven vivas.
        const y = r.altura + Math.sin(t * 3 + r.id) * 0.08;
        if (r.tipo === 'jarra' && n < MAX_JARRAS) {
          pos.set(x, y, z);
          rot.setFromAxisAngle(eje, t * 2.5 + r.id);
          jarras.setMatrixAt(n, m.compose(pos, rot, esc));
          escHalo.set(1.6, 1.6, 1);
          pos.z -= 0.4;
          halos.setMatrixAt(n, m.compose(pos, quieto, escHalo));
          n++;
        } else if (r.tipo !== 'jarra') {
          const g = r.tipo === 'yelmo' ? yelmos[ny++] : quesos[nq++];
          if (!g) continue;
          g.visible = true;
          g.position.set(x, y + 0.2, z);
          g.children[0]!.rotation.y = t * 2;
        }
      }
      jarras.count = n;
      halos.count = n;
      jarras.instanceMatrix.needsUpdate = true;
      halos.instanceMatrix.needsUpdate = true;
      for (let k = ny; k < yelmos.length; k++) yelmos[k]!.visible = false;
      for (let k = nq; k < quesos.length; k++) quesos[k]!.visible = false;
    },
    brillos(si) {
      halos.visible = si;
      for (const g of [...yelmos, ...quesos]) g.children[1]!.visible = si;
    },
    liberar() {
      [texOro, texPlata, texQueso].forEach((tx) => tx.dispose());
      [matHaloOro, matHaloPlata, matHaloQueso].forEach((mt) => mt.dispose());
    },
  };
}

import * as THREE from 'three';

import { PALETA, ponerContorno, type Materiales } from './paleta';

/**
 * Un molino manchego en low-poly: torre encalada algo conica, caperuza oscura
 * de cono y cuatro aspas de madera con sus velas, que giran. Con contorno.
 * Mira hacia +z (hacia el jugador), con las aspas delante. El origen es el pie
 * de la torre. Se puede cambiar por un GLTF: lo demas usa `grupo`, `aspas` y
 * `girar`.
 *
 * Los del paisaje son los de siempre (eje a 7 m); los que barren el camino
 * tienen el eje y las aspas que dice MOLINO (modelo.ts), porque eso es lo que
 * choca.
 */
export type Molino = {
  grupo: THREE.Group;
  aspas: THREE.Group;
  /** Donde va el eje de las aspas (para devolverlas a su sitio tras un derribo). */
  ejeY: number;
  aspasZ: number;
  girar(dt: number): void;
};

/** Geometrias compartidas por todos los molinos de esas medidas (se crean una vez). */
export function geometriasMolino(eje = 7, radio = 5.4) {
  const altoTorre = eje - 0.5;
  const torre = new THREE.CylinderGeometry(1.5, 2.1, altoTorre, 8);
  torre.translate(0, altoTorre / 2, 0);
  const tejado = new THREE.ConeGeometry(1.9, 2.0, 8);
  tejado.translate(0, altoTorre + 1.0, 0);
  const ejeGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6);
  ejeGeo.rotateX(Math.PI / 2);
  // Un aspa, apuntando hacia arriba: el palo y su rejilla (mas ancha hacia la punta).
  const palo = new THREE.BoxGeometry(0.22, radio, 0.12);
  palo.translate(0, radio / 2, 0);
  const vela = new THREE.BoxGeometry(radio * 0.21, radio * 0.68, 0.06);
  vela.translate(radio * 0.12, radio * 0.62, 0);
  return { eje, torre, tejado, ejeGeo, palo, vela, todas: [torre, tejado, ejeGeo, palo, vela] };
}

export function crearMolino(mats: Materiales, g: ReturnType<typeof geometriasMolino>, velocidadGiro = 1.2): Molino {
  const cal = mats.toon(PALETA.cal);
  const caperuza = mats.toon(0x3c4a5c);
  const madera = mats.toon(PALETA.madera);
  const vela = mats.toon(0xf2e8d2);
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(g.torre, cal), new THREE.Mesh(g.tejado, caperuza));

  const aspas = new THREE.Group();
  const aspasZ = 2.0;
  aspas.position.set(0, g.eje, aspasZ);
  aspas.add(new THREE.Mesh(g.ejeGeo, madera));
  for (let k = 0; k < 4; k++) {
    const aspa = new THREE.Group();
    aspa.add(new THREE.Mesh(g.palo, madera), new THREE.Mesh(g.vela, vela));
    aspa.rotation.z = (k * Math.PI) / 2;
    aspas.add(aspa);
  }
  grupo.add(aspas);
  ponerContorno(grupo, mats, 0.08);

  return {
    grupo,
    aspas,
    ejeY: g.eje,
    aspasZ,
    girar(dt) {
      aspas.rotation.z -= velocidadGiro * dt;
    },
  };
}

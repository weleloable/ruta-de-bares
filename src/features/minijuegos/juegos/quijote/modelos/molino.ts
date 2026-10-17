import * as THREE from 'three';

import { PALETA, type Materiales } from './paleta';

/**
 * Un molino manchego en low-poly: torre blanca (aqui, silueta) algo conica,
 * tejado de cono y cuatro aspas que giran. Mira hacia +z (hacia el jugador),
 * con las aspas delante. El origen es el pie de la torre. `escala` 1 es un
 * molino de unos 9 m. Se puede cambiar por un GLTF: lo demas usa `grupo`,
 * `aspas` y `girar`.
 */
export type Molino = {
  grupo: THREE.Group;
  aspas: THREE.Group;
  girar(dt: number): void;
};

/** Geometrias compartidas por todos los molinos (se crean una vez). */
export function geometriasMolino() {
  const torre = new THREE.CylinderGeometry(1.6, 2.2, 6.5, 8);
  torre.translate(0, 3.25, 0);
  const tejado = new THREE.ConeGeometry(2.0, 2.0, 8);
  tejado.translate(0, 7.5, 0);
  const eje = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6);
  eje.rotateX(Math.PI / 2);
  // Un aspa: el palo y su rejilla (una caja fina mas ancha hacia la punta).
  const palo = new THREE.BoxGeometry(0.22, 5.2, 0.12);
  palo.translate(0, 2.6, 0);
  const vela = new THREE.BoxGeometry(1.1, 3.8, 0.06);
  vela.translate(0.62, 3.2, 0);
  return { torre, tejado, eje, palo, vela, todas: [torre, tejado, eje, palo, vela] };
}

export function crearMolino(mats: Materiales, g: ReturnType<typeof geometriasMolino>, velocidadGiro = 1.2): Molino {
  const negro = mats.mate(PALETA.silueta);
  const claro = mats.mate(PALETA.siluetaClara);
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(g.torre, claro), new THREE.Mesh(g.tejado, negro));

  const aspas = new THREE.Group();
  aspas.position.set(0, 7.0, 2.1);
  const eje = new THREE.Mesh(g.eje, negro);
  aspas.add(eje);
  for (let k = 0; k < 4; k++) {
    const aspa = new THREE.Group();
    aspa.add(new THREE.Mesh(g.palo, negro), new THREE.Mesh(g.vela, negro));
    aspa.rotation.z = (k * Math.PI) / 2;
    aspas.add(aspa);
  }
  grupo.add(aspas);

  return {
    grupo,
    aspas,
    girar(dt) {
      aspas.rotation.z -= velocidadGiro * dt;
    },
  };
}

import * as THREE from 'three';

import { PALETA, ponerContorno, type Materiales } from './paleta';

/**
 * Don Quijote a lomos de Rocinante, en low-poly y en colores de dibujos: un
 * caballo castaño y flaco con su silla roja, un jinete larguirucho con
 * armadura, la lanza hacia delante y la jarra dorada en alto. Con contorno. Mira hacia -z (hacia el sol). El origen es el suelo, en el
 * centro de su caja de choque. Se puede cambiar por un GLTF: lo demas solo usa
 * `grupo` y `animar`.
 */
export type Jinete = {
  grupo: THREE.Group;
  animar(dt: number, s: { velocidad: number; enAire: boolean; agachado: boolean; embistiendo: boolean; escudo: boolean }): void;
};

/** Una caja con el pivote arriba (para patas y brazos que giran desde la cadera o el hombro). */
function colgante(ancho: number, largo: number, mat: THREE.Material, geos: THREE.BufferGeometry[]) {
  const g = new THREE.BoxGeometry(ancho, largo, ancho);
  g.translate(0, -largo / 2, 0);
  geos.push(g);
  return new THREE.Mesh(g, mat);
}

export function crearQuijote(mats: Materiales): Jinete & { geometrias: THREE.BufferGeometry[] } {
  const geos: THREE.BufferGeometry[] = [];
  const caja = (x: number, y: number, z: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(x, y, z);
    geos.push(g);
    return new THREE.Mesh(g, m);
  };
  const pelo = mats.toon(0x9a6436);
  const patasColor = mats.toon(0x7c4e2a);
  const crin = mats.toon(0x3b2416);
  const silla = mats.toon(0xb3362b);
  const armadura = mats.toon(0xa9b2bd);
  const metal = mats.toon(0xc7cdd4);
  const calzas = mats.toon(0x5d4a2e);
  const piel = mats.toon(0xeab48a);
  const madera = mats.toon(PALETA.maderaClara);
  const oro = mats.brillo(PALETA.oro);

  const grupo = new THREE.Group();
  // Todo lo que se agacha y bota va en `cuerpo` (las patas tambien, para que el salto las lleve).
  const cuerpo = new THREE.Group();
  grupo.add(cuerpo);

  // --- Rocinante: flaco, de cuello largo ---
  const caballo = new THREE.Group();
  cuerpo.add(caballo);
  // Mas largo que su caja de choque: desde atras, si no, el jinete tapa cuello y cabeza.
  const tronco = caja(0.62, 0.6, 1.9, pelo);
  tronco.position.set(0, 1.25, -0.15);
  // La grupa, algo mas ancha y redonda: es lo que mas se ve desde atras.
  const grupa = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), pelo);
  geos.push(grupa.geometry);
  grupa.scale.set(0.95, 0.85, 0.9);
  grupa.position.set(0, 1.3, 0.52);
  const cuello = caja(0.28, 1.05, 0.34, pelo);
  cuello.position.set(0, 1.8, -1.2);
  cuello.rotation.x = -0.5;
  const cabezaCaballo = caja(0.26, 0.28, 0.66, pelo);
  cabezaCaballo.position.set(0, 2.3, -1.62);
  cabezaCaballo.rotation.x = 0.4;
  // Dos orejas de punta, bien separadas: desde atras es lo que dice "caballo".
  const geoOreja = new THREE.ConeGeometry(0.07, 0.3, 4);
  geos.push(geoOreja);
  const orejas = new THREE.Group();
  for (const x of [-0.12, 0.12]) {
    const oreja = new THREE.Mesh(geoOreja, pelo);
    oreja.position.set(x, 0, 0);
    oreja.rotation.z = -x * 2.2;
    orejas.add(oreja);
  }
  orejas.position.set(0, 2.55, -1.36);
  const cola = colgante(0.09, 0.7, crin, geos);
  cola.position.set(0, 1.42, 0.85);
  cola.rotation.x = 0.55;
  // La crin por el cuello y la silla de montar (roja: se ve desde atras).
  const melena = caja(0.1, 0.95, 0.14, crin);
  melena.position.set(0, 1.92, -1.06);
  melena.rotation.x = -0.5;
  const montura = caja(0.72, 0.14, 0.62, silla);
  montura.position.set(0, 1.6, 0.25);
  caballo.add(tronco, grupa, cuello, cabezaCaballo, orejas, cola, melena, montura);

  // Las cuatro patas, colgando desde la cadera. Desfase de galope: las dos de delante
  // casi juntas, y las de atras a media vuelta.
  const patas: { malla: THREE.Mesh; desfase: number; delante: boolean }[] = [];
  for (const [x, z, desfase] of [
    [-0.22, -0.6, 0],
    [0.22, -0.6, 0.45],
    [-0.22, 0.6, Math.PI],
    [0.22, 0.6, Math.PI + 0.45],
  ] as const) {
    const pata = colgante(0.11, 1.0, patasColor, geos);
    pata.position.set(x, 1.05, z);
    caballo.add(pata);
    patas.push({ malla: pata, desfase, delante: z < 0 });
  }

  // --- Don Quijote: largo y seco, con su lanza y su jarra ---
  const jinete = new THREE.Group();
  jinete.position.set(0, 1.5, 0.3);
  cuerpo.add(jinete);
  const torso = caja(0.4, 0.78, 0.26, armadura);
  torso.position.set(0, 0.42, 0);
  const cabeza = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), piel);
  geos.push(cabeza.geometry);
  cabeza.position.set(0, 0.98, -0.02);
  const yelmo = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.16, 7), metal);
  geos.push(yelmo.geometry);
  yelmo.position.set(0, 1.12, -0.02);
  // Las piernas, a los lados del caballo.
  const piernaI = colgante(0.12, 0.7, calzas, geos);
  piernaI.position.set(-0.36, 0.1, 0);
  piernaI.rotation.z = 0.12;
  const piernaD = colgante(0.12, 0.7, calzas, geos);
  piernaD.position.set(0.36, 0.1, 0);
  piernaD.rotation.z = -0.12;
  // El yelmo de Mambrino (una bacia de barbero, plateada) cuando lo lleva: para un golpe.
  const bacia = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.4), mats.brillo(0xe6ecf2));
  geos.push(bacia.geometry);
  bacia.position.set(0, 1.06, -0.02);
  bacia.visible = false;
  jinete.add(torso, cabeza, yelmo, bacia, piernaI, piernaD);

  // Brazo izquierdo en alto con la jarra (dorada: se ve desde lejos).
  const brazoI = colgante(0.1, 0.62, armadura, geos);
  brazoI.position.set(-0.24, 0.78, 0);
  // Girado casi media vuelta: apunta arriba y un poco hacia fuera (a la izquierda).
  brazoI.rotation.z = -(Math.PI - 0.35);
  const jarra = new THREE.Group();
  const vaso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.24, 8), oro);
  const asa = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 4, 8, Math.PI), oro);
  geos.push(vaso.geometry, asa.geometry);
  asa.position.set(-0.12, 0, 0);
  asa.rotation.z = Math.PI / 2;
  jarra.add(vaso, asa);
  jarra.position.set(0, -0.72, 0);
  // La jarra, derecha aunque el brazo este girado.
  jarra.rotation.z = Math.PI - 0.35;
  brazoI.add(jarra);
  jinete.add(brazoI);

  // Brazo derecho con la lanza, apuntando al frente y un poco arriba.
  const brazoD = colgante(0.1, 0.55, armadura, geos);
  brazoD.position.set(0.24, 0.75, 0);
  brazoD.rotation.x = 0.9;
  const lanza = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 3.4, 5), madera);
  geos.push(lanza.geometry);
  lanza.position.set(0.32, 0.35, -0.9);
  lanza.rotation.x = -Math.PI / 2 + 0.3;
  jinete.add(brazoD, lanza);

  // El contorno negro de dibujos (no a la jarra ni a la bacia, que brillan).
  ponerContorno(grupo, mats);

  let fase = 0;
  let embiste = 0;
  let aplastado = 1;

  return {
    grupo,
    geometrias: geos,
    animar(dt, { velocidad, enAire, agachado, embistiendo, escudo }) {
      yelmo.visible = !escudo;
      bacia.visible = escudo;
      // Embistiendo: lanza en ristre (horizontal y al frente) y el jinete echado hacia delante.
      embiste += ((embistiendo ? 1 : 0) - embiste) * (1 - Math.exp(-12 * dt));
      lanza.rotation.x = -Math.PI / 2 + 0.3 - embiste * 0.32;
      lanza.position.set(0.32, 0.35 - embiste * 0.2, -0.9 - embiste * 0.5);
      brazoD.rotation.x = 0.9 + embiste * 0.6;
      // Unas 0.55 zancadas por metro: a mas velocidad, galope mas rapido.
      fase += velocidad * dt * 0.55;
      for (const p of patas) {
        p.malla.rotation.x = enAire ? (p.delante ? -0.9 : 0.8) : Math.sin(fase + p.desfase) * 0.75;
      }
      cola.rotation.x = 0.55 + Math.sin(fase * 2) * 0.15;
      const bote = enAire ? 0 : Math.abs(Math.sin(fase)) * 0.09;
      caballo.position.y = bote;
      // El jinete bota a destiempo y se balancea un poco.
      jinete.position.y = 1.5 + bote * 0.6 + Math.sin(fase * 2 + 0.6) * 0.03;
      jinete.rotation.z = Math.sin(fase) * 0.04;
      // Agachado: se tumba sobre el cuello y el caballo baja la cabeza.
      aplastado += ((agachado ? 0.6 : 1) - aplastado) * (1 - Math.exp(-18 * dt));
      cuerpo.scale.y = aplastado;
      jinete.rotation.x = (1 - aplastado) * -2 - embiste * 0.35;
      brazoI.rotation.z = -(Math.PI - 0.35) + Math.sin(fase * 2) * 0.05;
    },
  };
}

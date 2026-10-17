import * as THREE from 'three';

import { anguloAspas, medidasMolino, type Obstaculo, type TipoObstaculo } from '../modelo';
import { crearMolino, geometriasMolino, type Molino } from './molino';
import { caja, fundirPintadas, PALETA, pintar, ponerContorno, type Materiales } from './paleta';

/**
 * Los obstaculos del camino, en colores vivos y con contorno. Cada uno es un
 * Object3D que la escena saca de un pool y coloca; si se mueve (ovejas que
 * cruzan, odres que se balancean, aspas que giran) lo hace en `animar`.
 * Ocupan lo mismo que su caja de choque en OBSTACULOS (modelo.ts): lo que se
 * ve es lo que choca. Origen: el suelo, en el centro del carril (los molinos,
 * al borde del camino). Las piezas que no se mueven van FUNDIDAS en una sola
 * geometria con el color en cada vertice: una llamada de dibujo (y otra para
 * su contorno).
 */

export type PiezaObstaculo = {
  objeto: THREE.Object3D;
  /** Cada fotograma: `t` es el tiempo de la partida. */
  animar(o: Obstaculo, t: number): void;
  /** Al sacarlo del pool para otro obstaculo: vuelve a su postura. */
  reiniciar(o: Obstaculo): void;
};

const C = {
  poste: PALETA.madera,
  tabla: PALETA.maderaClara,
  cartel: 0xf2c14e,
  rojo: 0xc93a2c,
  rueda: 0x5a3a1c,
  paja: 0xf0c64a,
  lana: 0xf7f3ea,
  hocico: 0x3a2e2a,
  odre: 0x8a2f4f,
  cuerda: 0xcaa27a,
};

/** Una oveja de lado (cruzando el camino): lana blanca, cara y patas oscuras. */
function geoOveja() {
  const cuerpo = new THREE.DodecahedronGeometry(0.42, 0);
  cuerpo.scale(1.35, 0.95, 1);
  cuerpo.translate(0, 0.62, 0);
  const cabeza = caja(0.24, 0.26, 0.24, 0.6, 0.72, 0);
  const patas = [-0.3, 0.3].flatMap((x) => [-0.18, 0.18].map((z) => pintar(caja(0.08, 0.36, 0.08, x, 0.18, z), C.hocico)));
  return fundirPintadas([pintar(cuerpo, C.lana), pintar(cabeza, C.hocico), ...patas]);
}

/** Un odre: el pellejo de vino colgando de su cuerda, con el pivote (y = 0) arriba. */
function geoOdre() {
  const pellejo = new THREE.DodecahedronGeometry(0.42, 0);
  pellejo.scale(0.9, 1.25, 0.8);
  pellejo.translate(0, -1.6, 0);
  const cuello = new THREE.CylinderGeometry(0.06, 0.12, 0.3, 5);
  cuello.translate(0, -0.95, 0);
  return fundirPintadas([pintar(pellejo, C.odre), pintar(cuello, C.odre), pintar(caja(0.04, 0.85, 0.04, 0, -0.42, 0), C.cuerda)]);
}

export class FabricaObstaculos {
  private readonly g: Record<string, THREE.BufferGeometry>;
  private readonly molinos: Record<1 | 2, ReturnType<typeof geometriasMolino>>;
  private readonly pintado: THREE.Material;

  constructor(
    private readonly mats: Materiales,
    geos: THREE.BufferGeometry[],
  ) {
    this.pintado = mats.pintado();
    const rueda = (x: number, z: number) => {
      const r = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 10);
      r.rotateZ(Math.PI / 2);
      r.translate(x, 0.55, z);
      return pintar(r, C.rueda);
    };
    const paja = new THREE.DodecahedronGeometry(1.15, 0);
    paja.scale(0.85, 0.75, 1.3);
    paja.translate(0, 2.0, 0);
    const pajar = new THREE.SphereGeometry(1.0, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    pajar.scale(1.0, 2.8, 1.55);
    this.g = {
      // Valla baja de madera: dos postes y dos travesanos, hasta 0,9 m.
      valla: fundirPintadas([
        pintar(caja(0.16, 0.9, 0.16, -0.95, 0.45, 0), C.poste),
        pintar(caja(0.16, 0.9, 0.16, 0.95, 0.45, 0), C.poste),
        pintar(caja(2.0, 0.14, 0.1, 0, 0.42, 0), C.tabla),
        pintar(caja(2.0, 0.14, 0.1, 0, 0.8, 0), C.tabla),
      ]),
      // Cartel de posada colgado de un arco: de 1,25 m hacia arriba.
      cartel: fundirPintadas([
        pintar(caja(0.16, 2.4, 0.16, -1.1, 1.2, 0), C.poste),
        pintar(caja(0.16, 2.4, 0.16, 1.1, 1.2, 0), C.poste),
        pintar(caja(2.36, 0.18, 0.18, 0, 2.32, 0), C.poste),
        pintar(caja(1.8, 0.75, 0.1, 0, 1.68, 0), C.cartel),
      ]),
      // Carreta roja cargada de paja, o un pajar: tapan el carril.
      carreta: fundirPintadas([
        pintar(caja(1.9, 0.75, 3.0, 0, 1.05, 0), C.rojo),
        rueda(-1.0, -0.8),
        rueda(1.0, -0.8),
        rueda(-1.0, 0.9),
        rueda(1.0, 0.9),
        pintar(caja(0.12, 0.12, 1.6, 0, 0.75, -2.2), C.poste),
        pintar(paja, C.paja),
      ]),
      pajar: fundirPintadas([pintar(pajar, C.paja)]),
      oveja: geoOveja(),
      // El palo del que cuelgan los odres, por encima de todo (no se choca con el).
      horca: fundirPintadas([
        pintar(caja(0.14, 3.6, 0.14, -1.15, 1.8, 0), C.poste),
        pintar(caja(0.14, 3.6, 0.14, 1.15, 1.8, 0), C.poste),
        pintar(caja(2.42, 0.16, 0.16, 0, 3.55, 0), C.poste),
      ]),
      odre: geoOdre(),
    };
    geos.push(...Object.values(this.g));
    this.molinos = {
      1: geometriasMolino(medidasMolino(1).eje, medidasMolino(1).radio),
      2: geometriasMolino(medidasMolino(2).eje, medidasMolino(2).radio),
    };
    geos.push(...this.molinos[1].todas, ...this.molinos[2].todas);
  }

  crear(tipo: TipoObstaculo): PiezaObstaculo {
    const pieza = this.crearSin(tipo);
    // Los molinos traen el suyo (mas grueso, que son enormes).
    if (tipo !== 'molino') ponerContorno(pieza.objeto, this.mats);
    return pieza;
  }

  private crearSin(tipo: TipoObstaculo): PiezaObstaculo {
    switch (tipo) {
      case 'bajo':
        return this.fija(new THREE.Mesh(this.g.valla, this.pintado));
      case 'alto':
        return this.fija(new THREE.Mesh(this.g.cartel, this.pintado));
      case 'bloque':
        return this.bloque();
      case 'ovejas':
        return this.rebano();
      case 'odre':
        return this.odre();
      case 'molino':
        return this.molino();
    }
  }

  /** Lo que no se mueve: solo cae si lo derriba la Embestida. */
  private fija(objeto: THREE.Object3D): PiezaObstaculo {
    return {
      objeto,
      animar: (o, t) => derribo(objeto, o, t),
      reiniciar: () => levantar(objeto),
    };
  }

  private bloque(): PiezaObstaculo {
    const grupo = new THREE.Group();
    const carreta = new THREE.Mesh(this.g.carreta, this.pintado);
    const pajar = new THREE.Mesh(this.g.pajar, this.pintado);
    grupo.add(carreta, pajar);
    return {
      objeto: grupo,
      animar: (o, t) => derribo(grupo, o, t),
      reiniciar: (o) => {
        levantar(grupo);
        carreta.visible = o.variante === 0;
        pajar.visible = o.variante !== 0;
      },
    };
  }

  /** Tres ovejas cruzando el carril de lado a lado, cada una a su paso. */
  private rebano(): PiezaObstaculo {
    const grupo = new THREE.Group();
    const ovejas = [-0.75, 0, 0.75].map((x, k) => {
      const m = new THREE.Mesh(this.g.oveja, this.pintado);
      m.position.set(x, 0, (k - 1) * 0.45);
      grupo.add(m);
      return m;
    });
    return {
      objeto: grupo,
      animar: (o, t) => {
        ovejas.forEach((m, k) => {
          const paso = t * 2.2 + k * 1.7 + o.id;
          m.position.x = (k - 1) * 0.75 + Math.sin(paso * 0.5) * 0.18;
          m.position.y = Math.abs(Math.sin(paso * 3)) * 0.06;
        });
        derribo(grupo, o, t);
      },
      reiniciar: () => levantar(grupo),
    };
  }

  /** Dos odres colgando de una horca sobre el carril, balanceandose. */
  private odre(): PiezaObstaculo {
    const grupo = new THREE.Group();
    grupo.add(new THREE.Mesh(this.g.horca, this.pintado));
    const odres = [-0.35, 0.35].map((x) => {
      const m = new THREE.Mesh(this.g.odre, this.pintado);
      m.position.set(x, 3.5, 0);
      grupo.add(m);
      return m;
    });
    return {
      objeto: grupo,
      animar: (o, t) => {
        odres.forEach((m, k) => {
          m.rotation.z = Math.sin(t * 2.4 + k * 0.9 + o.id) * 0.3;
        });
        derribo(grupo, o, t);
      },
      reiniciar: () => levantar(grupo),
    };
  }

  /** Un molino al borde del camino, con las aspas girando al ritmo que dice el modelo (es lo que choca). */
  private molino(): PiezaObstaculo {
    const grupo = new THREE.Group();
    const piezas: Record<1 | 2, Molino> = {
      1: crearMolino(this.mats, this.molinos[1]),
      2: crearMolino(this.mats, this.molinos[2]),
    };
    grupo.add(piezas[1].grupo, piezas[2].grupo);
    return {
      objeto: grupo,
      animar: (o, t) => {
        const m = o.molino!;
        const pieza = piezas[m.alcance];
        // Las aspas estan hechas apuntando hacia arriba (+y): el angulo del modelo cuenta desde +x.
        pieza.aspas.rotation.z = anguloAspas(o, t) - Math.PI / 2;
        if (o.derribadoEn !== undefined) {
          // ¡Gigante derribado! La torre cae hacia fuera del camino y las aspas salen volando.
          const d = Math.min(1, (t - o.derribadoEn) / 0.9);
          pieza.grupo.rotation.z = m.lado * d * 1.4;
          pieza.aspas.position.y = pieza.ejeY + d * 6;
          pieza.aspas.position.x = m.lado * d * 5;
          pieza.aspas.rotation.z += d * 8;
        }
      },
      reiniciar: (o) => {
        const m = o.molino!;
        for (const k of [1, 2] as const) {
          piezas[k].grupo.visible = k === m.alcance;
          piezas[k].grupo.rotation.z = 0;
          piezas[k].aspas.position.set(0, piezas[k].ejeY, piezas[k].aspasZ);
        }
      },
    };
  }
}

/** Lo que derriba la Embestida sale despedido hacia arriba y hacia un lado, dando vueltas. */
function derribo(objeto: THREE.Object3D, o: Obstaculo, t: number) {
  if (o.derribadoEn === undefined) return;
  const d = t - o.derribadoEn;
  const lado = o.id % 2 === 0 ? 1 : -1;
  objeto.position.y = Math.max(0, 9 * d - 14 * d * d);
  // La escena acaba de ponerlo en su sitio: esto es lo que se aparta de el.
  objeto.position.x += lado * d * 3;
  objeto.rotation.z = lado * d * 6;
  objeto.rotation.x = -d * 4;
  objeto.visible = d < 1.2;
}

function levantar(objeto: THREE.Object3D) {
  objeto.position.y = 0;
  objeto.rotation.set(0, 0, 0);
  objeto.visible = true;
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { PALETA, texturaHalo } from './paleta';

/**
 * El cielo de La Mancha a pleno sol: una esfera grande pintada por dentro con
 * un degradado azul (claro abajo, intenso arriba), el sol alto con su halo y
 * nubes de algodon. Todo sigue a la camara: esta "en el infinito" y no se
 * acerca. Siempre es de dia.
 */
export type Cielo = {
  grupo: THREE.Group;
  /** Lo pone donde esta la camara. `t` mueve un poco las nubes. */
  seguir(camara: THREE.Vector3, t: number): void;
  /** Con los brillos apagados, el sol va sin halo. */
  brillos(si: boolean): void;
  liberar(): void;
};

const vertice = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmento = /* glsl */ `
  uniform vec3 arriba;
  uniform vec3 medio;
  uniform vec3 horizonte;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 c = mix(horizonte, medio, smoothstep(0.0, 0.18, h));
    c = mix(c, arriba, smoothstep(0.18, 0.7, h));
    gl_FragColor = vec4(c, 1.0);
    // Los colores llegan en lineal (como los de los materiales): a la salida, como el resto.
    #include <colorspace_fragment>
  }
`;

const RADIO = 360;
const SOL = { x: -110, altura: 150, distancia: 280, radio: 18, halo: 90 };

/** Una nube de algodon: unas cuantas bolas fundidas, mas ancha que alta y con la base plana. */
function geoNube(azar: () => number): THREE.BufferGeometry {
  const bolas: THREE.BufferGeometry[] = [];
  const n = 4 + Math.floor(azar() * 3);
  for (let k = 0; k < n; k++) {
    const r = 5 + azar() * 6;
    const b = new THREE.IcosahedronGeometry(r, 1);
    b.translate((k - n / 2) * 7 + azar() * 3, Math.max(0, r * 0.4 - 2) + azar() * 2, azar() * 4);
    bolas.push(b);
  }
  const g = mergeGeometries(bolas, false)!;
  g.scale(1, 0.62, 0.5);
  return g;
}

export function crearCielo(): Cielo {
  const grupo = new THREE.Group();
  const geo = new THREE.SphereGeometry(RADIO, 24, 16);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertice,
    fragmentShader: fragmento,
    uniforms: {
      arriba: { value: new THREE.Color(PALETA.cieloArriba) },
      medio: { value: new THREE.Color(PALETA.cieloMedio) },
      horizonte: { value: new THREE.Color(PALETA.horizonte) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const esfera = new THREE.Mesh(geo, mat);
  esfera.renderOrder = -3;
  grupo.add(esfera);

  // El sol, alto a la izquierda, y su halo.
  const geoSol = new THREE.CircleGeometry(SOL.radio, 32);
  const matSol = new THREE.MeshBasicMaterial({ color: PALETA.sol, fog: false, depthWrite: false });
  const sol = new THREE.Mesh(geoSol, matSol);
  sol.renderOrder = -2;
  const texHalo = texturaHalo('#fff2b0');
  const matHalo = new THREE.SpriteMaterial({ map: texHalo, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.5 });
  const halo = new THREE.Sprite(matHalo);
  halo.scale.set(SOL.halo * 2, SOL.halo * 2, 1);
  halo.renderOrder = -2;
  grupo.add(sol, halo);

  // Nubes: blancas, sin luz ni niebla, repartidas por el horizonte y algo mas arriba.
  let semilla = 21;
  const azar = () => (semilla = (semilla * 9301 + 49297) % 233280) / 233280;
  const geosNube = [geoNube(azar), geoNube(azar), geoNube(azar)];
  const matNube = new THREE.MeshBasicMaterial({ color: PALETA.nube, fog: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const nubes = Array.from({ length: 9 }, (_, k) => {
    const n = new THREE.Mesh(geosNube[k % geosNube.length], matNube);
    const ang = -Math.PI / 2 + (k / 8 - 0.5) * 2.6 + (azar() - 0.5) * 0.25;
    const d = 230 + azar() * 60;
    n.userData = { x: Math.cos(ang) * d, z: Math.sin(ang) * d, y: 30 + azar() * 70, deriva: 0.5 + azar() };
    n.lookAt(0, 0, 0);
    n.renderOrder = -1;
    grupo.add(n);
    return n;
  });

  return {
    grupo,
    seguir(camara, t) {
      esfera.position.copy(camara);
      sol.position.set(camara.x + SOL.x, SOL.altura, camara.z - SOL.distancia);
      sol.lookAt(camara);
      halo.position.copy(sol.position);
      for (const n of nubes) {
        const u = n.userData as { x: number; y: number; z: number; deriva: number };
        n.position.set(camara.x + u.x + Math.sin(t * 0.05 * u.deriva) * 8, u.y, camara.z + u.z);
      }
    },
    brillos(si) {
      halo.visible = si;
    },
    liberar() {
      [geo, geoSol, ...geosNube].forEach((g) => g.dispose());
      [mat, matSol, matHalo, matNube].forEach((m) => m.dispose());
      texHalo.dispose();
    },
  };
}

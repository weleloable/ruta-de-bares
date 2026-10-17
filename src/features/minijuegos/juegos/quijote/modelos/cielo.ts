import * as THREE from 'three';

import { PALETA, texturaHalo } from './paleta';

/**
 * El cielo del atardecer (una esfera grande pintada por dentro con un
 * degradado por altura) y el sol grande al fondo del camino, con su halo. Los
 * dos siguen a la camara: estan "en el infinito" y no se acercan nunca.
 */
export type Cielo = {
  grupo: THREE.Group;
  /** Lo pone donde esta la camara (y el sol al fondo del camino). */
  seguir(camara: THREE.Vector3): void;
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
  uniform vec3 bajo;
  uniform vec3 horizonte;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 c = horizonte;
    c = mix(c, bajo, smoothstep(0.0, 0.07, h));
    c = mix(c, medio, smoothstep(0.07, 0.26, h));
    c = mix(c, arriba, smoothstep(0.26, 0.65, h));
    gl_FragColor = vec4(c, 1.0);
    // Los colores llegan en lineal (como los de los materiales): a la salida, como el resto.
    #include <colorspace_fragment>
  }
`;

const RADIO = 360;
const SOL = { distancia: 330, altura: 16, radio: 34, halo: 150 };

export function crearCielo(): Cielo {
  const grupo = new THREE.Group();
  const color = (c: number) => new THREE.Color(c);
  const geo = new THREE.SphereGeometry(RADIO, 24, 16);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertice,
    fragmentShader: fragmento,
    uniforms: {
      arriba: { value: color(PALETA.cieloArriba) },
      medio: { value: color(PALETA.cieloMedio) },
      bajo: { value: color(PALETA.cieloBajo) },
      horizonte: { value: color(PALETA.horizonte) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const esfera = new THREE.Mesh(geo, mat);
  esfera.renderOrder = -2;
  grupo.add(esfera);

  // El sol: un disco sin luz ni niebla y, detras, un halo que se suma al cielo.
  const geoSol = new THREE.CircleGeometry(SOL.radio, 40);
  const matSol = new THREE.MeshBasicMaterial({ color: PALETA.sol, fog: false, depthWrite: false });
  const sol = new THREE.Mesh(geoSol, matSol);
  sol.renderOrder = -1;
  const texHalo = texturaHalo('#ffd27a');
  const matHalo = new THREE.SpriteMaterial({ map: texHalo, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
  const halo = new THREE.Sprite(matHalo);
  halo.scale.set(SOL.halo * 2, SOL.halo * 2, 1);
  halo.renderOrder = -1;
  grupo.add(sol, halo);

  return {
    grupo,
    seguir(camara) {
      esfera.position.copy(camara);
      sol.position.set(camara.x * 0.9, SOL.altura, camara.z - SOL.distancia);
      halo.position.set(sol.position.x, sol.position.y, sol.position.z - 1);
    },
    liberar() {
      geo.dispose();
      mat.dispose();
      geoSol.dispose();
      matSol.dispose();
      texHalo.dispose();
      matHalo.dispose();
    },
  };
}

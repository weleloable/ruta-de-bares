import * as THREE from 'three';

import { texturaHalo } from './paleta';

/**
 * El cielo (una esfera grande pintada por dentro con un degradado por altura),
 * el sol grande al fondo del camino con su halo, y de noche la luna y las
 * estrellas. Todo sigue a la camara: esta "en el infinito" y no se acerca.
 *
 * La hora va de 0 (atardecer) a 1 (noche), pasando por el crepusculo (0,5):
 * cada color sale de mezclar esos tres momentos. La escena usa tambien la
 * niebla y las luces que devuelve `ponerHora`.
 */

/** Los tres momentos: colores del cielo (de arriba abajo), niebla y luces. */
const MOMENTOS = [
  {
    arriba: 0x2e1846,
    medio: 0xb2496f,
    bajo: 0xee7a3a,
    horizonte: 0xffbf66,
    niebla: 0xe99257,
    cieloLuz: 0xffb48a,
    cieloFuerza: 1.15,
    sol: 0xffc27a,
    solFuerza: 1.4,
  },
  {
    arriba: 0x1a1036,
    medio: 0x5a2a5e,
    bajo: 0xa8486a,
    horizonte: 0xd9705a,
    niebla: 0x9a4a5a,
    cieloLuz: 0xc08aa0,
    cieloFuerza: 0.95,
    sol: 0xd07a6a,
    solFuerza: 0.8,
  },
  {
    arriba: 0x05060f,
    medio: 0x0c1230,
    bajo: 0x1a2348,
    horizonte: 0x2a3560,
    niebla: 0x1c2444,
    cieloLuz: 0x8a9ad0,
    cieloFuerza: 0.75,
    sol: 0x9ab0ff,
    solFuerza: 0.55,
  },
] as const;

export type Luz = { niebla: THREE.Color; cieloLuz: THREE.Color; cieloFuerza: number; sol: THREE.Color; solFuerza: number };

export type Cielo = {
  grupo: THREE.Group;
  /** Lo pone donde esta la camara (y el sol al fondo del camino). */
  seguir(camara: THREE.Vector3): void;
  /** La hora (0 atardecer, 0,5 crepusculo, 1 noche): cambia colores y devuelve la luz para la escena. */
  ponerHora(noche: number): Luz;
  /** Con los brillos apagados no hay halos (ni el del sol ni el de la luna). */
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
const SOL = { distancia: 330, altura: 16, radio: 34, halo: 150, hundido: -40 };
const LUNA = { distancia: 320, altura: 95, x: -70, radio: 12, halo: 70 };

/** Un color de paso, para no crear uno nuevo en cada fotograma. */
const otro = new THREE.Color();

/** Mezcla un valor de los tres momentos segun la hora. */
function mezclar(n: number, clave: 'arriba' | 'medio' | 'bajo' | 'horizonte' | 'niebla' | 'cieloLuz' | 'sol', destino: THREE.Color) {
  const [a, b] = n <= 0.5 ? [MOMENTOS[0], MOMENTOS[1]] : [MOMENTOS[1], MOMENTOS[2]];
  const f = n <= 0.5 ? n / 0.5 : (n - 0.5) / 0.5;
  return destino.set(a[clave]).lerp(otro.set(b[clave]), f);
}

function mezclarNumero(n: number, clave: 'cieloFuerza' | 'solFuerza') {
  const [a, b] = n <= 0.5 ? [MOMENTOS[0], MOMENTOS[1]] : [MOMENTOS[1], MOMENTOS[2]];
  const f = n <= 0.5 ? n / 0.5 : (n - 0.5) / 0.5;
  return a[clave] + (b[clave] - a[clave]) * f;
}

export function crearCielo(): Cielo {
  const grupo = new THREE.Group();
  const geo = new THREE.SphereGeometry(RADIO, 24, 16);
  const uniformes = {
    arriba: { value: new THREE.Color() },
    medio: { value: new THREE.Color() },
    bajo: { value: new THREE.Color() },
    horizonte: { value: new THREE.Color() },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertice,
    fragmentShader: fragmento,
    uniforms: uniformes,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const esfera = new THREE.Mesh(geo, mat);
  esfera.renderOrder = -3;
  grupo.add(esfera);

  // Estrellas: puntos fijos en la mitad de arriba de la esfera; salen con la noche.
  const N = 260;
  const pos = new Float32Array(N * 3);
  let semilla = 7;
  const azar = () => (semilla = (semilla * 9301 + 49297) % 233280) / 233280;
  for (let k = 0; k < N; k++) {
    const ang = azar() * Math.PI * 2;
    const alto = 0.12 + azar() * 0.85;
    const r = Math.sqrt(1 - alto * alto);
    pos.set([Math.cos(ang) * r * (RADIO - 10), alto * (RADIO - 10), Math.sin(ang) * r * (RADIO - 10)], k * 3);
  }
  const geoEstrellas = new THREE.BufferGeometry();
  geoEstrellas.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const matEstrellas = new THREE.PointsMaterial({ color: 0xfff6dd, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const estrellas = new THREE.Points(geoEstrellas, matEstrellas);
  estrellas.renderOrder = -2;
  grupo.add(estrellas);

  // El sol: un disco sin luz ni niebla y, detras, un halo que se suma al cielo.
  const geoSol = new THREE.CircleGeometry(SOL.radio, 40);
  const matSol = new THREE.MeshBasicMaterial({ color: 0xffe39a, fog: false, depthWrite: false, transparent: true });
  const sol = new THREE.Mesh(geoSol, matSol);
  sol.renderOrder = -1;
  const texHalo = texturaHalo('#ffd27a');
  const matHalo = new THREE.SpriteMaterial({ map: texHalo, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
  const halo = new THREE.Sprite(matHalo);
  halo.scale.set(SOL.halo * 2, SOL.halo * 2, 1);
  halo.renderOrder = -1;

  // La luna, arriba a la izquierda, con su halo azulado.
  const geoLuna = new THREE.CircleGeometry(LUNA.radio, 32);
  const matLuna = new THREE.MeshBasicMaterial({ color: 0xf2f0e6, fog: false, depthWrite: false, transparent: true, opacity: 0 });
  const luna = new THREE.Mesh(geoLuna, matLuna);
  luna.renderOrder = -1;
  const texLuna = texturaHalo('#9fb4ff');
  const matHaloLuna = new THREE.SpriteMaterial({ map: texLuna, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0 });
  const haloLuna = new THREE.Sprite(matHaloLuna);
  haloLuna.scale.set(LUNA.halo * 2, LUNA.halo * 2, 1);
  haloLuna.renderOrder = -1;
  grupo.add(sol, halo, luna, haloLuna);

  const luz: Luz = { niebla: new THREE.Color(), cieloLuz: new THREE.Color(), cieloFuerza: 1, sol: new THREE.Color(), solFuerza: 1 };
  let altoSol = SOL.altura;
  let conBrillos = true;

  return {
    grupo,
    seguir(camara) {
      esfera.position.copy(camara);
      estrellas.position.copy(camara);
      sol.position.set(camara.x * 0.9, altoSol, camara.z - SOL.distancia);
      halo.position.set(sol.position.x, sol.position.y, sol.position.z - 1);
      luna.position.set(camara.x * 0.9 + LUNA.x, LUNA.altura, camara.z - LUNA.distancia);
      haloLuna.position.set(luna.position.x, luna.position.y, luna.position.z - 1);
    },
    ponerHora(n) {
      mezclar(n, 'arriba', uniformes.arriba.value);
      mezclar(n, 'medio', uniformes.medio.value);
      mezclar(n, 'bajo', uniformes.bajo.value);
      mezclar(n, 'horizonte', uniformes.horizonte.value);
      // El sol se hunde en el horizonte con el crepusculo; la luna y las estrellas salen despues.
      const ocaso = Math.min(1, n / 0.6);
      altoSol = SOL.altura + (SOL.hundido - SOL.altura) * ocaso;
      matSol.opacity = 1 - Math.max(0, (n - 0.45) / 0.2);
      sol.visible = matSol.opacity > 0.01;
      halo.visible = conBrillos && sol.visible;
      matHalo.opacity = 1 - ocaso * 0.6;
      const noche = Math.max(0, (n - 0.5) / 0.5);
      matLuna.opacity = noche;
      matHaloLuna.opacity = noche * 0.8;
      luna.visible = noche > 0.01;
      haloLuna.visible = conBrillos && luna.visible;
      matEstrellas.opacity = noche;
      estrellas.visible = noche > 0.01;

      mezclar(n, 'niebla', luz.niebla);
      mezclar(n, 'cieloLuz', luz.cieloLuz);
      mezclar(n, 'sol', luz.sol);
      luz.cieloFuerza = mezclarNumero(n, 'cieloFuerza');
      luz.solFuerza = mezclarNumero(n, 'solFuerza');
      return luz;
    },
    brillos(si) {
      conBrillos = si;
    },
    liberar() {
      [geo, geoSol, geoLuna, geoEstrellas].forEach((g) => g.dispose());
      [mat, matSol, matLuna, matEstrellas, matHalo, matHaloLuna].forEach((m) => m.dispose());
      texHalo.dispose();
      texLuna.dispose();
    },
  };
}

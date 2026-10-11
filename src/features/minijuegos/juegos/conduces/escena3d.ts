import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Visuales } from './borrachera';
import { FACHADA, LADO, MEDIA_CALZADA, RADIO_CURVA, type Ciudad, type Obstaculo, type Tramo } from './ciudad';
import type { Marca, Particula } from './efectos';
import { COCHE, type Camara } from './modelo';

/**
 * "¿Conduces tú?" en 3D (three.js, solo web), con la camara detras y por encima
 * del coche, inclinada, como en los GTA. La fisica sigue siendo 2D (ver
 * modelo.ts): aqui solo se pinta. El plano del juego (x, y) es el suelo de
 * three (x, z), con la altura en y.
 *
 * Para que vaya en un movil:
 *  - cada tramo se construye una vez y se FUNDE por material (unas pocas
 *    llamadas de dibujo por tramo, no cientos);
 *  - las farolas no son luces de verdad (decenas de luces hunden el movil): son
 *    halos pintados en el suelo y en la lampara. Luz de verdad solo hay una: los
 *    faros de tu coche;
 *  - niebla de noche al fondo: tapa el borde de la ciudad generada y ahorra;
 *  - los efectos de la borrachera (borroso, doble, tunel) en una sola pasada de
 *    shader sobre la imagen ya pintada.
 */

export type CocheDibujo = {
  /** Para reconocer a cada coche del trafico entre fotogramas. */
  id: number;
  x: number;
  y: number;
  ang: number;
  color: string;
  frenando: boolean;
  danos: number;
  /** 1 = normal; menos, para el parpadeo de invulnerable (se oculta a ratos). */
  alfa: number;
};

export type Fotograma = {
  ciudad: Ciudad;
  jugador: CocheDibujo;
  trafico: CocheDibujo[];
  particulas: readonly Particula[];
  marcas: readonly Marca[];
  cam: Camara;
  /** Sacudida tras un choque, en px CSS (se pasa a metros). */
  temblor: { x: number; y: number };
};

export type Vista = { ancho: number; alto: number; densidad: number };

export function vistaPara(ancho: number, alto: number, densidad: number): Vista {
  return { ancho, alto, densidad };
}

/** La camara: metros por encima y por detras del punto que sigue, y cuanto mira por delante. */
export const CAMARA = { altura: 24, detras: 15, delante: 2, fov: 48 };
const NOCHE = 0x0b0d18;

// ---------------------------------------------------------------------------
// Texturas pintadas a mano en un canvas (se hacen una vez)
// ---------------------------------------------------------------------------

function lienzo(l: number, pinta: (c: CanvasRenderingContext2D, l: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = l;
  const ctx = c.getContext('2d');
  if (ctx) pinta(ctx, l);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function ruido(c: CanvasRenderingContext2D, l: number, base: string, fuerza: number) {
  c.fillStyle = base;
  c.fillRect(0, 0, l, l);
  for (let i = 0; i < l * 6; i++) {
    c.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${fuerza})` : `rgba(255,255,255,${fuerza * 0.6})`;
    c.fillRect(Math.random() * l, Math.random() * l, 2, 2);
  }
}

function adoquines(base: string) {
  return (c: CanvasRenderingContext2D, l: number) => {
    ruido(c, l, base, 0.12);
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 2;
    const fila = l / 8;
    for (let i = 0; i < 8; i++) {
      c.beginPath();
      c.moveTo(0, i * fila);
      c.lineTo(l, i * fila);
      c.stroke();
      for (let x = (i % 2) * (fila / 2); x < l; x += fila) {
        c.beginPath();
        c.moveTo(x, i * fila);
        c.lineTo(x, (i + 1) * fila);
        c.stroke();
      }
    }
  };
}

/** Halo redondo (para farolas, sombras y luces): blanco en el centro, transparente fuera. */
function halo(l: number, centro: string, borde: string) {
  return lienzo(l, (c) => {
    const g = c.createRadialGradient(l / 2, l / 2, 0, l / 2, l / 2, l / 2);
    g.addColorStop(0, centro);
    g.addColorStop(1, borde);
    c.fillStyle = g;
    c.fillRect(0, 0, l, l);
  });
}

/** Fachada: 4 x 4 ventanas (12 m de ancho, 12,8 de alto: vanos de 3 m y plantas de 3,2). Devuelve el color y lo que brilla. */
function fachada(pared: string) {
  const l = 256;
  const celda = l / 4;
  const encendidas: boolean[] = Array.from({ length: 16 }, () => Math.random() < 0.3);
  const mapa = lienzo(l, (c) => {
    ruido(c, l, pared, 0.08);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = i * celda + celda * 0.3;
        const y = j * celda + celda * 0.22;
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(x - 3, y - 3, celda * 0.4 + 6, celda * 0.5 + 6);
        c.fillStyle = encendidas[i * 4 + j] ? '#ffd27a' : '#1b1a22';
        c.fillRect(x, y, celda * 0.4, celda * 0.5);
        // Contraventanas verdes, como en el casco.
        c.fillStyle = '#2f4a32';
        c.fillRect(x - 6, y, 5, celda * 0.5);
        c.fillRect(x + celda * 0.4 + 1, y, 5, celda * 0.5);
      }
    }
  });
  const brillo = lienzo(l, (c) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, l, l);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (!encendidas[i * 4 + j]) continue;
        c.fillStyle = '#ffc860';
        c.fillRect(i * celda + celda * 0.3, j * celda + celda * 0.22, celda * 0.4, celda * 0.5);
      }
    }
  });
  return { mapa, brillo };
}

type Materiales = ReturnType<typeof crearMateriales>;

function crearMateriales() {
  const lambert = (p: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(p);
  const fachadaMat = (pared: string) => {
    const f = fachada(pared);
    return lambert({ map: f.mapa, emissiveMap: f.brillo, emissive: 0xffffff, emissiveIntensity: 0.9 });
  };
  const aditivo = (tex: THREE.Texture, color: number, opacidad: number) =>
    new THREE.MeshBasicMaterial({
      map: tex,
      color,
      transparent: true,
      opacity: opacidad,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  const haloBlanco = halo(128, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  return {
    suelo: lambert({ color: 0x15100d }),
    asfalto: lambert({ map: lienzo(128, (c, l) => ruido(c, l, '#2a2724', 0.18)) }),
    acera: lambert({ map: lienzo(256, adoquines('#5a4e42')) }),
    plaza: lambert({ map: lienzo(256, adoquines('#6a5b4a')) }),
    raya: lambert({ color: 0xc9a227, emissive: 0x3a2c08 }),
    rayaBlanca: lambert({ color: 0xe8e2d4, emissive: 0x222222 }),
    bordillo: lambert({ color: 0x8e887c }),
    fachadas: [fachadaMat('#7a3a26'), fachadaMat('#b58a4a'), fachadaMat('#cfc4ae'), fachadaMat('#8a4a30')],
    tejado: lambert({ color: 0x4a2418 }),
    piedra: lambert({ color: 0xcbbfa4 }),
    granito: lambert({ color: 0x8e887c }),
    bronce: lambert({ color: 0x5f7f5a }),
    tronco: lambert({ color: 0x4e3420 }),
    hoja: lambert({ color: 0x2f5a32 }),
    contenedor: lambert({ color: 0x2f5a3a }),
    hierro: lambert({ color: 0x1e1c1a }),
    valla: lambert({
      map: lienzo(64, (c, l) => {
        c.fillStyle = '#f2ece0';
        c.fillRect(0, 0, l, l);
        c.fillStyle = '#b5281f';
        for (let x = 0; x < l; x += 16) c.fillRect(x, 0, 8, l);
      }),
    }),
    lampara: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    // Charco de luz de farola en el suelo, y el resplandor de la lampara.
    charcoLuz: aditivo(haloBlanco, 0xffb860, 0.5),
    resplandor: aditivo(haloBlanco, 0xffd48a, 0.8),
    // Haz de los faros en el suelo.
    haz: aditivo(
      lienzo(128, (c, l) => {
        const g = c.createLinearGradient(0, l, 0, 0);
        g.addColorStop(0, 'rgba(255,240,200,0.9)');
        g.addColorStop(1, 'rgba(255,240,200,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(l * 0.42, l);
        c.lineTo(l * 0.58, l);
        c.lineTo(l, 0);
        c.lineTo(0, 0);
        c.closePath();
        c.fill();
      }),
      0xffffff,
      0.35,
    ),
    sombra: new THREE.MeshBasicMaterial({
      map: halo(64, 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0)'),
      transparent: true,
      depthWrite: false,
    }),
    marca: new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: 0.6, depthWrite: false }),
    cristal: lambert({ color: 0x1b2a38, emissive: 0x05080c }),
    rueda: lambert({ color: 0x111111 }),
    faro: new THREE.MeshBasicMaterial({ color: 0xfff6c9 }),
    piloto: new THREE.MeshBasicMaterial({ color: 0x8a1a14 }),
    pilotoFreno: new THREE.MeshBasicMaterial({ color: 0xff3a2e }),
    humo: new THREE.SpriteMaterial({ map: halo(64, 'rgba(90,90,95,0.9)', 'rgba(90,90,95,0)'), transparent: true, depthWrite: false }),
    chispa: new THREE.PointsMaterial({
      color: 0xffc060,
      size: 0.22,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  };
}

// ---------------------------------------------------------------------------
// Geometria: piezas que se juntan por material y se funden
// ---------------------------------------------------------------------------

type Cubos = Map<THREE.Material, THREE.BufferGeometry[]>;
const echar = (c: Cubos, m: THREE.Material, g: THREE.BufferGeometry) => {
  const lista = c.get(m);
  if (lista) lista.push(g);
  else c.set(m, [g]);
};

/** UV en metros (sobre el suelo, x y z), para que las texturas repitan a su tamaño real. */
function uvSuelo(g: THREE.BufferGeometry, metros: number) {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / metros;
    uv[i * 2 + 1] = pos.getZ(i) / metros;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Un rectangulo horizontal a la altura `h`, centrado en (x, z), girado `rot` (sentido del juego). */
function plano(w: number, d: number, x: number, z: number, h: number, rot = 0, uvMetros = 0) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.rotateY(-rot);
  g.translate(x, h, z);
  return uvMetros ? uvSuelo(g, uvMetros) : g;
}

/** Un trozo de anillo horizontal (curvas). Angulos como en el juego (y hacia abajo). */
function anillo(cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, h: number, uvMetros: number) {
  const g = new THREE.RingGeometry(r0, r1, 24, 1, -a1, a1 - a0);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, h, cz);
  return uvSuelo(g, uvMetros);
}

/** Una caja apoyada en el suelo (base en `h0`), centrada en (x, z) y girada `rot`. */
function caja(w: number, alto: number, d: number, x: number, z: number, rot = 0, h0 = 0) {
  const g = new THREE.BoxGeometry(w, alto, d);
  g.rotateY(-rot);
  g.translate(x, h0 + alto / 2, z);
  return g;
}

/**
 * Un edificio: paredes con la textura de fachada (en metros: 12 x 12,8 por
 * repeticion, desplazada al azar para que no se vean todas iguales) y tejado.
 */
function edificio(c: Cubos, mat: Materiales, w: number, d: number, x: number, z: number, rot: number, alto: number, semilla: number, h0 = 0) {
  const g = new THREE.BoxGeometry(w, alto, d);
  // Caras de la caja: +x, -x, +y, -y, +z, -z (4 vertices cada una).
  const uv = g.getAttribute('uv');
  const medidas = [
    [d, alto],
    [d, alto],
    [w, d],
    [w, d],
    [w, alto],
    [w, alto],
  ];
  const desfase = (semilla % 4) * 0.25;
  for (let cara = 0; cara < 6; cara++) {
    const [mu, mv] = medidas[cara];
    for (let k = 0; k < 4; k++) {
      const i = cara * 4 + k;
      uv.setXY(i, uv.getX(i) * (mu / 12) + desfase, uv.getY(i) * (mv / 12.8));
    }
  }
  // Paredes: todo menos arriba y abajo (caras 2 y 3).
  const indice = g.getIndex();
  if (!indice) return;
  const todos = Array.from(indice.array);
  const paredes = [...todos.slice(0, 12), ...todos.slice(24, 36)];
  const tejado = todos.slice(12, 18);
  const conTejado = g.clone();
  g.setIndex(paredes);
  conTejado.setIndex(tejado);
  for (const geo of [g, conTejado]) {
    geo.rotateY(-rot);
    geo.translate(x, h0 + alto / 2, z);
  }
  echar(c, mat.fachadas[semilla % mat.fachadas.length], g);
  echar(c, mat.tejado, conTejado);
}

/** Un numero "al azar" pero fijo para una semilla y una posicion. */
const hash = (a: number, b: number) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Una caja de "edificio" del juego se pinta como varios edificios seguidos de
 * alturas distintas (una manzana de 40 m de un solo bloque queda muy falsa).
 */
function manzana(c: Cubos, mat: Materiales, o: Obstaculo, semilla: number, plantasMin = 2) {
  const largoEnZ = o.h >= o.w;
  const largo = largoEnZ ? o.h : o.w;
  const n = Math.max(1, Math.round(largo / 9));
  let desde = -largo / 2;
  for (let k = 0; k < n; k++) {
    const trozo = k === n - 1 ? largo / 2 - desde : (largo / n) * (0.7 + hash(semilla, k) * 0.6);
    const centro = desde + trozo / 2;
    const alto = 3.2 * (plantasMin + Math.floor(hash(semilla + 7, k) * 3));
    // El centro del trozo, girado con la caja.
    const cos = Math.cos(o.ang);
    const sin = Math.sin(o.ang);
    const lx = largoEnZ ? 0 : centro;
    const ly = largoEnZ ? centro : 0;
    const x = o.x + lx * cos - ly * sin;
    const z = o.y + lx * sin + ly * cos;
    edificio(c, mat, largoEnZ ? o.w : trozo, largoEnZ ? trozo : o.h, x, z, o.ang, alto, Math.floor(hash(semilla, k + 3) * 1000) + k);
    desde += trozo;
  }
}

// ---------------------------------------------------------------------------
// Coches
// ---------------------------------------------------------------------------

const geoCoche = {
  carroceria: new THREE.BoxGeometry(COCHE.ancho, 0.7, COCHE.largo),
  cabina: new THREE.BoxGeometry(COCHE.ancho * 0.86, 0.55, COCHE.largo * 0.5),
  techo: new THREE.BoxGeometry(COCHE.ancho * 0.8, 0.08, COCHE.largo * 0.4),
  rueda: new THREE.CylinderGeometry(0.34, 0.34, 0.28, 12).rotateZ(Math.PI / 2),
  faro: new THREE.BoxGeometry(0.42, 0.16, 0.06),
  sombra: new THREE.PlaneGeometry(COCHE.ancho * 1.5, COCHE.largo * 1.25).rotateX(-Math.PI / 2),
  haz: new THREE.PlaneGeometry(9, 16).rotateX(-Math.PI / 2),
};

type ModeloCoche = {
  grupo: THREE.Group;
  pintura: THREE.MeshLambertMaterial;
  pilotos: THREE.Mesh[];
  color: string;
};

function crearCoche(mat: Materiales, color: string, conLuces: boolean): ModeloCoche {
  const grupo = new THREE.Group();
  const pintura = new THREE.MeshLambertMaterial({ color });
  const carroceria = new THREE.Mesh(geoCoche.carroceria, pintura);
  carroceria.position.y = 0.6;
  const cabina = new THREE.Mesh(geoCoche.cabina, mat.cristal);
  cabina.position.set(0, 1.2, 0.25);
  const techo = new THREE.Mesh(geoCoche.techo, pintura);
  techo.position.set(0, 1.5, 0.25);
  grupo.add(carroceria, cabina, techo);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const r = new THREE.Mesh(geoCoche.rueda, mat.rueda);
      r.position.set(sx * (COCHE.ancho / 2 - 0.05), 0.34, sz * 1.35);
      grupo.add(r);
    }
  }
  const pilotos: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(geoCoche.faro, mat.faro);
    f.position.set(sx * 0.6, 0.65, -COCHE.largo / 2 - 0.01);
    const p = new THREE.Mesh(geoCoche.faro, mat.piloto);
    p.position.set(sx * 0.6, 0.7, COCHE.largo / 2 + 0.01);
    pilotos.push(p);
    grupo.add(f, p);
  }
  const sombra = new THREE.Mesh(geoCoche.sombra, mat.sombra);
  sombra.position.y = 0.03;
  grupo.add(sombra);
  if (conLuces) {
    const haz = new THREE.Mesh(geoCoche.haz, mat.haz);
    haz.position.set(0, 0.04, -COCHE.largo / 2 - 8);
    grupo.add(haz);
  }
  return { grupo, pintura, pilotos, color };
}

function ponerCoche(m: ModeloCoche, c: CocheDibujo, mat: Materiales) {
  m.grupo.position.set(c.x, 0, c.y);
  m.grupo.rotation.y = -c.ang;
  m.grupo.visible = c.alfa > 0.5;
  for (const p of m.pilotos) p.material = c.frenando ? mat.pilotoFreno : mat.piloto;
  // Los golpes oscurecen la chapa (el humo lo ponen las particulas).
  const base = new THREE.Color(c.color);
  m.pintura.color.copy(base.multiplyScalar(1 - Math.min(c.danos, 3) * 0.12));
}

// ---------------------------------------------------------------------------
// Cada tramo
// ---------------------------------------------------------------------------

const A_RAYAS = 3;

function construirTramo(t: Tramo, mat: Materiales): THREE.Group {
  const c: Cubos = new Map();
  const M = LADO / 2;
  echar(c, mat.suelo, plano(LADO, LADO, 0, 0, -0.01));

  if (t.tipo === 'curva') {
    const s = t.sentido === 'derecha' ? 1 : -1;
    const cx = s * M;
    const cz = M;
    const [a0, a1] = s === 1 ? [Math.PI, Math.PI * 1.5] : [-Math.PI / 2, 0];
    echar(c, mat.acera, anillo(cx, cz, RADIO_CURVA - FACHADA, RADIO_CURVA + FACHADA, a0, a1, 0.01, 4));
    echar(c, mat.asfalto, anillo(cx, cz, RADIO_CURVA - MEDIA_CALZADA, RADIO_CURVA + MEDIA_CALZADA, a0, a1, 0.02, 6));
    for (let k = 0; k < 6; k++) {
      const a = a0 + ((k + 0.5) * (a1 - a0)) / 6;
      // Tangente a la curva: con este giro el lado largo de la raya va a lo largo de la calle.
      echar(c, mat.raya, plano(0.15, A_RAYAS, cx + Math.cos(a) * RADIO_CURVA, cz + Math.sin(a) * RADIO_CURVA, 0.03, a));
    }
  } else if (t.tipo === 'plaza') {
    echar(c, mat.plaza, plano(34, LADO, 0, 0, 0.01, 0, 4));
  } else {
    echar(c, mat.acera, plano(FACHADA * 2, LADO, 0, 0, 0.01, 0, 4));
    echar(c, mat.asfalto, plano(MEDIA_CALZADA * 2, LADO, 0, 0, 0.02, 0, 6));
    for (const lado of [-1, 1]) echar(c, mat.bordillo, plano(0.25, LADO, lado * MEDIA_CALZADA, 0, 0.025));
    if (t.tipo === 'cruce') {
      echar(c, mat.acera, plano(LADO, FACHADA * 2, 0, 0, 0.012, 0, 4));
      echar(c, mat.asfalto, plano(LADO, MEDIA_CALZADA * 2, 0, 0, 0.022, 0, 6));
      for (const sgn of [-1, 1]) {
        for (let k = -5.5; k <= 5.5; k += 1.1) {
          echar(c, mat.rayaBlanca, plano(0.5, 1.8, k, sgn * 8.2, 0.03));
          echar(c, mat.rayaBlanca, plano(1.8, 0.5, sgn * 8.2, k, 0.03));
        }
      }
    } else {
      for (let y = -M + 3; y < M; y += 6) echar(c, mat.raya, plano(0.15, A_RAYAS, 0, y, 0.03));
      for (const lado of [-1, 1]) echar(c, mat.rayaBlanca, plano(0.08, LADO, lado * 4.25, 0, 0.03));
    }
  }

  for (const o of t.locales) obstaculo(c, mat, o, t);
  // Soportales de la Calle Mayor: las plantas de arriba vuelan sobre la acera.
  if (t.tipo === 'mayor') {
    for (const lado of [-1, 1]) {
      const x = lado * (FACHADA - 0.8);
      edificio(c, mat, 1.6, LADO, x, 0, 0, 3.2 * 2, t.semilla + lado, 3.6);
    }
  }

  const grupo = new THREE.Group();
  for (const [m, geos] of c) {
    // Para fundir, todas con indice o todas sin (el icosaedro de los arboles no lo tiene).
    const mezcla = geos.some((g) => !g.index) && geos.some((g) => g.index);
    const listas = mezcla ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
    const fundida = mergeGeometries(listas, false);
    for (const g of new Set([...geos, ...listas])) g.dispose();
    if (fundida) grupo.add(new THREE.Mesh(fundida, m));
  }
  // Farolas: poste, lampara, resplandor y charco de luz en el suelo.
  for (const f of t.farolas) {
    const charco = new THREE.Mesh(geoFarola.charco, mat.charcoLuz);
    charco.position.set(f.x, 0.05, f.y);
    const brillo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: (mat.resplandor as THREE.MeshBasicMaterial).map,
      color: 0xffd48a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    brillo.position.set(f.x, 4.6, f.y);
    brillo.scale.set(3.2, 3.2, 1);
    grupo.add(charco, brillo);
  }
  grupo.position.set(t.centro.x, 0, t.centro.y);
  grupo.rotation.y = -t.rot;
  return grupo;
}

const geoFarola = { charco: new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2) };

function obstaculo(c: Cubos, mat: Materiales, o: Obstaculo, t: Tramo) {
  switch (o.tipo) {
    case 'edificio':
      manzana(c, mat, o, t.semilla + Math.round(o.x * 13 + o.y * 7), 2);
      return;
    case 'columna':
      echar(c, mat.piedra, caja(o.w, 3.6, o.h, o.x, o.y, o.ang));
      return;
    case 'contenedor':
      echar(c, mat.contenedor, caja(o.w, 1.4, o.h, o.x, o.y, o.ang));
      return;
    case 'bolardo':
      echar(c, mat.hierro, new THREE.CylinderGeometry(0.15, 0.18, 0.9, 8).translate(o.x, 0.45, o.y));
      return;
    case 'mesa': {
      echar(c, mat.hierro, new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6).translate(o.x, 1.1, o.y));
      const sombrilla = new THREE.ConeGeometry(1.4, 0.6, 8).translate(o.x, 2.4, o.y);
      echar(c, materialColor(o.color ?? '#A82C24'), sombrilla);
      return;
    }
    case 'estatua':
      echar(c, mat.granito, caja(o.w, 2.2, o.h, o.x, o.y, o.ang));
      echar(c, mat.bronce, new THREE.CylinderGeometry(0.45, 0.6, 2.2, 10).translate(o.x, 3.3, o.y));
      echar(c, mat.bronce, new THREE.SphereGeometry(0.35, 10, 8).translate(o.x, 4.7, o.y));
      return;
    case 'arbol':
      echar(c, mat.tronco, new THREE.CylinderGeometry(0.2, 0.3, 2.6, 6).translate(o.x, 1.3, o.y));
      echar(c, mat.hoja, new THREE.IcosahedronGeometry(2.1, 0).translate(o.x, 3.6, o.y));
      return;
    case 'farola':
      echar(c, mat.hierro, new THREE.CylinderGeometry(0.08, 0.12, 4.4, 6).translate(o.x, 2.2, o.y));
      echar(c, mat.lampara, new THREE.SphereGeometry(0.28, 8, 6).translate(o.x, 4.5, o.y));
      return;
    case 'valla':
      echar(c, mat.valla, caja(o.w, 1.1, o.h, o.x, o.y, o.ang));
      return;
    case 'aparcado':
      return; // coches: aparte (son grupos, no se funden)
  }
}

const coloresMat = new Map<string, THREE.MeshLambertMaterial>();
function materialColor(color: string) {
  let m = coloresMat.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    coloresMat.set(color, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Efectos de la borrachera, en una pasada sobre la imagen ya pintada
// ---------------------------------------------------------------------------

const SHADER_EFECTOS = {
  uniforms: {
    tImagen: { value: null as THREE.Texture | null },
    uBorroso: { value: new THREE.Vector2() },
    uDoble: { value: new THREE.Vector2() },
    uTunel: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tImagen;
    uniform vec2 uBorroso;
    uniform vec2 uDoble;
    uniform float uTunel;
    varying vec2 vUv;
    vec3 muestra(vec2 uv) {
      // Desenfoque barato: 9 muestras alrededor (si no hay, solo cuenta la del centro).
      vec3 c = texture2D(tImagen, uv).rgb * 0.2;
      c += texture2D(tImagen, uv + vec2( uBorroso.x, 0.0)).rgb * 0.12;
      c += texture2D(tImagen, uv + vec2(-uBorroso.x, 0.0)).rgb * 0.12;
      c += texture2D(tImagen, uv + vec2(0.0,  uBorroso.y)).rgb * 0.12;
      c += texture2D(tImagen, uv + vec2(0.0, -uBorroso.y)).rgb * 0.12;
      c += texture2D(tImagen, uv + uBorroso * 0.7).rgb * 0.08;
      c += texture2D(tImagen, uv - uBorroso * 0.7).rgb * 0.08;
      c += texture2D(tImagen, uv + vec2(uBorroso.x, -uBorroso.y) * 0.7).rgb * 0.08;
      c += texture2D(tImagen, uv + vec2(-uBorroso.x, uBorroso.y) * 0.7).rgb * 0.08;
      return c;
    }
    void main() {
      vec3 c = muestra(vUv);
      // Vision doble: la misma imagen, desplazada, encima.
      if (abs(uDoble.x) + abs(uDoble.y) > 0.0001) c = mix(c, muestra(vUv + uDoble), 0.4);
      // Tunel: los bordes se oscurecen.
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - uTunel * smoothstep(0.25, 0.75, d);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }
  `,
};

// ---------------------------------------------------------------------------
// El conjunto
// ---------------------------------------------------------------------------

const MAX_MARCAS = 700;
const MAX_CHISPAS = 300;
const MAX_HUMO = 90;

export class Escena3D {
  private renderer: THREE.WebGLRenderer;
  private escena = new THREE.Scene();
  private camara = new THREE.PerspectiveCamera(CAMARA.fov, 2, 0.5, 220);
  private mat = crearMateriales();
  private tramos = new Map<Tramo, THREE.Group>();
  private jugador: ModeloCoche;
  private faros: THREE.SpotLight;
  private trafico = new Map<number, ModeloCoche>();
  private aparcados = new Map<Tramo, ModeloCoche[]>();
  private valla: THREE.Mesh;
  private marcas: THREE.Mesh;
  private chispas: THREE.Points;
  private humo: THREE.Sprite[] = [];
  private objetivo: THREE.WebGLRenderTarget;
  private efectos: THREE.ShaderMaterial;
  private escenaEfectos = new THREE.Scene();
  private camaraEfectos = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(NOCHE);
    this.escena.background = new THREE.Color(NOCHE);
    this.escena.fog = new THREE.Fog(NOCHE, 35, 95);

    // Luz de luna: poca, azulada. Lo demas son halos y los faros.
    this.escena.add(new THREE.HemisphereLight(0x5a6a9a, 0x20160f, 1.1));
    const luna = new THREE.DirectionalLight(0x8899cc, 0.6);
    luna.position.set(-30, 60, 20);
    this.escena.add(luna);

    this.jugador = crearCoche(this.mat, '#C67A1E', true);
    this.faros = new THREE.SpotLight(0xfff0c8, 90, 45, 0.55, 0.6, 1.2);
    this.faros.position.set(0, 1.0, -COCHE.largo / 2);
    this.faros.target.position.set(0, 0, -COCHE.largo / 2 - 14);
    this.jugador.grupo.add(this.faros, this.faros.target);
    this.escena.add(this.jugador.grupo);

    this.valla = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 1), this.mat.valla);
    this.escena.add(this.valla);

    // Marcas de derrape: un rectangulo fino por segmento, todos en una malla.
    const gm = new THREE.BufferGeometry();
    gm.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_MARCAS * 6 * 3), 3));
    gm.setDrawRange(0, 0);
    this.marcas = new THREE.Mesh(gm, this.mat.marca);
    this.marcas.frustumCulled = false;
    this.escena.add(this.marcas);

    const gc = new THREE.BufferGeometry();
    gc.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_CHISPAS * 3), 3));
    gc.setDrawRange(0, 0);
    this.chispas = new THREE.Points(gc, this.mat.chispa);
    this.chispas.frustumCulled = false;
    this.escena.add(this.chispas);
    for (let i = 0; i < MAX_HUMO; i++) {
      const s = new THREE.Sprite(this.mat.humo.clone());
      s.visible = false;
      this.humo.push(s);
      this.escena.add(s);
    }

    // La imagen se pinta en una textura y luego pasa por los efectos.
    this.objetivo = new THREE.WebGLRenderTarget(2, 2, { samples: this.renderer.capabilities.isWebGL2 ? 4 : 0 });
    this.efectos = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SHADER_EFECTOS.uniforms),
      vertexShader: SHADER_EFECTOS.vertexShader,
      fragmentShader: SHADER_EFECTOS.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.escenaEfectos.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.efectos));
  }

  private sincronizarTramos(ciudad: Ciudad) {
    const vivos = new Set(ciudad.tramos);
    for (const [t, g] of this.tramos) {
      if (vivos.has(t)) continue;
      this.escena.remove(g);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry !== geoFarola.charco) o.geometry.dispose();
        if (o instanceof THREE.Sprite) o.material.dispose();
      });
      this.tramos.delete(t);
      for (const m of this.aparcados.get(t) ?? []) this.escena.remove(m.grupo);
      this.aparcados.delete(t);
    }
    for (const t of ciudad.tramos) {
      if (this.tramos.has(t)) continue;
      const g = construirTramo(t, this.mat);
      this.tramos.set(t, g);
      this.escena.add(g);
      const coches = t.obstaculos
        .filter((o) => o.tipo === 'aparcado')
        .map((o) => {
          const m = crearCoche(this.mat, o.color ?? '#777777', false);
          ponerCoche(m, { id: -1, x: o.x, y: o.y, ang: o.ang, color: o.color ?? '#777777', frenando: false, danos: 0, alfa: 1 }, this.mat);
          this.escena.add(m.grupo);
          return m;
        });
      this.aparcados.set(t, coches);
    }
  }

  private sincronizarTrafico(trafico: readonly CocheDibujo[]) {
    const vivos = new Set(trafico.map((c) => c.id));
    for (const [id, m] of this.trafico) {
      if (vivos.has(id)) continue;
      this.escena.remove(m.grupo);
      m.pintura.dispose();
      this.trafico.delete(id);
    }
    for (const c of trafico) {
      let m = this.trafico.get(c.id);
      if (!m) {
        m = crearCoche(this.mat, c.color, true);
        this.trafico.set(c.id, m);
        this.escena.add(m.grupo);
      }
      ponerCoche(m, c, this.mat);
    }
  }

  private actualizarMarcas(marcas: readonly Marca[]) {
    const n = Math.min(marcas.length, MAX_MARCAS);
    const pos = this.marcas.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const ancho = 0.14;
    for (let i = 0; i < n; i++) {
      const m = marcas[marcas.length - n + i];
      const dx = m.x2 - m.x1;
      const dy = m.y2 - m.y1;
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * ancho;
      const ny = (dx / l) * ancho;
      const v = [
        [m.x1 - nx, m.y1 - ny],
        [m.x1 + nx, m.y1 + ny],
        [m.x2 + nx, m.y2 + ny],
        [m.x1 - nx, m.y1 - ny],
        [m.x2 + nx, m.y2 + ny],
        [m.x2 - nx, m.y2 - ny],
      ];
      v.forEach(([x, z], k) => {
        a[(i * 6 + k) * 3] = x;
        a[(i * 6 + k) * 3 + 1] = 0.035;
        a[(i * 6 + k) * 3 + 2] = z;
      });
    }
    pos.needsUpdate = true;
    this.marcas.geometry.setDrawRange(0, n * 6);
  }

  private actualizarParticulas(ps: readonly Particula[]) {
    const pos = this.chispas.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    let nc = 0;
    let nh = 0;
    for (const p of ps) {
      const vida = p.vida / p.max;
      if (p.tipo === 'chispa') {
        if (nc >= MAX_CHISPAS) continue;
        a[nc * 3] = p.x;
        a[nc * 3 + 1] = 0.4 + (1 - vida) * 0.8;
        a[nc * 3 + 2] = p.y;
        nc++;
      } else {
        if (nh >= MAX_HUMO) continue;
        const s = this.humo[nh++];
        s.visible = true;
        s.position.set(p.x, 1 + (1 - vida) * 2.5, p.y);
        const tam = p.tam * 2.4;
        s.scale.set(tam, tam, 1);
        (s.material as THREE.SpriteMaterial).opacity = (p.tipo === 'humo' ? 0.55 : 0.3) * vida;
      }
    }
    pos.needsUpdate = true;
    this.chispas.geometry.setDrawRange(0, nc);
    for (let i = nh; i < MAX_HUMO; i++) this.humo[i].visible = false;
  }

  dibujar(f: Fotograma, v: Vista, e: Visuales) {
    if (this.objetivo.width !== v.ancho || this.objetivo.height !== v.alto) {
      this.renderer.setSize(v.ancho, v.alto, false);
      this.objetivo.setSize(v.ancho, v.alto);
      this.camara.aspect = v.ancho / v.alto;
      this.camara.updateProjectionMatrix();
    }
    this.sincronizarTramos(f.ciudad);
    this.sincronizarTrafico(f.trafico);
    ponerCoche(this.jugador, f.jugador, this.mat);
    const valla = f.ciudad.vallaTrasera();
    this.valla.position.set(valla.x, 0.55, valla.y);
    this.valla.scale.set(valla.w, 1, valla.h);
    this.valla.rotation.y = -valla.ang;
    this.actualizarMarcas(f.marcas);
    this.actualizarParticulas(f.particulas);

    // La camara: detras y por encima del punto que sigue, girada con el coche,
    // con el balanceo de la borrachera y la sacudida de los choques.
    const ang = f.cam.ang + e.balanceo.ang * 0.5;
    const fx = Math.sin(ang);
    const fz = -Math.cos(ang);
    const sacudida = 0.06;
    const px = f.cam.x + e.balanceo.x + f.temblor.x * sacudida;
    const pz = f.cam.y + e.balanceo.y + f.temblor.y * sacudida;
    this.camara.position.set(px - fx * CAMARA.detras, CAMARA.altura, pz - fz * CAMARA.detras);
    this.camara.up.set(Math.sin(e.balanceo.ang) * 0.6, 1, 0).normalize();
    this.camara.lookAt(px + fx * CAMARA.delante, 0, pz + fz * CAMARA.delante);

    this.renderer.setRenderTarget(this.objetivo);
    this.renderer.render(this.escena, this.camara);
    this.renderer.setRenderTarget(null);

    const u = this.efectos.uniforms;
    u.tImagen.value = this.objetivo.texture;
    const px1 = 1 / (v.ancho / v.densidad);
    const py1 = 1 / (v.alto / v.densidad);
    u.uBorroso.value.set(e.borroso * px1, e.borroso * py1);
    u.uDoble.value.set(e.doble.x * px1, -e.doble.y * py1);
    u.uTunel.value = e.tunel;
    this.renderer.render(this.escenaEfectos, this.camaraEfectos);
  }

  liberar() {
    this.escena.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.objetivo.dispose();
    this.renderer.dispose();
  }
}

/** Si el navegador sabe hacer WebGL (si no, el juego lo dice en vez de quedarse en negro). */
export function hayWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

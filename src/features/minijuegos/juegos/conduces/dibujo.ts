import type { Visuales } from './borrachera';
import { FACHADA, LADO, MEDIA_CALZADA, RADIO_CURVA, type Ciudad, type Obstaculo, type Tramo } from './ciudad';
import type { Marca, Particula } from './efectos';
import { COCHE, type Camara } from './modelo';

/**
 * Pinta "¿Conduces tú?" en canvas 2D (solo web). Tres lienzos:
 *
 *  1. `escena` (fuera de pantalla): el mundo visto desde la camara, con su
 *     iluminacion de noche: una capa de oscuridad a la que se le RECORTAN las
 *     farolas, los faros y las ventanas encendidas, y luego halos que suman luz.
 *  2. `luz` (fuera de pantalla): esa capa de oscuridad.
 *  3. la pantalla: la escena compuesta con los efectos de la borrachera
 *     (desenfoque, vision doble, tunel). Componer aparte permite dibujar el
 *     mundo una sola vez aunque se vea doble.
 *
 * El mundo esta en metros; `ppm` son pixeles por metro.
 */

const C = {
  tejado: '#2c1a13',
  tejadoLinea: '#22140e',
  asfalto: '#26231f',
  raya: 'rgba(201, 162, 39, 0.6)',
  rayaBlanca: 'rgba(240, 235, 220, 0.55)',
  acera: '#4a4037',
  plaza: '#5a4d3f',
  ladrillo: '#6b3424',
  ladrilloOscuro: '#4e2519',
  ventana: '#1a1310',
  ventanaLuz: '#ffd27a',
  sombraSoportal: 'rgba(0, 0, 0, 0.32)',
  piedra: '#cbbfa4',
  granito: '#8e887c',
  bronce: '#5f7f5a',
  hoja: '#2f5a32',
  hojaClara: '#3f7a3a',
  cristal: '#1b2a38',
  faro: '#fff6c9',
  piloto: '#d8322a',
  noche: 'rgba(6, 8, 22, 0.52)',
} as const;

/** Donde va el coche en la pantalla: centrado y abajo, para ver lo que viene. */
export const ANCLA = { x: 0.5, y: 0.68 };
/** Metros que caben de alto (la dimension corta, en horizontal). */
export const METROS_DE_ALTO = 32;

export type CocheDibujo = {
  x: number;
  y: number;
  ang: number;
  color: string;
  frenando: boolean;
  /** Choques que lleva: abolladuras y luna rota. */
  danos: number;
  /** 1 = normal; menos, para el parpadeo de invulnerable. */
  alfa: number;
};

export type Fotograma = {
  ciudad: Ciudad;
  jugador: CocheDibujo;
  trafico: CocheDibujo[];
  particulas: readonly Particula[];
  marcas: readonly Marca[];
  cam: Camara;
  /** Sacudida de pantalla tras un choque, px CSS. */
  temblor: { x: number; y: number };
};

// ---------------------------------------------------------------------------
// Patrones (se hacen una vez)
// ---------------------------------------------------------------------------

const patrones = new Map<string, CanvasPattern | null>();

function patron(ctx: CanvasRenderingContext2D, nombre: string, metros: number, pinta: (p: CanvasRenderingContext2D, l: number) => void) {
  if (!patrones.has(nombre)) {
    const l = 64;
    const c = document.createElement('canvas');
    c.width = l;
    c.height = l;
    const p = c.getContext('2d');
    let r: CanvasPattern | null = null;
    if (p) {
      pinta(p, l);
      r = ctx.createPattern(c, 'repeat');
      r?.setTransform(new DOMMatrix().scale(metros / l));
    }
    patrones.set(nombre, r);
  }
  return patrones.get(nombre) ?? '#333';
}

function adoquin(base: string) {
  return (p: CanvasRenderingContext2D, l: number) => {
    p.fillStyle = base;
    p.fillRect(0, 0, l, l);
    p.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    p.lineWidth = 2;
    const fila = l / 4;
    for (let i = 0; i < 4; i++) {
      p.beginPath();
      p.moveTo(0, i * fila);
      p.lineTo(l, i * fila);
      p.stroke();
      for (let x = (i % 2) * (fila / 2); x < l; x += fila) {
        p.beginPath();
        p.moveTo(x, i * fila);
        p.lineTo(x, (i + 1) * fila);
        p.stroke();
      }
    }
  };
}

function tejas(p: CanvasRenderingContext2D, l: number) {
  p.fillStyle = C.tejado;
  p.fillRect(0, 0, l, l);
  p.strokeStyle = C.tejadoLinea;
  p.lineWidth = 3;
  const fila = l / 5;
  for (let i = 0; i < 5; i++) {
    p.beginPath();
    p.moveTo(0, i * fila + 1);
    p.lineTo(l, i * fila + 1);
    p.stroke();
    for (let x = (i % 2) * 6; x < l; x += 12) {
      p.beginPath();
      p.moveTo(x, i * fila);
      p.lineTo(x, i * fila + fila * 0.6);
      p.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// Ventanas encendidas (fijas por tramo: dependen de su semilla)
// ---------------------------------------------------------------------------

const ventanasCache = new WeakMap<Tramo, { x: number; y: number; luz: boolean }[]>();

/** Un numero "al azar" pero fijo para una semilla y una posicion. */
const hash = (a: number, b: number, c: number) => {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

function ventanas(t: Tramo) {
  let v = ventanasCache.get(t);
  if (!v) {
    v = [];
    const fachada = t.tipo === 'plaza' ? 17.6 : FACHADA + 0.6;
    if (t.tipo !== 'curva' && t.tipo !== 'cruce') {
      for (const lado of [-1, 1]) {
        for (let k = 0; k < 13; k++) {
          v.push({ x: lado * fachada, y: -18 + k * 3, luz: hash(t.semilla, k, lado) < 0.32 });
        }
      }
    }
    ventanasCache.set(t, v);
  }
  return v;
}

// ---------------------------------------------------------------------------
// El suelo de cada tramo (en su marco local)
// ---------------------------------------------------------------------------

function anillo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r1, a0, a1);
  ctx.arc(cx, cy, r0, a1, a0, true);
  ctx.closePath();
  ctx.fill();
}

function rayaCentral(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.strokeStyle = C.raya;
  ctx.lineWidth = 0.15;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.setLineDash([]);
}

function fachadaRecta(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number) {
  ctx.fillStyle = C.ladrillo;
  ctx.fillRect(x, y0, 1.2 * Math.sign(x || 1), y1 - y0);
}

function dibujarSuelo(ctx: CanvasRenderingContext2D, t: Tramo) {
  const M = LADO / 2;
  const acera = patron(ctx, 'acera', 2, adoquin(C.acera));
  if (t.tipo === 'curva') {
    const s = t.sentido === 'derecha' ? 1 : -1;
    const cx = s * M;
    const cy = M;
    const [a0, a1] = s === 1 ? [Math.PI, Math.PI * 1.5] : [-Math.PI / 2, 0];
    ctx.fillStyle = C.ladrillo;
    anillo(ctx, cx, cy, RADIO_CURVA - FACHADA - 1.2, RADIO_CURVA + FACHADA + 1.2, a0, a1);
    ctx.fillStyle = acera;
    anillo(ctx, cx, cy, RADIO_CURVA - FACHADA, RADIO_CURVA + FACHADA, a0, a1);
    ctx.fillStyle = C.asfalto;
    anillo(ctx, cx, cy, RADIO_CURVA - MEDIA_CALZADA, RADIO_CURVA + MEDIA_CALZADA, a0, a1);
    ctx.strokeStyle = C.raya;
    ctx.lineWidth = 0.15;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, RADIO_CURVA, a0, a1);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  if (t.tipo === 'plaza') {
    ctx.fillStyle = C.ladrillo;
    ctx.fillRect(-18.2, -M, 36.4, LADO);
    ctx.fillStyle = patron(ctx, 'plaza', 3, adoquin(C.plaza));
    ctx.fillRect(-17, -M, 34, LADO);
    // El anillo de piedra alrededor de la estatua.
    ctx.strokeStyle = 'rgba(203, 191, 164, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  // Rectas y cruces: aceras, calzada y fachadas.
  for (const lado of [-1, 1]) fachadaRecta(ctx, lado * FACHADA, -M, M);
  ctx.fillStyle = acera;
  ctx.fillRect(-FACHADA, -M, FACHADA * 2, LADO);
  if (t.tipo === 'cruce') {
    for (const lado of [-1, 1]) {
      ctx.fillStyle = C.ladrillo;
      ctx.fillRect(-M, lado * FACHADA, LADO, 1.2 * lado);
    }
    ctx.fillStyle = acera;
    ctx.fillRect(-M, -FACHADA, LADO, FACHADA * 2);
  }
  ctx.fillStyle = C.asfalto;
  ctx.fillRect(-MEDIA_CALZADA, -M, MEDIA_CALZADA * 2, LADO);
  if (t.tipo === 'cruce') {
    ctx.fillRect(-M, -MEDIA_CALZADA, LADO, MEDIA_CALZADA * 2);
    // Pasos de cebra en los cuatro brazos.
    ctx.fillStyle = C.rayaBlanca;
    for (const s of [-1, 1]) {
      for (let k = -5.5; k <= 5.5; k += 1.1) {
        ctx.fillRect(k - 0.25, s * 8.2 - 0.9, 0.5, 1.8);
        ctx.fillRect(s * 8.2 - 0.9, k - 0.25, 1.8, 0.5);
      }
    }
    rayaCentral(ctx, 0, -M, 0, -10);
    rayaCentral(ctx, 0, 10, 0, M);
    rayaCentral(ctx, -M, 0, -10, 0);
    rayaCentral(ctx, 10, 0, M, 0);
    return;
  }

  rayaCentral(ctx, 0, -M, 0, M);
  // Las franjas de aparcar, con una linea blanca fina.
  ctx.strokeStyle = 'rgba(240, 235, 220, 0.25)';
  ctx.lineWidth = 0.1;
  for (const lado of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(lado * 4.25, -M);
    ctx.lineTo(lado * 4.25, M);
    ctx.stroke();
  }
  if (t.tipo === 'mayor') {
    // Los soportales: la acera bajo los arcos, en sombra.
    ctx.fillStyle = C.sombraSoportal;
    for (const lado of [-1, 1]) ctx.fillRect(lado > 0 ? 7.9 : -FACHADA, -M, 1.6, LADO);
  }
  // Ventanas en las fachadas (las encendidas se iluminan en la pasada de luz).
  for (const v of ventanas(t)) {
    ctx.fillStyle = v.luz ? C.ventanaLuz : C.ventana;
    ctx.fillRect(v.x - 0.3, v.y - 0.45, 0.6, 0.9);
  }
}

// ---------------------------------------------------------------------------
// Obstaculos y coches
// ---------------------------------------------------------------------------

function redondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function oscurecer(color: string, f: number): string {
  const n = parseInt(color.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Un coche visto desde arriba, mirando hacia `ang` (0 = arriba). */
export function dibujarCoche(ctx: CanvasRenderingContext2D, c: CocheDibujo) {
  const { largo, ancho } = COCHE;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.ang);
  ctx.globalAlpha = c.alfa;
  // Sombra suave.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  redondeado(ctx, -ancho / 2 + 0.2, -largo / 2 + 0.3, ancho, largo, 0.5);
  ctx.fill();
  // Carroceria y techo.
  ctx.fillStyle = c.color;
  redondeado(ctx, -ancho / 2, -largo / 2, ancho, largo, 0.45);
  ctx.fill();
  ctx.strokeStyle = oscurecer(c.color, 0.6);
  ctx.lineWidth = 0.08;
  ctx.stroke();
  ctx.fillStyle = C.cristal;
  redondeado(ctx, -ancho * 0.38, -largo * 0.22, ancho * 0.76, largo * 0.16, 0.12);
  ctx.fill();
  ctx.fillStyle = oscurecer(c.color, 0.75);
  ctx.fillRect(-ancho * 0.36, -largo * 0.06, ancho * 0.72, largo * 0.26);
  ctx.fillStyle = C.cristal;
  redondeado(ctx, -ancho * 0.34, largo * 0.21, ancho * 0.68, largo * 0.1, 0.1);
  ctx.fill();
  // Faros y pilotos.
  ctx.fillStyle = C.faro;
  ctx.fillRect(-ancho * 0.42, -largo / 2, ancho * 0.22, 0.18);
  ctx.fillRect(ancho * 0.2, -largo / 2, ancho * 0.22, 0.18);
  ctx.fillStyle = c.frenando ? '#ff4b3e' : C.piloto;
  ctx.fillRect(-ancho * 0.44, largo / 2 - 0.16, ancho * 0.22, 0.16);
  ctx.fillRect(ancho * 0.22, largo / 2 - 0.16, ancho * 0.22, 0.16);
  // Los golpes: abolladuras y, a partir del segundo, la luna rota.
  if (c.danos >= 1) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-ancho * 0.3, -largo * 0.38, 0.35, 0.25, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (c.danos >= 2) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(ancho * 0.32, largo * 0.3, 0.3, 0.4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 240, 255, 0.8)';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.1, -largo * 0.2);
    ctx.lineTo(0.3, -largo * 0.12);
    ctx.moveTo(-0.1, -largo * 0.2);
    ctx.lineTo(-0.45, -largo * 0.1);
    ctx.moveTo(-0.1, -largo * 0.2);
    ctx.lineTo(0.05, -largo * 0.07);
    ctx.stroke();
  }
  ctx.restore();
}

function dibujarObstaculo(ctx: CanvasRenderingContext2D, o: Obstaculo) {
  switch (o.tipo) {
    case 'edificio':
      return;
    case 'aparcado':
      dibujarCoche(ctx, { x: o.x, y: o.y, ang: o.ang, color: o.color ?? '#777', frenando: false, danos: 0, alfa: 1 });
      return;
  }
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.ang);
  switch (o.tipo) {
    case 'contenedor':
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(-o.w / 2 + 0.15, -o.h / 2 + 0.2, o.w, o.h);
      ctx.fillStyle = o.color ?? '#2f5a3a';
      redondeado(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 0.15);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(-o.w / 2, 0);
      ctx.lineTo(o.w / 2, 0);
      ctx.stroke();
      break;
    case 'bolardo':
      ctx.fillStyle = '#1e1c1a';
      ctx.beginPath();
      ctx.arc(0, 0, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b6258';
      ctx.beginPath();
      ctx.arc(-0.04, -0.04, 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mesa': {
      // La sombrilla de la terraza, vista desde arriba.
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(0.2, 0.25, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = o.color ?? '#A82C24';
      ctx.beginPath();
      ctx.arc(0, 0, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.06;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 1.3, Math.sin(a) * 1.3);
        ctx.stroke();
      }
      break;
    }
    case 'columna':
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-o.w / 2 + 0.12, -o.h / 2 + 0.12, o.w, o.h);
      ctx.fillStyle = C.piedra;
      ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
      break;
    case 'estatua':
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(-o.w / 2 + 0.3, -o.h / 2 + 0.4, o.w, o.h);
      ctx.fillStyle = C.granito;
      ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
      ctx.fillStyle = '#a9a294';
      ctx.fillRect(-o.w / 3, -o.h / 3, (o.w * 2) / 3, (o.h * 2) / 3);
      ctx.fillStyle = C.bronce;
      ctx.beginPath();
      ctx.ellipse(0, 0.1, 0.7, 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7d9e77';
      ctx.beginPath();
      ctx.arc(0, -0.25, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'arbol':
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(0.4, 0.5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.hoja;
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.hojaClara;
      for (const [x, y, r] of [
        [-0.6, -0.5, 0.8],
        [0.6, -0.2, 0.7],
        [0, 0.6, 0.7],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'farola':
      ctx.fillStyle = '#141210';
      ctx.beginPath();
      ctx.arc(0, 0, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(0, 0, 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'valla': {
      // Rayas rojas y blancas: calle cortada.
      const largo = Math.max(o.w, o.h);
      const horizontal = o.w >= o.h;
      ctx.fillStyle = '#f2ece0';
      ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
      ctx.fillStyle = '#b5281f';
      for (let k = -largo / 2; k < largo / 2; k += 1.2) {
        if (horizontal) ctx.fillRect(k, -o.h / 2, 0.6, o.h);
        else ctx.fillRect(-o.w / 2, k, o.w, 0.6);
      }
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Luces
// ---------------------------------------------------------------------------

/** El haz de los faros de un coche, recortado en la capa de oscuridad. */
function haz(ctx: CanvasRenderingContext2D, c: CocheDibujo, largoHaz: number, fuerza: number) {
  const { largo, ancho } = COCHE;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.ang);
  const g = ctx.createLinearGradient(0, -largo / 2, 0, -largo / 2 - largoHaz);
  g.addColorStop(0, `rgba(0,0,0,${fuerza})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-ancho * 0.45, -largo / 2);
  ctx.lineTo(ancho * 0.45, -largo / 2);
  ctx.lineTo(ancho * 2.6, -largo / 2 - largoHaz);
  ctx.lineTo(-ancho * 2.6, -largo / 2 - largoHaz);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function circuloLuz(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fuerza: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(0,0,0,${fuerza})`);
  g.addColorStop(0.45, `rgba(0,0,0,${fuerza * 0.6})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// El conjunto
// ---------------------------------------------------------------------------

export type Vista = { ancho: number; alto: number; ppm: number; densidad: number };

export function vistaPara(ancho: number, alto: number, densidad: number): Vista {
  return { ancho, alto, densidad, ppm: Math.min(ancho, alto) / METROS_DE_ALTO };
}

/** Si el navegador sabe desenfocar un canvas (Safari antiguo no). */
function soportaFiltro(): boolean {
  try {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return false;
    c.filter = 'blur(2px)';
    return c.filter === 'blur(2px)';
  } catch {
    return false;
  }
}

export class Lienzo {
  private escena = document.createElement('canvas');
  private luz = document.createElement('canvas');
  private readonly filtro = soportaFiltro();

  constructor(private readonly pantalla: HTMLCanvasElement) {}

  private medir(v: Vista) {
    for (const c of [this.escena, this.luz]) {
      if (c.width !== v.ancho || c.height !== v.alto) {
        c.width = v.ancho;
        c.height = v.alto;
      }
    }
  }

  /** Coloca el lienzo en el mundo: el coche abajo y la camara girada con el. */
  private alMundo(ctx: CanvasRenderingContext2D, v: Vista, f: Fotograma, balanceo: Visuales['balanceo']) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(v.ancho * ANCLA.x + f.temblor.x * v.densidad, v.alto * ANCLA.y + f.temblor.y * v.densidad);
    ctx.scale(v.ppm, v.ppm);
    ctx.rotate(-(f.cam.ang + balanceo.ang));
    ctx.translate(-(f.cam.x + balanceo.x), -(f.cam.y + balanceo.y));
  }

  dibujar(f: Fotograma, v: Vista, efectos: Visuales) {
    this.medir(v);
    const ctx = this.escena.getContext('2d');
    const luz = this.luz.getContext('2d');
    const pantalla = this.pantalla.getContext('2d');
    if (!ctx || !luz || !pantalla) return;

    const radio = Math.hypot(v.ancho, v.alto) / v.ppm;
    const cerca = (p: { x: number; y: number }, margen: number) =>
      Math.abs(p.x - f.cam.x) < radio + margen && Math.abs(p.y - f.cam.y) < radio + margen;
    const tramos = f.ciudad.tramos.filter((t) => cerca(t.centro, LADO));

    // 1. El mundo.
    this.alMundo(ctx, v, f, efectos.balanceo);
    ctx.fillStyle = patron(ctx, 'tejas', 4, tejas);
    ctx.fillRect(f.cam.x - radio * 1.5, f.cam.y - radio * 1.5, radio * 3, radio * 3);
    for (const t of tramos) {
      ctx.save();
      ctx.translate(t.centro.x, t.centro.y);
      ctx.rotate(t.rot);
      dibujarSuelo(ctx, t);
      ctx.restore();
    }
    // Marcas de derrape, sobre el asfalto.
    ctx.strokeStyle = 'rgba(10, 8, 6, 0.55)';
    ctx.lineWidth = 0.28;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const m of f.marcas) {
      if (!cerca({ x: m.x1, y: m.y1 }, 5)) continue;
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
    }
    ctx.stroke();
    for (const t of tramos) {
      ctx.save();
      ctx.translate(t.centro.x, t.centro.y);
      ctx.rotate(t.rot);
      for (const o of t.locales) dibujarObstaculo(ctx, o);
      ctx.restore();
    }
    dibujarObstaculo(ctx, f.ciudad.vallaTrasera());
    for (const c of f.trafico) if (cerca(c, 10)) dibujarCoche(ctx, c);
    dibujarCoche(ctx, f.jugador);
    // Humo y polvo encima de los coches; las chispas, sumando luz.
    for (const p of f.particulas) {
      if (p.tipo === 'chispa') continue;
      const vida = p.vida / p.max;
      ctx.fillStyle = p.tipo === 'humo' ? `rgba(70, 70, 75, ${0.45 * vida})` : `rgba(160, 150, 140, ${0.3 * vida})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.tam, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. La noche: oscuridad con las luces recortadas.
    luz.setTransform(1, 0, 0, 1, 0, 0);
    luz.globalCompositeOperation = 'source-over';
    luz.clearRect(0, 0, v.ancho, v.alto);
    luz.fillStyle = C.noche;
    luz.fillRect(0, 0, v.ancho, v.alto);
    luz.globalCompositeOperation = 'destination-out';
    this.alMundo(luz, v, f, efectos.balanceo);
    for (const t of tramos) {
      luz.save();
      luz.translate(t.centro.x, t.centro.y);
      luz.rotate(t.rot);
      for (const fl of t.farolas) circuloLuz(luz, fl.x, fl.y, 12, 0.95);
      for (const w of ventanas(t)) if (w.luz) circuloLuz(luz, w.x, w.y, 1.6, 0.8);
      luz.restore();
    }
    circuloLuz(luz, f.jugador.x, f.jugador.y, 7, 0.5);
    haz(luz, f.jugador, 18, 0.9);
    for (const c of f.trafico) if (cerca(c, 20)) haz(luz, c, 13, 0.75);
    luz.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.luz, 0, 0);

    // 3. Halos que suman luz: farolas, pilotos y chispas.
    ctx.globalCompositeOperation = 'lighter';
    this.alMundo(ctx, v, f, efectos.balanceo);
    for (const t of tramos) {
      ctx.save();
      ctx.translate(t.centro.x, t.centro.y);
      ctx.rotate(t.rot);
      for (const fl of t.farolas) {
        const g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, 3);
        g.addColorStop(0, 'rgba(255, 210, 120, 0.45)');
        g.addColorStop(1, 'rgba(255, 210, 120, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(fl.x, fl.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const c of [...f.trafico, f.jugador]) {
      if (!cerca(c, 10)) continue;
      const atras = { x: c.x - Math.sin(c.ang) * COCHE.largo * 0.55, y: c.y + Math.cos(c.ang) * COCHE.largo * 0.55 };
      const g = ctx.createRadialGradient(atras.x, atras.y, 0, atras.x, atras.y, c.frenando ? 2.4 : 1.4);
      g.addColorStop(0, `rgba(255, 40, 30, ${c.frenando ? 0.55 : 0.3})`);
      g.addColorStop(1, 'rgba(255, 40, 30, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(atras.x, atras.y, c.frenando ? 2.4 : 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of f.particulas) {
      if (p.tipo !== 'chispa') continue;
      const vida = p.vida / p.max;
      ctx.strokeStyle = `rgba(255, ${170 + Math.round(70 * vida)}, 60, ${vida})`;
      ctx.lineWidth = p.tam;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 4. A la pantalla, con los efectos de la borrachera.
    componer(pantalla, this.escena, v, efectos, this.filtro);
  }
}

function componer(p: CanvasRenderingContext2D, escena: HTMLCanvasElement, v: Vista, e: Visuales, filtro: boolean) {
  p.setTransform(1, 0, 0, 1, 0, 0);
  p.globalAlpha = 1;
  p.fillStyle = '#000';
  p.fillRect(0, 0, v.ancho, v.alto);
  const desenfoque = e.borroso * v.densidad;
  if (desenfoque > 0.4 && filtro) {
    p.filter = `blur(${desenfoque.toFixed(1)}px)`;
    p.drawImage(escena, 0, 0);
    p.filter = 'none';
  } else if (desenfoque > 0.4) {
    // Sin filtro (iPhone antiguo): varias copias un poco movidas se parecen bastante.
    p.drawImage(escena, 0, 0);
    p.globalAlpha = 0.3;
    for (const [dx, dy] of [
      [desenfoque, 0],
      [-desenfoque, 0],
      [0, desenfoque],
      [0, -desenfoque],
    ]) {
      p.drawImage(escena, dx * 0.7, dy * 0.7);
    }
    p.globalAlpha = 1;
  } else {
    p.drawImage(escena, 0, 0);
  }
  // Vision doble: la misma escena otra vez, desplazada y medio transparente.
  if (Math.hypot(e.doble.x, e.doble.y) > 0.5) {
    p.globalAlpha = 0.4;
    p.drawImage(escena, e.doble.x * v.densidad, e.doble.y * v.densidad);
    p.globalAlpha = 1;
  }
  // Efecto tunel: los bordes se oscurecen.
  if (e.tunel > 0.02) {
    const r = Math.hypot(v.ancho, v.alto) / 2;
    const g = p.createRadialGradient(v.ancho / 2, v.alto / 2, r * 0.35, v.ancho / 2, v.alto / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${e.tunel})`);
    p.fillStyle = g;
    p.fillRect(0, 0, v.ancho, v.alto);
  }
}

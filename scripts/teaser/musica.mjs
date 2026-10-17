/**
 * La musica del teaser, sintetizada aqui mismo: sin pistas de terceros no hay
 * derechos que pagar ni un video silenciado por Instagram. Es determinista
 * (ruido con semilla), asi que dos renders dan el mismo WAV byte a byte.
 *
 * Estructura (120 BPM, sigue a guion.mjs):
 *   0-4 s    intro oscura: zumbido, burbujas, golpes de sello y subida
 *   4-9 s    el "drop": bombo a negras, palmas en 2 y 4, bajo La m-Fa-Do-Sol
 *   9-10 s   rafaga: un golpe por palabra y subida corta
 *   10-15 s  cierre: impacto, acorde largo y cola
 */
import { BPM, DROP, DURACION, GOLPE, golpesSonoros } from './guion.mjs';

export const FRECUENCIA = 48000;

/** PRNG con semilla (mulberry32): el ruido sale igual en cada render. */
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nota = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Filtro biquad (RBJ) sobre un array, en el sitio. */
function biquad(x, tipo, f, q = 0.707) {
  const w = (2 * Math.PI * f) / FRECUENCIA;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  let b0, b1, b2;
  if (tipo === 'lp') [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  else if (tipo === 'hp') [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else [b0, b1, b2] = [al, 0, -al]; // 'bp'
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/** Suma `fuente` en `destino` a partir del segundo t, con ganancia y paneo. */
function mezclar(L, R, fuente, t, g = 1, pan = 0) {
  const i0 = Math.round(t * FRECUENCIA);
  const gl = g * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const gr = g * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  for (let i = 0; i < fuente.length; i++) {
    const j = i0 + i;
    if (j < 0 || j >= L.length) continue;
    L[j] += fuente[i] * gl;
    R[j] += fuente[i] * gr;
  }
}

const muestras = (s) => Math.round(s * FRECUENCIA);

function bombo(fuerza = 1) {
  const n = muestras(0.45);
  const x = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / FRECUENCIA;
    const f = 45 + 110 * Math.exp(-t * 28);
    fase += (2 * Math.PI * f) / FRECUENCIA;
    x[i] = Math.sin(fase) * Math.exp(-t * 7) * fuerza;
    if (i < 90) x[i] += (1 - i / 90) * 0.3 * fuerza; // el "click" del parche
  }
  return x;
}

function palmas(rnd) {
  const n = muestras(0.3);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / FRECUENCIA;
    // tres palmadas muy juntas y una cola: suena a palmas, no a un ruido
    const env = [0, 0.011, 0.022].reduce((s, d) => s + (t >= d ? Math.exp(-(t - d) * 180) : 0), 0)
      + (t >= 0.03 ? 0.5 * Math.exp(-(t - 0.03) * 22) : 0);
    x[i] = (rnd() * 2 - 1) * env;
  }
  return biquad(x, 'bp', 1400, 0.9);
}

function charles(rnd, abierto) {
  const n = muestras(abierto ? 0.22 : 0.06);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (rnd() * 2 - 1) * Math.exp(-(i / FRECUENCIA) * (abierto ? 14 : 70));
  return biquad(x, 'hp', 7500, 0.8);
}

/** Golpe de sello: un "tum" seco de madera sobre papel. */
function sello(rnd) {
  const n = muestras(0.35);
  const x = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / FRECUENCIA;
    fase += (2 * Math.PI * (70 + 90 * Math.exp(-t * 40))) / FRECUENCIA;
    x[i] = Math.sin(fase) * Math.exp(-t * 14) * 0.9 + (rnd() * 2 - 1) * Math.exp(-t * 60) * 0.5;
  }
  return biquad(x, 'lp', 2500);
}

/** Impacto de cine: bombo grave largo + ruido + cola. */
function impacto(rnd) {
  const n = muestras(2.2);
  const x = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / FRECUENCIA;
    fase += (2 * Math.PI * (32 + 80 * Math.exp(-t * 9))) / FRECUENCIA;
    x[i] = Math.sin(fase) * Math.exp(-t * 2.2) * 1.1 + (rnd() * 2 - 1) * Math.exp(-t * 5) * 0.35;
  }
  return biquad(x, 'lp', 3000);
}

/** Subida: ruido que se abre y sube de volumen hasta el final. */
function subida(rnd, dur) {
  const n = muestras(dur);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (rnd() * 2 - 1) * (i / n) ** 2;
  // filtro que se abre: por bloques, para no recalcular coeficientes por muestra
  const bloques = 24;
  const salida = new Float32Array(n);
  for (let b = 0; b < bloques; b++) {
    const a = Math.floor((b * n) / bloques), z = Math.floor(((b + 1) * n) / bloques);
    const trozo = biquad(x.slice(a, z), 'bp', 400 + 7000 * (b / bloques) ** 2, 1.2);
    salida.set(trozo, a);
  }
  return salida;
}

/** Barrido de corte ("whoosh"). */
function barrido(rnd) {
  const n = muestras(0.35);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    x[i] = (rnd() * 2 - 1) * Math.sin(Math.PI * p) ** 2;
  }
  return biquad(x, 'bp', 2200, 0.6);
}

/** Chispa del "match": dos notas brillantes hacia arriba. */
function chispa() {
  const n = muestras(0.6);
  const x = new Float32Array(n);
  for (const [d, m] of [[0, 81], [0.08, 88]]) {
    for (let i = muestras(d); i < n; i++) {
      const t = i / FRECUENCIA - d;
      x[i] += (Math.sin(2 * Math.PI * nota(m) * t) + 0.3 * Math.sin(4 * Math.PI * nota(m) * t)) * Math.exp(-t * 7) * 0.35;
    }
  }
  return x;
}

/** Diente de sierra con poco aliasing (polyBLEP). */
function sierra(f, n, desafino = 0) {
  const x = new Float32Array(n);
  let p = 0;
  const dp = (f * 2 ** (desafino / 1200)) / FRECUENCIA;
  for (let i = 0; i < n; i++) {
    let v = 2 * p - 1;
    if (p < dp) { const q = p / dp; v -= q + q - q * q - 1; }
    else if (p > 1 - dp) { const q = (p - 1) / dp; v -= q * q + q + q + 1; }
    x[i] = v;
    p += dp; if (p >= 1) p -= 1;
  }
  return x;
}

/** Acorde de colchon: tres sierras desafinadas por nota, filtradas. */
function colchon(notas, dur, corte, ataque = 0.4) {
  const n = muestras(dur);
  const x = new Float32Array(n);
  for (const m of notas) for (const d of [-9, 0, 8]) {
    const s = sierra(nota(m), n, d);
    for (let i = 0; i < n; i++) x[i] += s[i] * 0.06;
  }
  biquad(x, 'lp', corte, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / FRECUENCIA;
    x[i] *= Math.min(1, t / ataque) * Math.min(1, (dur - t) / 0.5);
  }
  return x;
}

function bajo(midi, dur) {
  const n = muestras(dur);
  const x = sierra(nota(midi), n);
  const sub = new Float32Array(n);
  for (let i = 0; i < n; i++) sub[i] = Math.sin((2 * Math.PI * nota(midi) * i) / FRECUENCIA);
  for (let i = 0; i < n; i++) x[i] = x[i] * 0.45 + sub[i] * 0.7;
  biquad(x, 'lp', 520, 1.1);
  for (let i = 0; i < n; i++) {
    const t = i / FRECUENCIA;
    x[i] *= Math.min(1, t / 0.005) * Math.exp(-t * 3) * Math.min(1, (dur - t) / 0.01);
  }
  return x;
}

/** Reverb sencilla (Schroeder): da aire a palmas y colchon sin otra libreria. */
function reverb(x, mezcla = 0.25) {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round((d * FRECUENCIA) / 44100));
  const salida = new Float32Array(x.length);
  for (const d of combs) {
    const buf = new Float32Array(d);
    let k = 0;
    for (let i = 0; i < x.length; i++) {
      const y = buf[k];
      buf[k] = x[i] + y * 0.8;
      salida[i] += y * 0.25;
      k = (k + 1) % d;
    }
  }
  for (const d of [225, 556].map((v) => Math.round((v * FRECUENCIA) / 44100))) {
    const buf = new Float32Array(d);
    let k = 0;
    for (let i = 0; i < salida.length; i++) {
      const b = buf[k];
      const y = -salida[i] + b;
      buf[k] = salida[i] + b * 0.5;
      salida[i] = y;
      k = (k + 1) % d;
    }
  }
  for (let i = 0; i < x.length; i++) x[i] = x[i] * (1 - mezcla) + salida[i] * mezcla;
  return x;
}

/**
 * Genera la pista entera. Devuelve { L, R } en Float32Array, ya limitada a
 * -1 dBFS de pico.
 */
export function generarMusica() {
  const n = muestras(DURACION);
  const L = new Float32Array(n), R = new Float32Array(n);
  const rnd = azar(2026);
  const seco = { L: new Float32Array(n), R: new Float32Array(n) };   // bombo y bajo: sin reverb
  const humedo = { L: new Float32Array(n), R: new Float32Array(n) }; // palmas, colchon, efectos

  // --- Intro (0-4 s): colchon oscuro en La menor y burbujas
  mezclar(humedo.L, humedo.R, colchon([45, 52, 57, 60], 4.0, 700, 1.2), 0, 0.9);
  for (let k = 0; k < 40; k++) { // burbujas: senos cortos que suben
    const t0 = 0.1 + rnd() * 3.6;
    const f0 = 900 + rnd() * 1800;
    const m = muestras(0.05);
    const b = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const t = i / FRECUENCIA;
      b[i] = Math.sin(2 * Math.PI * f0 * (1 + t * 8) * t) * Math.exp(-t * 70) * 0.08;
    }
    mezclar(humedo.L, humedo.R, b, t0, 1, rnd() * 1.6 - 0.8);
  }
  // latido grave en la intro, a blancas
  for (let t = 0.5; t < 3.0; t += GOLPE * 2) mezclar(seco.L, seco.R, bombo(0.55), t);
  mezclar(humedo.L, humedo.R, subida(rnd, 1.0), 3.0, 1.0);
  // redoble que acelera hacia el drop
  for (let t = 3.0, paso = GOLPE / 2; t < 3.95; t += paso, paso = Math.max(GOLPE / 8, paso * 0.8)) {
    mezclar(humedo.L, humedo.R, palmas(rnd), t, 0.25 + (t - 3) * 0.5);
  }

  // --- Drop (4-9 s; el ultimo segundo del tramo es la rafaga)
  const progresion = [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]]];
  const finBombo = DROP.fin - 1;
  for (let golpe = 0; golpe < (finBombo - DROP.inicio) / GOLPE; golpe++) {
    const t = DROP.inicio + golpe * GOLPE;
    mezclar(seco.L, seco.R, bombo(1), t);
    if (golpe % 2 === 1) mezclar(humedo.L, humedo.R, palmas(rnd), t, 0.55);
    mezclar(humedo.L, humedo.R, charles(rnd, golpe % 4 === 3), t + GOLPE / 2, 0.22, 0.3);
    mezclar(humedo.L, humedo.R, charles(rnd, false), t + GOLPE / 4, 0.08, -0.3);
    // bajo a corcheas, entre bombos (eso es el "bombeo")
    const [raiz] = progresion[Math.floor(golpe / 4) % 4];
    mezclar(seco.L, seco.R, bajo(raiz, GOLPE / 2 - 0.01), t + GOLPE / 2, 0.55);
  }
  for (let compas = 0; DROP.inicio + compas * 2 < DROP.fin; compas++) {
    const [, acorde] = progresion[compas % 4];
    const dur = Math.min(2, DROP.fin - (DROP.inicio + compas * 2));
    mezclar(humedo.L, humedo.R, colchon(acorde, dur, 1800, 0.05), DROP.inicio + compas * 2, 0.45);
  }

  // --- Rafaga (ultimo segundo del drop): subida corta hacia el cierre
  mezclar(humedo.L, humedo.R, subida(rnd, 1.0), finBombo, 0.55);

  // --- Cierre (del impacto al final): acorde largo y un ultimo golpe
  const cierre = DROP.fin;
  mezclar(humedo.L, humedo.R, colchon([45, 57, 60, 64, 69], DURACION - cierre, 2600, 0.02), cierre, 0.7);
  mezclar(seco.L, seco.R, bombo(1), cierre + 2.0);
  mezclar(humedo.L, humedo.R, palmas(rnd), cierre + 2.0, 0.4);

  // --- Efectos atados al guion (sellos, cortes, chispa, palabras, impactos)
  for (const g of golpesSonoros()) {
    if (g.tipo === 'sello') mezclar(seco.L, seco.R, sello(rnd), g.t, 0.9);
    if (g.tipo === 'impacto') mezclar(seco.L, seco.R, impacto(rnd), g.t, 0.9);
    if (g.tipo === 'corte') mezclar(humedo.L, humedo.R, barrido(rnd), g.t - 0.17, 0.35, rnd() > 0.5 ? 0.5 : -0.5);
    if (g.tipo === 'chispa') mezclar(humedo.L, humedo.R, chispa(), g.t, 0.8);
    if (g.tipo === 'palabra') {
      mezclar(seco.L, seco.R, bombo(0.9), g.t);
      mezclar(humedo.L, humedo.R, palmas(rnd), g.t, 0.45);
    }
  }

  reverb(humedo.L, 0.22);
  reverb(humedo.R, 0.24);
  for (let i = 0; i < n; i++) {
    L[i] = seco.L[i] + humedo.L[i];
    R[i] = seco.R[i] + humedo.R[i];
  }
  // fundido final para que no corte en seco
  const fin = muestras(0.6);
  for (let i = 0; i < fin; i++) { const g = i / fin; L[n - 1 - i] *= g; R[n - 1 - i] *= g; }

  // limitador suave + normalizado a -1 dBFS
  for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); }
  let pico = 0;
  for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
  const objetivo = 10 ** (-1 / 20);
  const g = pico > 0 ? objetivo / pico : 1;
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  return { L, R };
}

/** WAV PCM de 16 bits estereo. */
export function aWav({ L, R }) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(FRECUENCIA, 24); buf.writeUInt32LE(FRECUENCIA * 4, 28); buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  return buf;
}

export { BPM };

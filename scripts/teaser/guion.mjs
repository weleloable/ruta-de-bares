/**
 * El guion del teaser: que se ve, cuando y que trozo de la grabacion de la app
 * va dentro del movil. Solo datos y funciones puras, sin importaciones: lo leen
 * el renderizador (en Node), la escena (en el navegador, via JSON) y los tests.
 *
 * Todo cuadra con el pulso: 120 BPM, un golpe cada 0,5 s. Los cortes caen en
 * golpe a proposito; un corte medio golpe tarde se nota aunque no se sepa por que.
 */

export const FPS = 30;
export const BPM = 120;
export const GOLPE = 60 / BPM; // 0,5 s
export const ANCHO = 1080;
export const ALTO = 1920;

/**
 * Los planos de la app. `desde`/`hasta` son segundos de la grabacion fuente
 * (el trailer de `scripts/videos`, `videos/00-trailer.mp4`, 71,4 s). Si se
 * regraba, estos tiempos se mueven: `node scripts/teaser/render.mjs --hoja`
 * saca una hoja de contactos con la hora de cada fotograma para reajustarlos.
 * Un plano puede tener varios tramos seguidos (`tramos`) para saltarse lo que
 * no sirve (el movil inclinado de La Cana Perfecta no se puede recortar).
 */
export const PLANOS = {
  sellar: { tramos: [[12.65, 13.65]] }, // el sello aparece en la app a 13,4 s = escena 4,75
  mapa: { tramos: [[19.6, 20.6]] },
  gente: { tramos: [[25.5, 26.5]] },   // antes de 25,4 La Caña sale cargando
  match: { tramos: [[30.6, 31.6]] },   // "Os habéis dado me gusta" a 31,1 s = escena 7,5
  cana: { tramos: [[50.9, 51.4], [54.1, 54.6]] },
};

/** Duracion total (s) de los tramos de un plano. */
export function duracionPlano(plano) {
  return plano.tramos.reduce((s, [a, b]) => s + (b - a), 0);
}

/**
 * Las escenas, en orden y sin huecos (15 s: el equipo pidio algo corto, sin
 * entrar en detalles porque la app aun cambia, y que acabe en "Proximamente"). `tipo` decide como se pinta (escena.js).
 * `plano` (si lo hay) se reproduce desde el inicio de la escena; si la escena
 * dura mas que el plano, se congela el ultimo fotograma.
 */
export const ESCENAS = [
  { id: 'negro', tipo: 'negro', inicio: 0, fin: 0.5 },
  { id: 'diez', tipo: 'diez', inicio: 0.5, fin: 1.5,
    texto: ['10', 'EDICIONES'] },
  { id: 'papel', tipo: 'papel', inicio: 1.5, fin: 3.0,
    texto: ['DE SELLOS', 'EN PAPEL'], sellos: [1.5, 2.0, 2.5] },
  { id: 'cambio', tipo: 'cambio', inicio: 3.0, fin: 4.0,
    texto: ['ESTE AÑO', 'LA RUTA', 'CAMBIA'] },
  // Destellos: la app esta cambiando mucho, asi que se ENSEÑA sin EXPLICAR.
  // Un segundo por plano, el movil girado y con grano, y una sola palabra: da
  // ganas sin prometer pantallas que igual cambian antes del dia de la ruta.
  { id: 'sellar', tipo: 'movil', inicio: 4.0, fin: 5.0, plano: 'sellar',
    palabra: 'SELLA.', sello: 4.75, giro: -1 },
  { id: 'mapa', tipo: 'movil', inicio: 5.0, fin: 6.0, plano: 'mapa',
    palabra: 'EXPLORA.', giro: 1 },
  { id: 'gente', tipo: 'movil', inicio: 6.0, fin: 7.0, plano: 'gente',
    palabra: 'CONOCE.', giro: -1 },
  { id: 'match', tipo: 'movil', inicio: 7.0, fin: 8.0, plano: 'match',
    palabra: 'BRINDA.', chispa: 7.5, giro: 1 },
  { id: 'cana', tipo: 'movil', inicio: 8.0, fin: 9.0, plano: 'cana',
    palabra: 'JUEGA.', giro: -1 },
  { id: 'rafaga', tipo: 'rafaga', inicio: 9.0, fin: 10.0,
    palabras: ['Y MUCHO', 'MÁS...'] },
  { id: 'cierre', tipo: 'cierre', inicio: 10.0, fin: 15.0,
    lema: ['La ruta de siempre,', 'ahora en tu móvil.'],
    titular: ['PRÓXIMAMENTE', 'DISPONIBLE'],
    usuario: '@rutadebaresoficial' },
];

/** Donde empieza y acaba el tramo con bombo (lo usa la musica). */
export const DROP = { inicio: 4.0, fin: 10.0 };

export const DURACION = ESCENAS[ESCENAS.length - 1].fin;
export const FOTOGRAMAS = Math.round(DURACION * FPS);

/** La escena que se ve en el instante t (el fin es exclusivo). */
export function escenaEn(t) {
  for (const e of ESCENAS) if (t >= e.inicio && t < e.fin) return e;
  return ESCENAS[ESCENAS.length - 1];
}

/**
 * Que segundo de la grabacion fuente toca enseñar `dt` segundos despues de
 * empezar un plano. Recorre los tramos en orden y congela el final.
 */
export function tiempoFuente(plano, dt) {
  let resto = Math.max(0, dt);
  for (const [a, b] of plano.tramos) {
    if (resto < b - a) return a + resto;
    resto -= b - a;
  }
  const ultimo = plano.tramos[plano.tramos.length - 1];
  return ultimo[1] - 1 / FPS / 2;
}

/**
 * Los fotogramas de la fuente que hay que extraer para un plano: uno por
 * fotograma de salida, numerados desde 0. Devuelve los segundos de la fuente.
 */
export function fotogramasPlano(plano) {
  const n = Math.round(duracionPlano(plano) * FPS);
  return Array.from({ length: n }, (_, i) => tiempoFuente(plano, (i + 0.5) / FPS));
}

/** Los momentos en que hay golpe fuerte de sonido (sellos, cortes, chispa). */
export function golpesSonoros() {
  const g = [];
  for (const e of ESCENAS) {
    if (e.tipo === 'diez') g.push({ t: e.inicio, tipo: 'impacto' });
    if (e.sellos) for (const s of e.sellos) g.push({ t: s, tipo: 'sello' });
    if (e.sello) g.push({ t: e.sello, tipo: 'sello' });
    if (e.chispa) g.push({ t: e.chispa, tipo: 'chispa' });
    if (e.tipo === 'movil' && e.inicio > 4) g.push({ t: e.inicio, tipo: 'corte' });
    if (e.tipo === 'rafaga') e.palabras.forEach((_, i) =>
      g.push({ t: e.inicio + (i * (e.fin - e.inicio)) / e.palabras.length, tipo: 'palabra' }));
    if (e.tipo === 'cierre') g.push({ t: e.inicio, tipo: 'impacto' });
  }
  return g.sort((a, b) => a.t - b.t);
}

/**
 * Reglas de La Conga Cervecera, sin nada de pantalla: el componente solo llama a
 * estas funciones y dibuja lo que devuelven. Todas son puras (el azar entra por
 * parametro) para poder probarlas con partidas fijas.
 */

export type Mapa = {
  id: string;
  nombre: string;
  /** Todas las filas miden lo mismo. */
  filas: readonly string[];
};

export function ancho(mapa: Mapa): number {
  return mapa.filas[0]?.length ?? 0;
}

export function alto(mapa: Mapa): number {
  return mapa.filas.length;
}

/** Fuera del mapa cuenta como muro. */
export function esSolido(mapa: Mapa, x: number, y: number): boolean {
  const c = mapa.filas[y]?.[x];
  return c === undefined || (c !== '.' && c !== 'P');
}

export function salida(mapa: Mapa): { x: number; y: number } {
  for (let y = 0; y < mapa.filas.length; y++) {
    const x = mapa.filas[y].indexOf('P');
    if (x >= 0) return { x, y };
  }
  throw new Error(`El mapa ${mapa.id} no tiene salida (P).`);
}

export type Pos = { x: number; y: number };
export type Dir = 'arriba' | 'abajo' | 'izquierda' | 'derecha';
export type Azar = () => number;
export type TipoItem = 'jarra' | 'tapa' | 'dorada';
export type Item = { tipo: TipoItem; pos: Pos; /** Segundos de juego en que desaparece; null = no caduca. */ caduca: number | null };
export type Causa = 'muro' | 'conga' | 'completo';

export type Estado = {
  /** Cabeza primero. */
  cuerpo: Pos[];
  /** Aspecto de cada amigo: `amigos[i]` es el de `cuerpo[i + 1]`. */
  amigos: number[];
  dir: Dir;
  /** Giros pedidos y aun no aplicados (el buffer). */
  cola: Dir[];
  items: Item[];
  puntos: number;
  /** Jarras recogidas (normales y doradas): lo que acelera la partida. */
  jarras: number;
  /** Segundos de juego, sin contar las pausas. */
  tiempo: number;
  /** Hasta que segundo de juego valen doble los puntos. */
  dobleHasta: number;
  vivo: boolean;
  causa: Causa | null;
};

export const VECTOR: Record<Dir, Pos> = {
  arriba: { x: 0, y: -1 },
  abajo: { x: 0, y: 1 },
  izquierda: { x: -1, y: 0 },
  derecha: { x: 1, y: 0 },
};
export const OPUESTA: Record<Dir, Dir> = {
  arriba: 'abajo',
  abajo: 'arriba',
  izquierda: 'derecha',
  derecha: 'izquierda',
};

export const PUNTOS_JARRA = 10;
export const PUNTOS_TAPA = 25;
/** Cuanto dura el "doble" de la jarra dorada. */
export const DURACION_DOBLE = 5;
export const CADUCA_TAPA = 6;
export const CADUCA_DORADA = 8;
/** Probabilidad, tras cada jarra, de que salga una tapa / una jarra dorada. */
export const PROB_TAPA = 0.35;
export const PROB_DORADA = 0.12;
/** Giros que se guardan: con dos basta para un deslizamiento rapido sin acumular mandados viejos. */
export const MAX_COLA = 2;
/** Cuantos aspectos de amigo hay dibujados (ver sprites.ts). */
export const VARIANTES_AMIGO = 6;

/**
 * Segundos entre pasos. Empieza tranquilo (0,4 s por casilla) y baja un 5 % por
 * jarra hasta el minimo, al que se llega hacia la jarra 29: partidas de 1-2 minutos.
 */
export const INTERVALO_INICIAL = 0.4;
export const INTERVALO_MINIMO = 0.09;
export const FACTOR_VELOCIDAD = 0.95;

/**
 * Lo maximo que acepta el ranking de la ruta (0039). Espejo del tope del
 * servidor: un test comprueba que ningun mapa permite pasarse de aqui.
 */
export const PUNTUACION_MAXIMA = 15000;

export function intervalo(jarras: number): number {
  return Math.max(INTERVALO_MINIMO, INTERVALO_INICIAL * FACTOR_VELOCIDAD ** Math.max(jarras, 0));
}

const mismo = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

export function multiplicador(e: Estado): 1 | 2 {
  return e.tiempo < e.dobleHasta ? 2 : 1;
}

function celdasLibres(mapa: Mapa, e: Pick<Estado, 'cuerpo' | 'items'>): Pos[] {
  const libres: Pos[] = [];
  for (let y = 0; y < alto(mapa); y++) {
    for (let x = 0; x < ancho(mapa); x++) {
      const p = { x, y };
      if (esSolido(mapa, x, y)) continue;
      if (e.cuerpo.some((s) => mismo(s, p)) || e.items.some((i) => mismo(i.pos, p))) continue;
      libres.push(p);
    }
  }
  return libres;
}

/** Pone un objeto en una celda libre al azar. Devuelve null si no queda ninguna. */
function colocar(mapa: Mapa, e: Estado, tipo: TipoItem, azar: Azar): Estado | null {
  const libres = celdasLibres(mapa, e);
  if (libres.length === 0) return null;
  const pos = libres[Math.min(Math.floor(azar() * libres.length), libres.length - 1)];
  const caduca = tipo === 'tapa' ? e.tiempo + CADUCA_TAPA : tipo === 'dorada' ? e.tiempo + CADUCA_DORADA : null;
  return { ...e, items: [...e.items, { tipo, pos, caduca }] };
}

export function crearEstado(mapa: Mapa, azar: Azar): Estado {
  const base: Estado = {
    cuerpo: [salida(mapa)],
    amigos: [],
    dir: 'arriba',
    cola: [],
    items: [],
    puntos: 0,
    jarras: 0,
    tiempo: 0,
    dobleHasta: 0,
    vivo: true,
    causa: null,
  };
  return colocar(mapa, base, 'jarra', azar) ?? base;
}

/**
 * Pide un giro. Se compara con el ULTIMO pendiente (no con la direccion actual)
 * para que dos deslizamientos seguidos, arriba-izquierda y luego abajo, se
 * respeten los dos, y para que nunca se pueda dar la vuelta de golpe.
 */
export function girar(e: Estado, dir: Dir): Estado {
  if (!e.vivo || e.cola.length >= MAX_COLA) return e;
  const ref = e.cola.length > 0 ? e.cola[e.cola.length - 1] : e.dir;
  if (dir === ref || dir === OPUESTA[ref]) return e;
  return { ...e, cola: [...e.cola, dir] };
}

/** Hace pasar el reloj de juego y retira lo que ha caducado. */
export function pasarTiempo(e: Estado, dt: number): Estado {
  if (!e.vivo || dt <= 0) return e;
  const tiempo = e.tiempo + dt;
  const items = e.items.filter((i) => i.caduca === null || i.caduca > tiempo);
  return { ...e, tiempo, items: items.length === e.items.length ? e.items : items };
}

/** Un paso de la conga. */
export function avanzar(e: Estado, mapa: Mapa, azar: Azar): Estado {
  if (!e.vivo) return e;
  const cola = [...e.cola];
  const dir = cola.shift() ?? e.dir;
  const v = VECTOR[dir];
  const cabeza = e.cuerpo[0];
  const nueva = { x: cabeza.x + v.x, y: cabeza.y + v.y };

  if (esSolido(mapa, nueva.x, nueva.y)) return { ...e, dir, cola, vivo: false, causa: 'muro' };

  const i = e.items.findIndex((it) => mismo(it.pos, nueva));
  const item = i >= 0 ? e.items[i] : null;
  const crece = item?.tipo === 'jarra' || item?.tipo === 'dorada';

  // Si no crece, la cola se retira este mismo paso: la cabeza puede entrar en su casilla.
  const resto = crece ? e.cuerpo : e.cuerpo.slice(0, -1);
  if (resto.some((s) => mismo(s, nueva))) return { ...e, dir, cola, vivo: false, causa: 'conga' };

  let siguiente: Estado = {
    ...e,
    dir,
    cola,
    cuerpo: [nueva, ...resto],
    items: item ? e.items.filter((_, k) => k !== i) : e.items,
  };

  if (item) {
    const base = item.tipo === 'tapa' ? PUNTOS_TAPA : PUNTOS_JARRA;
    siguiente = { ...siguiente, puntos: siguiente.puntos + base * multiplicador(e) };
  }
  if (crece) {
    const aspecto = Math.min(Math.floor(azar() * VARIANTES_AMIGO), VARIANTES_AMIGO - 1);
    siguiente = { ...siguiente, amigos: [...e.amigos, aspecto], jarras: e.jarras + 1 };
    if (item?.tipo === 'dorada') siguiente = { ...siguiente, dobleHasta: e.tiempo + DURACION_DOBLE };
  }

  // Siempre hay una jarra normal en el mapa; las tapas y la dorada son extras.
  if (!siguiente.items.some((it) => it.tipo === 'jarra')) {
    const con = colocar(mapa, siguiente, 'jarra', azar);
    if (!con) return { ...siguiente, vivo: false, causa: 'completo' };
    siguiente = con;
  }
  if (crece) {
    if (!siguiente.items.some((it) => it.tipo === 'tapa') && azar() < PROB_TAPA) {
      siguiente = colocar(mapa, siguiente, 'tapa', azar) ?? siguiente;
    }
    if (!siguiente.items.some((it) => it.tipo === 'dorada') && azar() < PROB_DORADA) {
      siguiente = colocar(mapa, siguiente, 'dorada', azar) ?? siguiente;
    }
  }
  return siguiente;
}

export function textoAmigos(n: number): string {
  return n === 1 ? '1 amigo' : `${n} amigos`;
}

/** El mensaje de la pantalla final, segun a cuanta gente se ha liado. */
export function mensajeFinal(amigos: number): string {
  if (amigos <= 0) return 'Conga en solitario: nadie se ha animado... todavía.';
  if (amigos >= 25) return 'Conga legendaria por la Calle Mayor';
  if (amigos >= 14) return `Has reclutado ${textoAmigos(amigos)} para la ruta`;
  if (amigos >= 6) return `Ya se nota la conga: ${textoAmigos(amigos)} y llegáis a la Plaza de Cervantes`;
  return `Has reclutado ${textoAmigos(amigos)} para la ruta`;
}

/**
 * Barman Express: logica pura, sin React ni red (los tests la cargan tal cual,
 * por eso no importa nada en tiempo de ejecucion).
 *
 * Eres el camarero de un bar de Alcala en plena ruta. Partida CERRADA de 20
 * pedidos (ni por tiempo ni por vidas): asi la nota maxima es finita y se
 * puede acotar. Cada cliente trae una comanda de 1 a 3 bebidas; cada bebida se
 * prepara tocando sus ingredientes EN ORDEN. Un paso equivocado tira solo esa
 * bebida. Si se acaba la paciencia, el cliente se va y el pedido vale 0.
 *
 * Reloj inyectable: todo lo que depende del tiempo recibe `ahora` en SEGUNDOS
 * (la pantalla pasa performance.now() / 1000). Nada de Date.now() suelto.
 */

export const ID_BARMAN = 'barman-express';
export const PEDIDOS = 20;

/**
 * Tras servir un pedido hay una pausa breve ("¡Bien hecho!") antes de que llegue
 * el siguiente cliente. El reloj de su paciencia arranca al llegar, no antes, asi
 * que la pausa no le cuesta nada a nadie ni cambia los puntos ni la cota.
 */
export const PAUSA_SERVIDO = 1.1;
/** Si pasan tantos segundos sin tocar nada con un cliente delante, se ensena que tocar. */
export const DUDA_DESPUES = 3;

// ---------------------------------------------------------------------------
// La carta (cerrada: no se cambia sin preguntar)
// ---------------------------------------------------------------------------

export type Ingrediente =
  | 'vaso'
  | 'vaso-grande'
  | 'copa'
  | 'vasito'
  | 'grifo'
  | 'vino'
  | 'gaseosa'
  | 'vermut'
  | 'casa'
  | 'hielo'
  | 'refresco-limon'
  | 'naranja';

/** Los 12 botones, SIEMPRE en este orden (4 x 3): la memoria muscular es parte del juego. */
export const INGREDIENTES: readonly Ingrediente[] = [
  'vaso', 'vaso-grande', 'copa', 'vasito',
  'grifo', 'vino', 'gaseosa', 'vermut',
  'casa', 'hielo', 'refresco-limon', 'naranja',
];

/** Nombre corto, el que cabe debajo del dibujo del boton. */
export const NOMBRE_INGREDIENTE: Record<Ingrediente, string> = {
  vaso: 'Vaso',
  'vaso-grande': 'Vaso grande',
  copa: 'Copa',
  vasito: 'Vasito',
  grifo: 'Grifo',
  vino: 'Vino',
  gaseosa: 'Gaseosa',
  vermut: 'Vermut',
  casa: 'De la casa',
  hielo: 'Hielo',
  'refresco-limon': 'Refresco',
  naranja: 'Naranja',
};

/** Nombre entero, para leer (comanda, lector de pantalla). */
export const NOMBRE_LARGO_INGREDIENTE: Record<Ingrediente, string> = {
  ...NOMBRE_INGREDIENTE,
  'refresco-limon': 'Refresco de limón',
  casa: 'Botella de la casa',
};

export type Bebida = 'cana' | 'canon' | 'clara' | 'tinto' | 'vermut' | 'chupito';

export const RECETAS: Record<Bebida, readonly Ingrediente[]> = {
  cana: ['vaso', 'grifo'],
  canon: ['vaso-grande', 'grifo'],
  clara: ['vaso', 'grifo', 'refresco-limon'],
  tinto: ['copa', 'vino', 'gaseosa', 'hielo'],
  vermut: ['vaso', 'hielo', 'vermut', 'naranja'],
  chupito: ['vasito', 'casa'],
};

export const NOMBRE_BEBIDA: Record<Bebida, string> = {
  cana: 'Caña',
  canon: 'Cañón',
  clara: 'Clara',
  tinto: 'Tinto de verano',
  vermut: 'Vermut',
  chupito: 'Chupito de la casa',
};

/**
 * La carta CRECE con la noche: desde que pedido (1..20) puede salir cada bebida.
 * Los primeros solo traen cañas; al final llegan las rondas de chupitos y el vermut.
 */
export const ENTRA: Record<Bebida, number> = { cana: 1, canon: 4, clara: 6, tinto: 9, chupito: 12, vermut: 15 };

/** Cuantas bebidas puede traer como mucho la comanda del pedido k (1..20). */
export function maxBebidas(k: number): number {
  return k <= 3 ? 1 : k <= 8 ? 2 : 3;
}

/** Desde que pedido puede venir una ronda de chupitos y con que probabilidad. */
export const RONDA_DESDE = ENTRA.chupito;
export const PROB_RONDA = 0.2;
export const BEBIDAS_RONDA = 3;

export function cartaDe(k: number): Bebida[] {
  return (Object.keys(ENTRA) as Bebida[]).filter((b) => ENTRA[b] <= k);
}

// ---------------------------------------------------------------------------
// Paciencia
// ---------------------------------------------------------------------------

/** Segundos por paso del primer pedido y del ultimo: la paciencia se ACORTA en linea recta. */
export const SEG_POR_PASO_INICIO = 1.9;
export const SEG_POR_PASO_FIN = 0.65;
/** Segundos de cortesia por cliente, sea cual sea su comanda (lo que tarda en leerla). */
export const MARGEN_PACIENCIA = 2.5;

export function segundosPorPaso(k: number): number {
  return SEG_POR_PASO_INICIO + ((SEG_POR_PASO_FIN - SEG_POR_PASO_INICIO) * (k - 1)) / (PEDIDOS - 1);
}

export type Comanda = { bebidas: Bebida[]; ronda: boolean; cliente: number };

export function pasosDe(c: Pick<Comanda, 'bebidas'>): number {
  return c.bebidas.reduce((s, b) => s + RECETAS[b].length, 0);
}

/** Paciencia (s) del cliente del pedido k: depende de lo que hay que hacer y se acorta con la noche. */
export function paciencia(k: number, c: Pick<Comanda, 'bebidas'>): number {
  return pasosDe(c) * segundosPorPaso(k) + MARGEN_PACIENCIA;
}

// ---------------------------------------------------------------------------
// Puntos (enteros, mas es mejor)
// ---------------------------------------------------------------------------

export const PUNTOS_POR_PASO = 10;
/**
 * Propina por rapidez, por tramos de la paciencia que le QUEDA al cliente al
 * terminar: [desde esta fraccion, porcentaje de la base]. Por tramos y no
 * continua para que la nota sea entera y la cota, exacta.
 */
export const TRAMOS_PROPINA: readonly (readonly [number, number])[] = [
  [0.6, 50],
  [0.4, 30],
  [0.2, 15],
];
/** En una ronda de chupitos, la propina va doble: "¡y uno para el camarero!". */
export const MULT_PROPINA_RONDA = 2;
/** Racha: cada pedido seguido SIN fallos suma un cuarto al multiplicador, hasta x2 (8 cuartos). */
export const RACHA_CUARTOS_TOPE = 8;

export function propina(base: number, fraccionRestante: number, ronda: boolean): number {
  const tramo = TRAMOS_PROPINA.find(([desde]) => fraccionRestante >= desde);
  const p = tramo ? Math.floor((base * tramo[1]) / 100) : 0;
  return ronda ? p * MULT_PROPINA_RONDA : p;
}

/** Multiplicador de la racha en CUARTOS (4 = x1): r pedidos seguidos sin fallo, contando este. */
// (El que se ensena en pantalla es el que se llevaria el pedido actual: ver multiplicadorActual.)
export function cuartosRacha(r: number): number {
  return r <= 0 ? 4 : Math.min(4 + (r - 1), RACHA_CUARTOS_TOPE);
}

export function puntosPedido(base: number, prop: number, racha: number): number {
  return Math.floor(((base + prop) * cuartosRacha(racha)) / 4);
}

/**
 * Lo maximo que puede valer el pedido k (sin la racha): la comanda que mas da
 * de todas las que permite el calendario, con la propina del tramo mas alto.
 * Se ENUMERAN todas las comandas posibles (multiconjuntos de 1..maxBebidas(k)
 * bebidas de la carta, y la ronda): no se supone cual es la mejor.
 */
export function maximoSinRacha(k: number): number {
  const carta = cartaDe(k);
  let mejor = 0;
  const probar = (bebidas: Bebida[], ronda: boolean) => {
    const base = pasosDe({ bebidas }) * PUNTOS_POR_PASO;
    mejor = Math.max(mejor, base + propina(base, 1, ronda));
  };
  const rec = (desde: number, actual: Bebida[]) => {
    if (actual.length > 0) probar(actual, false);
    if (actual.length === maxBebidas(k)) return;
    for (let i = desde; i < carta.length; i++) rec(i, [...actual, carta[i] as Bebida]);
  };
  rec(0, []);
  if (k >= RONDA_DESDE) probar(Array(BEBIDAS_RONDA).fill('chupito'), true);
  return mejor;
}

/**
 * La cota: ninguna partida de 20 pedidos puede superarla. Cada pedido k vale como
 * mucho maximoSinRacha(k) con la racha mas alta que puede llevar (k pedidos
 * seguidos sin fallo, con su tope). Cada sumando esta acotado por separado y
 * los pedidos no se influyen mas que por la racha, asi que la suma es una cota.
 * No se alcanza: haria falta que todas las comandas fueran las mas largas.
 */
export function cotaMaxima(): number {
  let total = 0;
  for (let k = 1; k <= PEDIDOS; k++) total += Math.floor((maximoSinRacha(k) * cuartosRacha(k)) / 4);
  return total;
}

/** El tope del ranking: el servidor (0073) rechaza cualquier nota por encima. */
export const PUNTUACION_MAXIMA = cotaMaxima();

// ---------------------------------------------------------------------------
// Pedidos con semilla
// ---------------------------------------------------------------------------

/** Generador con semilla (mulberry32): misma semilla, misma partida. */
export function crearAzar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cuantos clientes distintos hay dibujados (assets/barman/clientes/). */
export const CLIENTES_DISTINTOS = 12;

export function generarComandas(semilla: number): Comanda[] {
  const azar = crearAzar(semilla);
  const out: Comanda[] = [];
  let anterior = -1;
  for (let k = 1; k <= PEDIDOS; k++) {
    // El cliente: al azar, pero nunca el mismo dos veces seguidas.
    let cliente = Math.floor(azar() * CLIENTES_DISTINTOS);
    if (cliente === anterior) cliente = (cliente + 1) % CLIENTES_DISTINTOS;
    anterior = cliente;
    if (k >= RONDA_DESDE && azar() < PROB_RONDA) {
      out.push({ bebidas: Array(BEBIDAS_RONDA).fill('chupito'), ronda: true, cliente });
      continue;
    }
    const carta = cartaDe(k);
    // La ultima bebida que ha entrado sale el doble ("ha llegado algo nuevo");
    // el chupito suelto, la mitad (lo suyo son las rondas).
    const ultima = Math.max(...carta.map((b) => ENTRA[b]));
    const pesos = carta.map((b) => (ENTRA[b] === ultima ? 2 : 1) * (b === 'chupito' ? 0.5 : 1));
    const total = pesos.reduce((a, b) => a + b, 0);
    const n = 1 + Math.floor(azar() * maxBebidas(k));
    const bebidas: Bebida[] = [];
    for (let i = 0; i < n; i++) {
      let r = azar() * total;
      let idx = 0;
      while (idx < carta.length - 1 && r >= (pesos[idx] as number)) {
        r -= pesos[idx] as number;
        idx++;
      }
      bebidas.push(carta[idx] as Bebida);
    }
    out.push({ bebidas, ronda: false, cliente });
  }
  return out;
}

// ---------------------------------------------------------------------------
// La partida
// ---------------------------------------------------------------------------

export type Evento =
  | { n: number; tipo: 'paso'; bebida: Bebida }
  | { n: number; tipo: 'entregada'; bebida: Bebida }
  | { n: number; tipo: 'tirada'; bebida: Bebida }
  | { n: number; tipo: 'equivocado'; bebida: Bebida }
  | { n: number; tipo: 'servido'; puntos: number; propina: number; racha: number }
  | { n: number; tipo: 'enfadado' };

export type Partida = {
  comandas: Comanda[];
  /** Pedido en la barra (0..19); 20 = se acabo. */
  actual: number;
  /** Cuando llego a la barra el cliente actual (s); null hasta empezar. */
  llegada: number | null;
  /** Bebidas de la comanda actual ya entregadas. */
  entregadas: boolean[];
  /** La que se esta preparando (indice en la comanda) y cuantos pasos lleva. */
  elegida: number | null;
  hechos: number;
  /** Ha habido algun paso equivocado en este pedido (rompe la racha). */
  fallo: boolean;
  puntos: number;
  racha: number;
  mejorRacha: number;
  servidos: number;
  perdidos: number;
  /** Bebidas a la basura (paso equivocado con algo ya en el vaso). */
  tiradas: Record<Bebida, number>;
  /** Todos los fallos por bebida, tambien el primer paso equivocado (vaso vacio). */
  fallos: Record<Bebida, number>;
  /** Lo ultimo que ha pasado, para que la pantalla lo celebre o lo lamente. `n` sube siempre. */
  evento: Evento | null;
  /** Ultima vez que se toco algo (o llego el cliente): de aqui se mide la duda. */
  actividad: number | null;
};

const SIN_TIRADAS: Record<Bebida, number> = { cana: 0, canon: 0, clara: 0, tinto: 0, vermut: 0, chupito: 0 };

export function crearPartida(semilla: number): Partida {
  const comandas = generarComandas(semilla);
  return {
    comandas,
    actual: 0,
    llegada: null,
    entregadas: comandas[0]?.bebidas.map(() => false) ?? [],
    elegida: null,
    hechos: 0,
    fallo: false,
    puntos: 0,
    racha: 0,
    mejorRacha: 0,
    servidos: 0,
    perdidos: 0,
    tiradas: { ...SIN_TIRADAS },
    fallos: { ...SIN_TIRADAS },
    evento: null,
    actividad: null,
  };
}

export function terminada(p: Partida): boolean {
  return p.actual >= PEDIDOS;
}

/** El reloj arranca cuando llega el primer cliente (al pulsar empezar). */
export function empezar(p: Partida, ahora: number): Partida {
  return p.llegada === null ? { ...p, llegada: ahora, actividad: ahora } : p;
}

/** Hay una pausa entre clientes: el siguiente aun no ha llegado y los toques no cuentan. */
export function enPausa(p: Partida, ahora: number): boolean {
  return p.llegada !== null && !terminada(p) && ahora < p.llegada;
}

export function comandaActual(p: Partida): Comanda | null {
  return p.comandas[p.actual] ?? null;
}

/** Paciencia del cliente actual (s). */
export function pacienciaActual(p: Partida): number {
  const c = comandaActual(p);
  return c ? paciencia(p.actual + 1, c) : 0;
}

/** Fraccion de paciencia que le queda (1 = recien llegado, 0 = se va). */
export function pacienciaRestante(p: Partida, ahora: number): number {
  if (p.llegada === null || terminada(p)) return 1;
  const total = pacienciaActual(p);
  return Math.max(0, Math.min(1, 1 - (ahora - p.llegada) / total));
}

/** Un evento sin su numero (Omit que reparte sobre cada tipo de la union). */
type SinNumero = Evento extends infer E ? (E extends unknown ? Omit<E, 'n'> : never) : never;

function evento(p: Partida, e: SinNumero): Evento {
  return { ...e, n: (p.evento?.n ?? 0) + 1 } as Evento;
}

/** Pasa al siguiente cliente, que llega en ese mismo instante. */
function siguiente(p: Partida, ahora: number, pausa = 0): Partida {
  const actual = p.actual + 1;
  const llega = ahora + pausa;
  return {
    ...p,
    actual,
    llegada: actual < PEDIDOS ? llega : p.llegada,
    actividad: actual < PEDIDOS ? llega : p.actividad,
    entregadas: p.comandas[actual]?.bebidas.map(() => false) ?? [],
    elegida: null,
    hechos: 0,
    fallo: false,
  };
}

/**
 * Hace pasar el tiempo: si al cliente se le ha acabado la paciencia, se va
 * enfadado (0 puntos, lo entregado de su pedido no cuenta, la racha se rompe).
 * Se va en el instante en que se le acaba, no cuando se mira: asi el siguiente
 * llega a su hora aunque la pantalla pregunte tarde.
 */
export function avanzar(p: Partida, ahora: number): Partida {
  let q = p;
  while (!terminada(q) && q.llegada !== null && ahora - q.llegada >= pacienciaActual(q)) {
    const seFue = q.llegada + pacienciaActual(q);
    q = siguiente({ ...q, racha: 0, perdidos: q.perdidos + 1, evento: evento(q, { tipo: 'enfadado' }) }, seFue);
  }
  return q;
}

/**
 * Tocar una bebida de la comanda para prepararla. Solo con el vaso vacio: con una
 * bebida a medias no se cambia (hay que terminarla o tirarla). Si no, un toque sin
 * querer en la comanda, que esta justo encima de la barra, se llevaba por delante
 * los pasos hechos sin decir nada (lo cazo el critico).
 */
export function elegirBebida(antes: Partida, i: number, ahora: number): Partida {
  const p = avanzar(antes, ahora);
  if (terminada(p) || p.llegada === null || p !== antes || ahora < p.llegada) return p;
  if (p.hechos > 0) return p;
  if (i < 0 || i >= p.entregadas.length || p.entregadas[i] || p.elegida === i) return p;
  return { ...p, elegida: i, hechos: 0, actividad: ahora };
}

/** La que se prepara: la elegida o, si no se ha elegido, la primera pendiente. */
export function bebidaEnCurso(p: Partida): number | null {
  if (p.elegida !== null) return p.elegida;
  const i = p.entregadas.findIndex((e) => !e);
  return i === -1 ? null : i;
}

/** ¿`a` es el principio de `b` (o igual)? */
function empiezaPor(b: readonly Ingrediente[], a: readonly Ingrediente[]): boolean {
  return a.length <= b.length && a.every((x, k) => b[k] === x);
}

/** Entrega la bebida i: se tacha y, si era la ultima del pedido, se sirve (propina y racha). */
function entregar(p: Partida, i: number, ahora: number): Partida {
  const c = comandaActual(p) as Comanda;
  const bebida = c.bebidas[i] as Bebida;
  const entregadas = p.entregadas.map((e, k) => (k === i ? true : e));
  if (!entregadas.every(Boolean)) {
    return { ...p, entregadas, elegida: null, hechos: 0, evento: evento(p, { tipo: 'entregada', bebida }) };
  }
  // Pedido completo: propina por rapidez, racha si no hubo ningun fallo.
  const base = pasosDe(c) * PUNTOS_POR_PASO;
  const prop = propina(base, pacienciaRestante(p, ahora), c.ronda);
  const racha = p.fallo ? 0 : p.racha + 1;
  const puntos = puntosPedido(base, prop, racha);
  return siguiente(
    {
      ...p,
      entregadas,
      puntos: p.puntos + puntos,
      racha,
      mejorRacha: Math.max(p.mejorRacha, racha),
      servidos: p.servidos + 1,
      evento: evento(p, { tipo: 'servido', puntos, propina: prop, racha }),
    },
    ahora,
    PAUSA_SERVIDO,
  );
}

/**
 * Un toque en un ingrediente: el siguiente paso de la bebida que se prepara.
 *
 * LO QUE HAY EN EL VASO DECIDE QUE BEBIDA ES, como en una barra de verdad:
 *  - si el ingrediente no encaja con la que se prepara pero si con el siguiente
 *    paso de otra pendiente que lleva lo mismo hasta aqui, era esa (con [caña,
 *    chupito], el vasito empieza el chupito; con [caña, vermut], vaso y hielo
 *    pasan al vermut);
 *  - la caña es el principio de la clara: con vaso y grifo hay una caña en la
 *    mano. Si queda pendiente una bebida que la "alarga" (la clara), la caña NO
 *    se entrega aun: si lo siguiente es refresco, es una clara; si es cualquier
 *    otra cosa, se entrega la caña y el toque va a la siguiente bebida. Igual al
 *    reves: con [clara, caña], vaso y grifo y luego otro vaso entrega la caña.
 *  - solo es fallo si el ingrediente no encaja con NINGUNA bebida pendiente.
 * (Las tres trampas las cazo el critico: el vasito culpaba a la caña, y la caña y
 * la clara se pisaban en los dos ordenes.)
 */
function aplicarToque(antes: Partida, ing: Ingrediente, ahora: number): Partida {
  const p = avanzar(antes, ahora);
  // Si en este toque se ha ido un cliente, el toque era para el que se fue: no cuenta.
  // Y en la pausa de "¡Bien hecho!" (el siguiente aun no ha llegado) tampoco.
  if (p !== antes || terminada(p) || p.llegada === null || ahora < p.llegada) return p;
  const c = comandaActual(p) as Comanda;
  let i = bebidaEnCurso(p);
  if (i === null) return p;
  const pendiente = (j: number) => !p.entregadas[j];
  const hecho = RECETAS[c.bebidas[i] as Bebida].slice(0, p.hechos);

  if (RECETAS[c.bebidas[i] as Bebida][p.hechos] !== ing) {
    // 1) Otra pendiente con lo mismo hasta aqui y este ingrediente despues: era esa.
    const otra = c.bebidas.findIndex((b, j) => j !== i && pendiente(j) && RECETAS[b][p.hechos] === ing && empiezaPor(RECETAS[b], hecho));
    if (otra !== -1) {
      i = otra;
    } else if (p.hechos > 0) {
      // 2) Lo que hay en el vaso ya ES una bebida pendiente entera (una caña): se
      //    entrega esa y el toque va a la siguiente.
      const yaHecha = c.bebidas.findIndex((b, j) => pendiente(j) && RECETAS[b].length === hecho.length && empiezaPor(RECETAS[b], hecho));
      if (yaHecha !== -1) return aplicarToque(entregar(p, yaHecha, ahora), ing, ahora);
    }
  }
  const bebida = c.bebidas[i] as Bebida;
  const receta = RECETAS[bebida];

  if (receta[p.hechos] !== ing) {
    // Con el vaso aun vacio no hay nada que tirar: es un fallo (rompe la racha),
    // pero no cuenta como "bebida a la basura" en la tarjeta de fin.
    if (p.hechos === 0) {
      return {
        ...p,
        elegida: i,
        fallo: true,
        fallos: { ...p.fallos, [bebida]: p.fallos[bebida] + 1 },
        evento: evento(p, { tipo: 'equivocado', bebida }),
      };
    }
    // Paso equivocado: a la basura SOLO esta bebida; las entregadas siguen entregadas.
    return {
      ...p,
      elegida: i,
      hechos: 0,
      fallo: true,
      tiradas: { ...p.tiradas, [bebida]: p.tiradas[bebida] + 1 },
      fallos: { ...p.fallos, [bebida]: p.fallos[bebida] + 1 },
      evento: evento(p, { tipo: 'tirada', bebida }),
    };
  }
  const hechos = p.hechos + 1;
  if (hechos < receta.length) return { ...p, elegida: i, hechos, evento: evento(p, { tipo: 'paso', bebida }) };

  // Bebida completa. Si queda pendiente otra que la alarga (la clara de una caña),
  // aun no se entrega: el siguiente toque dira cual era.
  const alarga = c.bebidas.some((b, j) => j !== i && pendiente(j) && RECETAS[b].length > receta.length && empiezaPor(RECETAS[b], receta));
  if (alarga) return { ...p, elegida: i, hechos, evento: evento(p, { tipo: 'paso', bebida }) };
  return entregar({ ...p, elegida: i, hechos }, i, ahora);
}

/** Un toque en un ingrediente (ver aplicarToque). Anota cuando fue, para medir la duda. */
export function tocarIngrediente(antes: Partida, ing: Ingrediente, ahora: number): Partida {
  const q = aplicarToque(antes, ing, ahora);
  if (q === antes) return q;
  // Si el toque sirvio el pedido, la actividad es la llegada del siguiente (tras la pausa).
  return { ...q, actividad: Math.max(ahora, q.llegada ?? ahora) };
}

/**
 * Los ingredientes que valen como SIGUIENTE paso ahora mismo (para la pista cuando
 * alguien duda): el siguiente de la bebida que se prepara; con una caña en la mano
 * que podria ser una clara, el refresco o el primero de otra pendiente; con el
 * vaso vacio, el primero de la bebida que toca. Vacio si no hay nada que tocar
 * (pausa, sin cliente).
 */
export function ingredientesValidos(p: Partida): Ingrediente[] {
  const c = comandaActual(p);
  const i = bebidaEnCurso(p);
  if (!c || i === null || terminada(p) || p.llegada === null) return [];
  const receta = RECETAS[c.bebidas[i] as Bebida];
  const out = new Set<Ingrediente>();
  const siguientePaso = receta[p.hechos];
  if (siguientePaso !== undefined) out.add(siguientePaso);
  // Con algo ya en el vaso: tambien lo que alarga lo hecho (la clara) y lo que seguiria si se entrega.
  c.bebidas.forEach((b, j) => {
    if (j === i || p.entregadas[j]) return;
    const r = RECETAS[b];
    const hecho = receta.slice(0, p.hechos);
    if (p.hechos > 0 && empiezaPor(r, hecho) && r[p.hechos] !== undefined) out.add(r[p.hechos] as Ingrediente);
    if (siguientePaso === undefined) out.add(r[0] as Ingrediente);
  });
  return [...out];
}

/** Alguien duda: lleva `DUDA_DESPUES` segundos sin tocar nada con el cliente delante. */
export function hayDuda(p: Partida, ahora: number): boolean {
  if (terminada(p) || p.llegada === null || p.actividad === null || ahora < p.llegada) return false;
  return ahora - Math.max(p.actividad, p.llegada) >= DUDA_DESPUES;
}

/**
 * Lo que multiplicaria el pedido actual si se termina sin mas fallos (en cuartos):
 * x1 si ya ha habido un fallo en el. Es lo que ensena la cabecera.
 */
export function multiplicadorActual(p: Partida): number {
  return p.fallo ? 4 : cuartosRacha(p.racha + 1);
}

/**
 * La bebida que mas se ha resistido: la de mas FALLOS (tirada o primer paso
 * equivocado: elegir el vaso que no es es seguramente el fallo mas comun).
 * null si no se ha fallado ninguna.
 */
export function masResistida(p: Partida): Bebida | null {
  let mejor: Bebida | null = null;
  for (const b of Object.keys(p.fallos) as Bebida[]) {
    if (p.fallos[b] > 0 && (mejor === null || p.fallos[b] > p.fallos[mejor])) mejor = b;
  }
  return mejor;
}

export function totalTiradas(p: Partida): number {
  return (Object.values(p.tiradas) as number[]).reduce((a, b) => a + b, 0);
}

/** Una frase para la tarjeta de fin, segun cuantos pedidos se han servido. */
export function mensajeFinal(servidos: number): string {
  if (servidos === PEDIDOS) return '¡Barra impecable! Nadie se ha ido sin lo suyo.';
  if (servidos >= 16) return 'Gran turno. Alguno se fue con sed, pero poco.';
  if (servidos >= 10) return 'Turno apañado. Mañana, más rápido en el grifo.';
  return 'Noche dura. La barra ha podido contigo.';
}

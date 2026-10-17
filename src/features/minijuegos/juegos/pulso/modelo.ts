export const ID_PULSO = 'pulso-de-camarero';

/**
 * Pulso de Camarero: el modelo, sin pantalla. Todo lo que decide la nota vive
 * aqui, puro y con tests (modelo.test.ts); el componente solo lo dibuja.
 *
 * Sin importaciones: los tests lo cargan tal cual.
 *
 * El juego en una linea: la bandeja se inclina SOLA porque el camarero esquiva
 * a la gente (empuje del giro) y porque algun cliente te roza (empujon); el
 * jugador la endereza girando el movil. Lo que se salva de liquido, a lo largo
 * de tres rondas, es la nota.
 *
 * El angulo se cuenta en GRADOS con signo: POSITIVO = la bandeja cae hacia la
 * DERECHA (su lado derecho baja, sentido de las agujas del reloj). Ver
 * `anguloBandeja` para el signo del movil.
 */

// ---------------------------------------------------------------------------
// Azar con semilla: misma semilla, mismo recorrido
// ---------------------------------------------------------------------------

/** mulberry32: pequeno, rapido y estable entre motores (solo enteros de 32 bits). */
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

/** Mezcla (semilla, ronda, flujo) en una semilla nueva: cada flujo de azar es independiente de los demas. */
function mezclar(semilla: number, ronda: number, flujo: number): number {
  let h = Math.imul(semilla ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(ronda + 1, 0xc2b2ae35) ^ Math.imul(flujo + 1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

const entre = (azar: () => number, a: number, b: number) => a + (b - a) * azar();

// ---------------------------------------------------------------------------
// Bebidas: cuanto aguantan y cuanto valen
// ---------------------------------------------------------------------------

export type TipoBebida = 'chupito' | 'cana' | 'jarra' | 'balon' | 'cocktel' | 'botella';

export type Bebida = {
  /** Hasta que inclinacion (grados, en valor absoluto) NO se derrama nada. */
  umbral: number;
  /** Cuanto se derrama: fraccion del nivel que se pierde por segundo y por grado de EXCESO. */
  tasa: number;
  /** Lo que vale para la nota (relativo: solo cuenta el reparto entre las de la ronda). */
  valor: number;
};

/**
 * Los umbrales y las tasas se afinaron con los jugadores simulados de modelo.test.ts. Una PRIMERA version
 * tenia las tasas al doble (cocktel 0,1) y se vaciaba demasiado con un fallo normal: ahora cada error
 * cuesta la mitad, pero los umbrales son 1 grado mas bajos, asi que seguir saliendose un poco de la banda
 * sigue impidiendo el 90 (el jugador bueno saca 72 y solo el de elite pasa del 90, en 1 de cada 4 partidas).
 *
 * Las copas anchas pierden antes y valen mas; el chupito aguanta y vale poco. La
 * botella casi no derrama (tasa baja, umbral alto) pero se CAE: ver `BOTELLA`.
 * Ordenadas de menos a mas aguante a proposito (`copas antes que canas`).
 */
export const BEBIDAS: Readonly<Record<TipoBebida, Bebida>> = {
  cocktel: { umbral: 5, tasa: 0.05, valor: 5 },
  balon: { umbral: 7, tasa: 0.04, valor: 4 },
  jarra: { umbral: 9, tasa: 0.03, valor: 3 },
  cana: { umbral: 10, tasa: 0.0275, valor: 2 },
  chupito: { umbral: 12, tasa: 0.0225, valor: 1 },
  botella: { umbral: 25, tasa: 0.01, valor: 6 },
};

/** La botella se cae si pasa de `grados` durante `segundos` seguidos: pierde TODO su valor de golpe. */
export const BOTELLA = { grados: 24, segundos: 0.3 } as const;

// ---------------------------------------------------------------------------
// Rondas
// ---------------------------------------------------------------------------

export type Ronda = {
  /** Puntos maximos de la ronda. */
  peso: number;
  /** Segundos de ronda. */
  duracion: number;
  bebidas: readonly TipoBebida[];
  /** Hueco entre esquivas (s): minimo y maximo. */
  hueco: readonly [number, number];
  /** Inclinacion (grados) que mete la esquiva MAS brusca; la nitidez de cada una la escala entre `nitidez[0]` y `nitidez[1]` de ese pico. */
  empuje: number;
  nitidez: readonly [number, number];
  /** Esquivas en S: tras una, otra al lado contrario enseguida. */
  enS: boolean;
  /** Empujones de clientes (no se ven venir): cuantos y de cuantos grados como minimo y maximo. */
  empujones: { n: number; grados: readonly [number, number] };
};

export const RONDAS: readonly Ronda[] = [
  // 1. Calentamiento: giros suaves y espaciados, sin empujones.
  {
    peso: 25,
    duracion: 25,
    bebidas: ['chupito', 'cana', 'jarra', 'balon'],
    hueco: [3.2, 4.4],
    empuje: 20,
    nitidez: [0.5, 0.9],
    enS: false,
    empujones: { n: 0, grados: [0, 0] },
  },
  // 2. Copas, giros mas bruscos y seguidos, algun empujon.
  {
    peso: 35,
    duracion: 30,
    bebidas: ['chupito', 'cana', 'jarra', 'balon', 'cocktel', 'cocktel'],
    hueco: [2.4, 3.4],
    empuje: 28,
    nitidez: [0.55, 1],
    enS: false,
    empujones: { n: 3, grados: [6, 9] },
  },
  // 3. Botella, giros encadenados en S y empujones.
  {
    peso: 40,
    duracion: 35,
    bebidas: ['chupito', 'cana', 'jarra', 'jarra', 'balon', 'cocktel', 'cocktel', 'botella'],
    hueco: [2.2, 3],
    empuje: 34,
    nitidez: [0.6, 1],
    enS: true,
    empujones: { n: 6, grados: [8, 12] },
  },
];

/** Lo que mas puede valer la partida: la suma de los pesos, 100,00: como un porcentaje. */
export const PUNTUACION_MAXIMA = RONDAS.reduce((s, r) => s + r.peso, 0);

/** Con cuanta antelacion (s) se ve venir una esquiva: el tiempo para ver hacia donde se inclinara la bandeja. */
export const AVISO_ESQUIVA = 2;
/** Un cliente que roza se ve de reojo solo este rato (s): menos que cualquier reaccion, asi que no se puede anticipar. */
export const AVISO_EMPUJON = 0.3;
/** La primera esquiva no llega antes (s): tiempo de ponerse el movil bien. */
const PRIMERA_ESQUIVA = 2.8;

// ---------------------------------------------------------------------------
// El recorrido: de la semilla salen las esquivas y los empujones
// ---------------------------------------------------------------------------

/** Una esquiva: en `t` el camarero gira hacia `lado` (+1 derecha, -1 izquierda) con `nitidez` (0 a 1). */
export type Esquiva = { t: number; lado: 1 | -1; nitidez: number };
/** Un empujon: en `t` un cliente te roza desde `lado` y la bandeja recibe `grados`. */
export type Empujon = { t: number; lado: 1 | -1; grados: number };
export type Recorrido = { ronda: number; esquivas: Esquiva[]; empujones: Empujon[] };

/**
 * Esquivas y empujones salen de DOS flujos de azar distintos: lo que se ve venir
 * (las esquivas, 2 s antes) no dice nada de los empujones. Con la misma semilla,
 * el recorrido es el mismo.
 */
export function crearRecorrido(ronda: number, semilla: number): Recorrido {
  const r = RONDAS[ronda];
  if (!r) throw new Error(`ronda ${ronda} no existe`);
  const azarEsquivas = crearAzar(mezclar(semilla, ronda, 1));
  const azarEmpujones = crearAzar(mezclar(semilla, ronda, 2));

  const esquivas: Esquiva[] = [];
  const ultimaPosible = r.duracion - 1.8;
  let t = PRIMERA_ESQUIVA + entre(azarEsquivas, 0, 0.6);
  let lado: 1 | -1 = azarEsquivas() < 0.5 ? -1 : 1;
  while (t <= ultimaPosible) {
    esquivas.push({ t, lado, nitidez: entre(azarEsquivas, r.nitidez[0], r.nitidez[1]) });
    if (r.enS && t + 1 <= ultimaPosible) {
      // En S: enseguida, al lado contrario.
      const t2 = t + entre(azarEsquivas, 0.8, 1.1);
      if (t2 <= ultimaPosible) esquivas.push({ t: t2, lado: lado === 1 ? -1 : 1, nitidez: entre(azarEsquivas, r.nitidez[0], r.nitidez[1]) });
      t = t2;
    }
    t += entre(azarEsquivas, r.hueco[0], r.hueco[1]);
    lado = azarEsquivas() < 0.6 ? (lado === 1 ? -1 : 1) : lado;
  }

  const empujones: Empujon[] = [];
  const ocupados: number[] = [];
  for (let i = 0; i < r.empujones.n; i++) {
    // Sitio al azar, con al menos 1,2 s de otro empujon: no hacen falta mas reglas, y a proposito
    // NO se miran las esquivas (no hay que poder deducirlos de ellas).
    for (let intento = 0; intento < 40; intento++) {
      const te = entre(azarEmpujones, 4, r.duracion - 3);
      if (ocupados.every((o) => Math.abs(o - te) >= 1.2)) {
        ocupados.push(te);
        empujones.push({
          t: te,
          lado: azarEmpujones() < 0.5 ? -1 : 1,
          grados: entre(azarEmpujones, r.empujones.grados[0], r.empujones.grados[1]),
        });
        break;
      }
    }
  }
  empujones.sort((a, b) => a.t - b.t);
  return { ronda, esquivas, empujones };
}

/** Las esquivas que se ven venir en `t` (aun no han llegado y quedan menos de AVISO_ESQUIVA s). Lo que el jugador puede anticipar. */
export function esquivasVisibles(rec: Recorrido, t: number): Esquiva[] {
  return rec.esquivas.filter((e) => e.t > t && e.t - t <= AVISO_ESQUIVA);
}

// ---------------------------------------------------------------------------
// El empuje: sube hasta un pico y vuelve con un rebote amortiguado (el chapoteo)
// ---------------------------------------------------------------------------

type Pulso = { omega: number; tau: number; pico: number; fin: number };
function pulso(periodo: number, tau: number): Pulso {
  const omega = (2 * Math.PI) / periodo;
  const t = Math.atan(omega * tau) / omega; // donde es maximo e^(-t/tau) sin(omega t)
  return { omega, tau, pico: Math.exp(-t / tau) * Math.sin(omega * t), fin: 8 * tau };
}
/** Esquiva: pico a los 0,87 s, rebote de casi un tercio del pico (de signo contrario) y se acaba a los ~14 s. */
const PULSO_ESQUIVA = pulso(4.6, 1.8);
/** Empujon: mas seco, pico a los 0,17 s. */
const PULSO_EMPUJON = pulso(0.9, 0.35);

/** Respuesta normalizada (pico = 1) `s` segundos despues del golpe. */
function respuesta(p: Pulso, s: number): number {
  if (s <= 0 || s >= p.fin) return 0;
  return (Math.exp(-s / p.tau) * Math.sin(p.omega * s)) / p.pico;
}

/**
 * Cuanto inclina la bandeja el camarero y la gente en `t` (grados, con signo).
 * Girar a un lado inclina la bandeja hacia el OTRO (la inercia): esquivar a la
 * derecha (+1) da un empuje NEGATIVO. Un empujon desde la derecha la empuja hacia
 * la izquierda por la misma razon. Cerrada: se puede evaluar en cualquier `t`.
 */
export function empuje(rec: Recorrido, t: number): number {
  const r = RONDAS[rec.ronda] as Ronda;
  let g = 0;
  for (const e of rec.esquivas) g -= e.lado * r.empuje * e.nitidez * respuesta(PULSO_ESQUIVA, t - e.t);
  for (const e of rec.empujones) g -= e.lado * e.grados * respuesta(PULSO_EMPUJON, t - e.t);
  return g;
}

/**
 * El angulo con el que se dibuja y se derrama: el empuje mas lo que corrige el
 * jugador con el movil. Positivo = la bandeja cae a la derecha.
 *
 * LA CONVENCION DEL SIGNO, en UN solo sitio: `giroMovil` es `inclinacionConSigno`
 * (cana/inclinacion.ts): positivo = el movil inclinado a la DERECHA. Se SUMA. Si
 * la bandeja cae a la derecha (+) se endereza inclinando el movil a la izquierda
 * (-): como un nivel de burbuja, "levanta el lado que cae". SIN PROBAR en un movil
 * de verdad: si se siente al reves, se cambia el signo aqui y en nada mas.
 */
export function anguloBandeja(empujeGrados: number, giroMovil: number): number {
  return empujeGrados + giroMovil;
}

// ---------------------------------------------------------------------------
// La ronda: a pasos fijos
// ---------------------------------------------------------------------------

/**
 * Constante de tiempo (s) del filtro del giro del movil en ESTE juego. Mas corta que la de La Caña
 * (TAU_GIRO = 0,12): una bandeja que se inclina exige reflejos, y con 0,12 s hasta el jugador
 * bueno perdia la mitad de la ultima ronda. Los jugadores simulados de modelo.test.ts la usan.
 */
export const TAU_GIRO_PULSO = 0.08;

/** Paso fijo de la fisica (s): el mismo juego a 30, 60 o 144 fps da el mismo resultado. */
export const PASO = 1 / 120;

export type EstadoRonda = {
  ronda: number;
  /** Segundos de ronda ya simulados. */
  t: number;
  /** Tiempo real acumulado que aun no ha dado un paso entero. */
  resto: number;
  /** 0 (vacia) a 1 (llena), una por bebida de la ronda, sin redondear nunca. */
  niveles: number[];
  /** Cuanto lleva la botella pasada del limite, seguido (s). */
  fuera: number[];
  caidas: boolean[];
  /** Cuanto ha derramado cada bebida hacia cada lado (-1 izquierda, +1 derecha): para dibujar el charco. */
  ladoDerrame: number[];
  /** El mayor angulo (valor absoluto) de la ronda, para el resumen. */
  anguloMax: number;
  terminada: boolean;
};

export function nuevaRonda(ronda: number): EstadoRonda {
  const r = RONDAS[ronda];
  if (!r) throw new Error(`ronda ${ronda} no existe`);
  return {
    ronda,
    t: 0,
    resto: 0,
    niveles: r.bebidas.map(() => 1),
    fuera: r.bebidas.map(() => 0),
    caidas: r.bebidas.map(() => false),
    ladoDerrame: r.bebidas.map(() => 0),
    anguloMax: 0,
    terminada: false,
  };
}

/** Un paso (`PASO` s) con la bandeja a `angulo` grados. */
function paso(e: EstadoRonda, angulo: number): void {
  const r = RONDAS[e.ronda] as Ronda;
  const abs = Math.abs(angulo);
  if (abs > e.anguloMax) e.anguloMax = abs;
  r.bebidas.forEach((tipo, i) => {
    if ((e.niveles[i] as number) <= 0) return;
    const b = BEBIDAS[tipo];
    if (tipo === 'botella') {
      e.fuera[i] = abs > BOTELLA.grados ? (e.fuera[i] as number) + PASO : 0;
      if ((e.fuera[i] as number) >= BOTELLA.segundos) {
        e.niveles[i] = 0;
        e.caidas[i] = true;
        e.ladoDerrame[i] = angulo >= 0 ? 1 : -1;
        return;
      }
    }
    const exceso = abs - b.umbral;
    if (exceso > 0) {
      // dL/dt = -tasa * exceso * L, integrado en exacto: no depende del paso.
      e.niveles[i] = (e.niveles[i] as number) * Math.exp(-b.tasa * exceso * PASO);
      e.ladoDerrame[i] = angulo >= 0 ? 1 : -1;
    }
  });
  e.t += PASO;
}

/** Cuanto liquido queda, de 0 a 1, ponderado por lo que vale cada bebida. SIN redondear. */
export function fraccionSalvada(ronda: number, niveles: readonly number[]): number {
  const r = RONDAS[ronda] as Ronda;
  let valor = 0;
  let total = 0;
  r.bebidas.forEach((tipo, i) => {
    const v = BEBIDAS[tipo].valor;
    total += v;
    valor += v * (niveles[i] as number);
  });
  return valor / total;
}

/** Las tres rondas se acaban a su hora, o antes si no queda nada que salvar. */
export function rondaAcabada(e: EstadoRonda): boolean {
  if (e.t >= (RONDAS[e.ronda] as Ronda).duracion) return true;
  return e.niveles.every((n) => n <= 1e-4);
}

/**
 * Avanza `dt` segundos de TIEMPO REAL: da tantos pasos fijos como quepan y se
 * guarda el resto. `giroMovil(t)` da el giro del jugador en el instante `t` de la
 * ronda (el componente le pasa el ultimo filtrado; un test, una funcion exacta).
 */
export function avanzar(e: EstadoRonda, rec: Recorrido, dt: number, giroMovil: (t: number) => number): void {
  if (e.terminada) return;
  e.resto += dt;
  while (e.resto >= PASO) {
    e.resto -= PASO;
    paso(e, anguloBandeja(empuje(rec, e.t), giroMovil(e.t)));
    if (rondaAcabada(e)) {
      e.terminada = true;
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Los puntos
// ---------------------------------------------------------------------------

/** Desde que fraccion la curva deja de ser lineal. */
export const UMBRAL_CURVA = 0.9;

/**
 * La curva de arriba, como `curvaAlta` de La Caña Perfecta pero en fraccion: lineal
 * hasta 0,90 y, por encima, 1 - 0,1 * sqrt((1 - f) / 0,1). Continua en 0,90 (sigue
 * valiendo 0,90) y comprime lo de arriba: 0,95 vale 0,929, 0,99 vale 0,968 y el 1
 * solo sale de salvarlo TODO. Sin esto, en un grupo grande medio ranking se
 * quedaria a centesimas del maximo.
 */
export function curva(fraccion: number): number {
  const f = Math.min(Math.max(fraccion, 0), 1);
  if (f <= UMBRAL_CURVA) return f;
  const tramo = 1 - UMBRAL_CURVA;
  return 1 - tramo * Math.sqrt((1 - f) / tramo);
}

/** Puntos de una ronda, SIN redondear. */
export function puntosRonda(ronda: number, niveles: readonly number[]): number {
  return (RONDAS[ronda] as Ronda).peso * curva(fraccionSalvada(ronda, niveles));
}

/** La nota: suma de las rondas, redondeada a dos decimales UNA sola vez, al final. */
export function notaPartida(puntosPorRonda: readonly number[]): number {
  const suma = puntosPorRonda.reduce((s, p) => s + p, 0);
  return Math.round(suma * 100) / 100;
}


// ---------------------------------------------------------------------------
// Resumen para la tarjeta de fin
// ---------------------------------------------------------------------------

export const NOMBRE_BEBIDA: Readonly<Record<TipoBebida, string>> = {
  chupito: 'chupito',
  cana: 'caña',
  jarra: 'jarra',
  balon: 'copa de balón',
  cocktel: 'copa de cóctel',
  botella: 'botella',
};

/** Por debajo de esto una bebida cuenta como TIRADA (queda menos de un 5 % del vaso), o si la botella se cayo. */
export const NIVEL_TIRADA = 0.05;

export type ResultadoRonda = { ronda: number; niveles: number[]; caidas: boolean[] };

/** Cuantas bebidas has tirado en la partida: las que acaban casi vacias y las botellas caidas. */
export function bebidasTiradas(rondas: readonly ResultadoRonda[]): number {
  let n = 0;
  for (const r of rondas) r.niveles.forEach((nivel, i) => { if (nivel < NIVEL_TIRADA || r.caidas[i]) n += 1; });
  return n;
}

/**
 * La bebida que mas se te resistio: el TIPO del que mas liquido has perdido, en
 * proporcion, entre todas las rondas. Null si no has perdido nada.
 */
export function bebidaMasDificil(rondas: readonly ResultadoRonda[]): TipoBebida | null {
  const perdido = new Map<TipoBebida, { total: number; n: number }>();
  for (const r of rondas) {
    (RONDAS[r.ronda] as Ronda).bebidas.forEach((tipo, i) => {
      const a = perdido.get(tipo) ?? { total: 0, n: 0 };
      a.total += 1 - (r.niveles[i] as number);
      a.n += 1;
      perdido.set(tipo, a);
    });
  }
  let peor: TipoBebida | null = null;
  let max = 1e-9;
  for (const [tipo, a] of perdido) {
    const medio = a.total / a.n;
    if (medio > max) {
      max = medio;
      peor = tipo;
    }
  }
  return peor;
}

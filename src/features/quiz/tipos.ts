export type Nivel = 1 | 2 | 3 | 4 | 5;

export type Pregunta = {
  id: string;
  nivel: Nivel;
  categoria: string;
  pregunta: string;
  correcta: string;
  incorrectas: readonly [string, string, string];
  explicacion: string;
};

export type BancoPreguntas = {
  version: number;
  idioma: string;
  niveles: Record<string, string>;
  categorias: readonly string[];
  preguntas: readonly Pregunta[];
};

/** Generador en [0, 1): `Math.random` en la app, uno con semilla en los tests. */
export type Azar = () => number;

export type Opcion = { texto: string; correcta: boolean };

export type Comodin = 'cincuenta' | 'voto' | 'cambio';

/** Valores que se pueden cambiar sin tocar la logica (ver config.ts). */
export type ConfigQuiz = {
  /** Premio por nivel: el indice 0 es el nivel 1. */
  premios: readonly number[];
  /** Nivel (1-5) cuyo premio queda asegurado al acertarlo. */
  nivelSeguro: number;
  segundos: number;
  suspenseMs: number;
  /** Probabilidad de que el voto del bar ponga la correcta la primera, por nivel. */
  probVotoCorrecta: readonly number[];
};

export type Desenlace = 'gano' | 'fallo' | 'tiempo' | 'plantado';

export type EstadoPartida = {
  /** respondiendo: se puede elegir y usar comodines. suspense: ya confirmada. revelada: se ve el resultado. fin: terminada. */
  fase: 'respondiendo' | 'suspense' | 'revelada' | 'fin';
  /** 0 a 4: la pregunta que se esta jugando. */
  indice: number;
  pregunta: Pregunta;
  opciones: readonly Opcion[];
  /** Opcion marcada (aun sin confirmar, o ya confirmada). */
  seleccion: number | null;
  eliminadas: readonly number[];
  /** Porcentajes por opcion (0 en las eliminadas), o null si no se uso el voto. */
  voto: readonly number[] | null;
  usados: Readonly<Record<Comodin, boolean>>;
  /** Solo en `revelada`: si la respuesta confirmada era la correcta. */
  acierto: boolean | null;
  /** Solo en `revelada`: la causa si no hubo acierto (fallo o tiempo agotado). */
  causaFallo: 'fallo' | 'tiempo' | null;
  /** Ids ya vistos por nivel en este dispositivo, incluidos los de esta partida. */
  vistas: readonly string[];
  desenlace: Desenlace | null;
  /** Puntos de la partida: solo cuenta cuando `fase` es `fin`. */
  puntos: number;
};

export type Accion =
  | { tipo: 'elegir'; opcion: number }
  | { tipo: 'confirmar' }
  | { tipo: 'revelar' }
  | { tipo: 'tiempoAgotado' }
  | { tipo: 'plantarse' }
  | { tipo: 'comodin'; comodin: Comodin }
  | { tipo: 'siguiente' };

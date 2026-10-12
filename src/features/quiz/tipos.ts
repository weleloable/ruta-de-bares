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
  /** Segundos por pregunta. Un punto por acierto (0061): no hay escalera de premios. */
  segundos: number;
  suspenseMs: number;
  /** Probabilidad de que el voto del bar ponga la correcta la primera, por nivel. */
  probVotoCorrecta: readonly number[];
};

export type Desenlace = 'gano' | 'fallo' | 'tiempo';

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
  /** Puntos de la partida (un punto por acierto): solo cuenta cuando `fase` es `fin`. */
  puntos: number;
  /**
   * Milisegundos contestando, sumados de todas las preguntas: desempata (menos
   * es mejor). Cuenta desde que sale cada pregunta hasta que se confirma, no las
   * pausas de suspense; sin contestar a tiempo, la pregunta entera.
   */
  ms: number;
};

export type Accion =
  | { tipo: 'elegir'; opcion: number }
  /** `ms`: lo que se ha tardado en esta pregunta (lo mide la pantalla). */
  | { tipo: 'confirmar'; ms?: number }
  | { tipo: 'revelar' }
  | { tipo: 'tiempoAgotado' }
  /** `ms`: en el cambio de ronda, lo tardado en la pregunta que se cambia (no se regala). */
  | { tipo: 'comodin'; comodin: Comodin; ms?: number }
  | { tipo: 'siguiente' };

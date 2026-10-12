import type { ComponentType } from 'react';

/**
 * Lo que un juego entrega al terminar. Es el unico contrato con el resto de la
 * app: hoy solo se guarda el record personal, pero un ranking o la compostelana
 * se colgarian de este mismo callback sin tocar los juegos.
 */
export type ResultadoJuego = {
  /** Id estable del juego (el de `JuegoDef.id`). */
  juego: string;
  /** Mas es mejor. Enteros: es lo que se compara y se guarda. */
  puntuacion: number;
  /** Datos propios de cada juego (aciertos, tiempo...), para mostrar o rankear. */
  detalles?: Record<string, number | string | boolean>;
};

/** Props que recibe el componente de cualquier juego. */
export type PropsJuego = {
  onFinish: (resultado: ResultadoJuego) => void;
  /**
   * Volver al menu sin terminar. Solo lo reciben los juegos a pantalla
   * completa (`pantallaCompleta`), que no tienen la cabecera del menu.
   */
  onSalir?: () => void;
};

/** Props del bloque extra que un juego puede poner en la tarjeta de fin de partida. */
export type PropsDetalle = {
  resultado: ResultadoJuego;
};

/** Ficha de un juego en el menu. */
export type JuegoDef = {
  id: string;
  titulo: string;
  /** Una linea: se lee de pasada en un bar. */
  descripcion: string;
  icono: 'beer' | 'flask' | 'musical-notes' | 'eye' | 'timer' | 'car' | 'help-circle';
  Componente: ComponentType<PropsJuego>;
  /**
   * Se juega a pantalla completa, sin la cabecera del menu ni las pestanas
   * (p. ej. en horizontal). El juego pone su propio boton de salir (`onSalir`).
   */
  pantallaCompleta?: boolean;
  /**
   * El juego ensena su propio resultado (y sus rankings) al terminar: el menu
   * no lo desmonta ni pone su tarjeta, y no guarda record propio. `onFinish` se
   * sigue llamando, para quien quiera colgarse de el (la Compostelana...).
   */
  resultadoPropio?: boolean;
  /**
   * Opcional: lo que se ensena en la tarjeta de fin de partida, bajo la
   * puntuacion (amigos reclutados, un mensaje...). El record y el aviso de
   * "nuevo record" los pone el menu para todos los juegos por igual.
   */
  Detalle?: ComponentType<PropsDetalle>;
  /**
   * Como se guarda el resultado en la RUTA (0034). Sin esto el juego es solo
   * local. Lanza con un mensaje legible si falla: el record local ya esta
   * guardado y el menu solo avisa.
   */
  enviar?: (rutaId: string, resultado: ResultadoJuego) => Promise<void>;
  /** Tiene ranking por ruta. */
  ranking?: boolean;
  /**
   * Su propio ranking para ver desde el menu, cuando no es el de una nota por
   * juego (p. ej. por nivel). Sustituye al Ranking comun.
   */
  RankingPropio?: ComponentType<{ rutaId: string }>;
  /** Tiene lista de cervezas de la ruta. */
  cervezas?: boolean;
};

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
};

/** Ficha de un juego en el menu. */
export type JuegoDef = {
  id: string;
  titulo: string;
  /** Una linea: se lee de pasada en un bar. */
  descripcion: string;
  icono: 'beer' | 'musical-notes' | 'eye' | 'timer';
  Componente: ComponentType<PropsJuego>;
};

import type { PasoJuego } from './pasos';

/**
 * Un dato curioso por paso, de una frase. Tienen que ser REALES: solo se
 * afirma lo que es cierto en general, sin cifras dudosas. Se muestra uno al
 * acabar cada paso, y la persona puede seguir sin leerlo.
 */
export const CURIOSIDADES: Record<PasoJuego, readonly string[]> = {
  malta: [
    'La malta es cebada que se hace germinar y luego se seca: cuanto más se tuesta, más oscura queda la cerveza.',
    'El color oscuro de una stout viene de los cereales tostados, no de que lleve más alcohol.',
  ],
  maceracion: [
    'Al macerar, las enzimas de la malta convierten el almidón en azúcares, que luego la levadura transformará en alcohol.',
    'Macerar a más temperatura da una cerveza más dulce y con más cuerpo; a menos, una más seca.',
  ],
  lupulo: [
    'El lúpulo que se echa al principio del hervido aporta amargor, y el que se echa al final aporta aroma.',
    'Además de amargar y dar aroma, el lúpulo ayuda a conservar la cerveza.',
  ],
  fermentacion: [
    'La levadura convierte el azúcar en alcohol y gas carbónico: las burbujas de la cerveza son ese gas.',
    'Las levaduras ale trabajan a temperaturas más altas que las lager, que fermentan en frío.',
  ],
};

/** Elige un dato del paso. `aleatorio` (0..1) se pasa de fuera para poder probarlo. */
export function elegirDato(paso: PasoJuego, aleatorio: () => number): string {
  const datos = CURIOSIDADES[paso];
  return datos[Math.min(Math.floor(aleatorio() * datos.length), datos.length - 1)];
}

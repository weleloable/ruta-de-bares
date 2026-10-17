/**
 * La perspectiva de Pulso de Camarero, sin pantalla: donde cae cada obstaculo en
 * el bar visto desde los ojos del camarero. Pseudo-3D con imagenes planas: cada
 * obstaculo es un dibujo que crece al acercarse y el mundo se desliza de lado
 * cuando el camarero gira (parallax). Nada de 3D real.
 *
 * Sin importaciones: los tests lo cargan tal cual. Por eso no importa el modelo: lo
 * que necesita de el (el empuje en `t`, el maximo de la ronda, cuanto se avisa de
 * cada cosa) se le PASA, y el componente y los tests lo sacan de modelo.ts.
 */

/** Lo que esta escena necesita de un `Recorrido` del modelo (mismo molde, sin importarlo). */
export type RecorridoVista = {
  ronda: number;
  esquivas: readonly { t: number; lado: 1 | -1; nitidez: number }[];
  empujones: readonly { t: number; lado: 1 | -1; grados: number }[];
};

/** Con cuanta antelacion (s) se ve cada cosa: son AVISO_ESQUIVA y AVISO_EMPUJON de modelo.ts. */
export type Avisos = { esquiva: number; empujon: number };

/** Donde esta el horizonte (la linea donde la pared del fondo se une con el suelo), como fraccion del alto de la escena. */
export const HORIZONTE = 0.36;
/** Cuanto mas pequeno se ve algo por cada segundo que le falta para llegar (escala = 1 / (1 + z * RAPIDEZ_PERSPECTIVA)). */
export const RAPIDEZ_PERSPECTIVA = 2.2;
/** Cuanto se mueve la camara (en anchos de obstaculo) con el empuje maximo de la ronda. */
export const GIRO_CAMARA = 0.9;
/** Lo que se ve un obstaculo ya pasado antes de salirse por abajo (s). */
export const SALIDA = 0.35;

export type TipoObstaculo = 'cliente' | 'mesa' | 'taburete';

export type Obstaculo = {
  /** Estable de una fotograma a otro (la esquiva o el empujon que lo origina): sirve de `key`. */
  clave: string;
  tipo: TipoObstaculo;
  /** Segundos que le faltan para llegar a la bandeja (negativo: ya paso). */
  z: number;
  /** Donde esta de lado, en anchos de obstaculo: negativo = a la izquierda del camino. */
  lateral: number;
  /** Para elegir cual de los clientes (dibujo) es. */
  variante: number;
  /** Es el cliente que te roza (se ve de reojo y va hacia ti). */
  roce: boolean;
};

/** Escala (1 = en la bandeja) de lo que esta a `z` segundos. */
export function escala(z: number): number {
  return 1 / (1 + Math.max(z, -0.9) * RAPIDEZ_PERSPECTIVA);
}

/**
 * Cuanto se ha desplazado la camara de lado (en anchos de obstaculo) cuando el
 * empuje es `empujeGrados` y el maximo de la ronda `empujeMaximo`. Va con el
 * EMPUJE: el camarero gira a la derecha (la bandeja cae a la izquierda, empuje
 * negativo) y la camara se va a la derecha, asi que el mundo se desliza hacia la
 * izquierda de la pantalla.
 */
export function camara(empujeGrados: number, empujeMaximo: number): number {
  return empujeMaximo > 0 ? (0 - empujeGrados / empujeMaximo) * GIRO_CAMARA : 0;
}

const TIPOS: readonly TipoObstaculo[] = ['cliente', 'mesa', 'cliente', 'taburete', 'cliente'];

/**
 * Lo que hay en pantalla en `t`: las esquivas desde 2 s antes de llegar (el
 * tiempo de ver hacia donde se inclinara la bandeja) hasta que se salen por
 * abajo, y el cliente que roza SOLO los 0,3 s antes del empujon: de reojo, menos
 * de lo que tarda cualquiera en reaccionar. Ordenado de lejos a cerca: se pinta
 * en ese orden y lo cercano tapa lo lejano.
 */
export function obstaculos(rec: RecorridoVista, t: number, avisos: Avisos): Obstaculo[] {
  const lista: Obstaculo[] = [];
  rec.esquivas.forEach((e, i) => {
    const z = e.t - t;
    if (z > avisos.esquiva || z < -SALIDA) return;
    // El obstaculo esta del lado contrario al que se gira: se gira a la derecha para esquivar uno que viene por la izquierda.
    lista.push({
      clave: `e${rec.ronda}-${i}`,
      tipo: TIPOS[(i * 7 + rec.ronda) % TIPOS.length] as TipoObstaculo,
      z,
      lateral: -e.lado * (0.55 + 0.5 * e.nitidez),
      variante: i * 5 + rec.ronda * 3,
      roce: false,
    });
  });
  rec.empujones.forEach((e, i) => {
    const z = e.t - t;
    if (z > avisos.empujon || z < -0.15) return;
    // Entra por el lado del que viene el golpe, hacia el centro.
    lista.push({
      clave: `p${rec.ronda}-${i}`,
      tipo: 'cliente',
      z: Math.max(z, 0.02),
      lateral: e.lado * (0.35 + (2.4 * Math.max(z, 0)) / avisos.empujon),
      variante: i * 11 + rec.ronda,
      roce: true,
    });
  });
  return lista.sort((a, b) => b.z - a.z);
}

export type Marco = { ancho: number; alto: number };
export type Posicion = { x: number; y: number; escala: number };

/**
 * Donde pintar un obstaculo: `x` es su CENTRO, `y` donde apoya los pies, y
 * `escala` multiplica el tamano al que se dibujaria en la bandeja (z = 0).
 */
export function proyectar(o: Pick<Obstaculo, 'z' | 'lateral'>, marco: Marco, camaraX: number, anchoReferencia: number): Posicion {
  const e = escala(o.z);
  const horizonte = marco.alto * HORIZONTE;
  const suelo = marco.alto * 0.985;
  return {
    x: marco.ancho / 2 + (o.lateral - camaraX) * e * anchoReferencia,
    y: horizonte + (suelo - horizonte) * e,
    escala: e,
  };
}

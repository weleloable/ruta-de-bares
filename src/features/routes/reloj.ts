/**
 * Geometria del selector de hora en forma de reloj (RelojHora.tsx). Pura: solo
 * calcula donde va cada numero, para poder probarlo sin pintar nada.
 *
 * Por que un reloj propio y no @react-native-community/datetimepicker: ese
 * paquete es un modulo nativo (obliga a reconstruir el development build) y en
 * web no tiene selector de hora, y esta app se usa sobre todo como PWA.
 *
 * Disposicion de 24 horas en dos anillos, como el reloj de Material:
 *  - exterior: 00 arriba y 13..23 siguiendo las agujas (la tarde-noche, que es
 *    cuando ocurre una ruta de bares, queda en el anillo mas a mano)
 *  - interior: 12 arriba y 1..11
 */

export type MarcaReloj = {
  /** Hora (0-23) o minuto (0-55) que representa. */
  valor: number;
  etiqueta: string;
  /** Centro de la marca, en px desde la esquina superior izquierda del reloj. */
  x: number;
  y: number;
  /** Grados en sentido horario desde las 12 (arriba). */
  angulo: number;
  /** Distancia de la marca al centro del reloj, en px. */
  radio: number;
};

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'HH:MM' con ceros a la izquierda: el formato que espera construirVentana. */
export function componerHora(horas: number, minutos: number): string {
  return `${dosDigitos(horas)}:${dosDigitos(minutos)}`;
}

function marca(valor: number, etiqueta: string, posicion: number, total: number, radio: number, tamano: number): MarcaReloj {
  const angulo = (360 / total) * posicion;
  const rad = (angulo * Math.PI) / 180;
  const centro = tamano / 2;
  return {
    valor,
    etiqueta,
    x: centro + radio * Math.sin(rad),
    y: centro - radio * Math.cos(rad),
    angulo,
    radio,
  };
}

/** Las 24 horas: anillo exterior (00, 13..23) e interior (12, 1..11). */
export function marcasDeHoras(tamano: number, radioExterior: number, radioInterior: number): MarcaReloj[] {
  const marcas: MarcaReloj[] = [];
  for (let i = 0; i < 12; i += 1) {
    const exterior = i === 0 ? 0 : 12 + i;
    const interior = i === 0 ? 12 : i;
    marcas.push(marca(exterior, dosDigitos(exterior), i, 12, radioExterior, tamano));
    marcas.push(marca(interior, String(interior), i, 12, radioInterior, tamano));
  }
  return marcas;
}

/** Los minutos de 5 en 5: 00, 05, ... 55. */
export function marcasDeMinutos(tamano: number, radio: number): MarcaReloj[] {
  return Array.from({ length: 12 }, (_, i) => marca(i * 5, dosDigitos(i * 5), i, 12, radio, tamano));
}

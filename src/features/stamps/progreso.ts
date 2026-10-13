/**
 * La credencial esta completa cuando hay al menos un bar y TODOS tienen sello.
 * Se deduce de los sellos, no se guarda: si se borra uno, deja de estarlo. Una
 * ruta sin bares nunca esta completa (0 de 0 no es haber hecho la ruta).
 */
export function credencialCompleta(conseguidos: number, total: number): boolean {
  return total > 0 && conseguidos === total;
}

export type NivelMedalla = 'bronce' | 'plata' | 'oro';

/**
 * Cuantos sellos hacen falta para cada medalla: MAS de un tercio (bronce), MAS
 * de dos tercios (plata) y todos (oro). "Mas de" y no "al menos": con 14 bares,
 * 14/3 = 4,67 y 5 sellos ya lo superan; 4 no (28,6 %). Enteros, sin decimales:
 * `Math.floor(total / 3) + 1` es el primer entero por encima de total/3, tambien
 * cuando la division es exacta (con 9 bares, 3 sellos son justo un tercio, no mas).
 * Con rutas muy cortas un umbral puede coincidir con el de oro (3 bares: plata a
 * los 3); entonces manda el oro, que se comprueba primero.
 */
export function umbralesMedalla(total: number): { bronce: number; plata: number; oro: number } {
  return {
    bronce: Math.floor(total / 3) + 1,
    plata: Math.floor((2 * total) / 3) + 1,
    oro: total,
  };
}

/**
 * La medalla que toca con estos sellos, o null si todavia no hay ninguna. Como
 * `credencialCompleta`, se deduce de los sellos y no se guarda: si se borra uno,
 * se baja de nivel. Solo la de oro abre el diploma.
 */
export function nivelMedalla(conseguidos: number, total: number): NivelMedalla | null {
  if (credencialCompleta(conseguidos, total)) return 'oro';
  if (total <= 0) return null;
  const { bronce, plata } = umbralesMedalla(total);
  if (conseguidos >= plata) return 'plata';
  if (conseguidos >= bronce) return 'bronce';
  return null;
}

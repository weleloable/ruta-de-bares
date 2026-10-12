/**
 * Aviso de politica nueva (0063). La politica promete avisar en la app si
 * cambia lo que se recoge: al abrirla, quien vio una version mas vieja (o
 * ninguna) ve una vez un resumen de los cambios. Sin importaciones: los tests
 * lo cargan tal cual.
 */

/** Lo que cambio en la ultima version, para el aviso. Se reescribe al subir VERSION_POLITICA. */
export const CAMBIOS_POLITICA: readonly string[] = [
  'Las casas: tus puntos se apuntan con su origen (sellos, consumiciones, encuentros por QR, retos, minijuegos…).',
  'Los sorteos: entras al sellar todos los bares de una ruta con sorteo, y quien gana sale con su nombre. Si no quieres participar, díselo a la organización y te saca.',
  'En ¿Quién quiere ser cervecero? se guarda también tu tiempo, porque desempata.',
  'Quien organiza ve estadísticas de cada ruta, siempre en totales, sin datos de nadie en concreto.',
  'En «Descargar mis datos» sale todo esto también.',
];

/**
 * Que hacer al abrir la app. `vista` es `profiles.politica_vista`: undefined si
 * falta la 0063 (no se avisa), null si nunca se aviso. Quien se dio de alta el
 * dia de la version o despues ya la acepto al registrarse: se marca sin avisar.
 */
export function queHacerConAviso(vista: string | null | undefined, version: string, creadoAt: string): 'nada' | 'marcar' | 'avisar' {
  if (vista === undefined || vista === version) return 'nada';
  if (vista === null && creadoAt.slice(0, 10) >= version) return 'marcar';
  return 'avisar';
}

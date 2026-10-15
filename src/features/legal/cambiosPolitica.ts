/**
 * Aviso de politica nueva (0063). La politica promete avisar en la app si
 * cambia lo que se recoge: al abrirla, quien vio una version mas vieja (o
 * ninguna) ve una vez un resumen de los cambios. Sin importaciones: los tests
 * lo cargan tal cual.
 */

/** Lo que cambio en la ultima version, para el aviso. Se reescribe al subir VERSION_POLITICA. */
export const CAMBIOS_POLITICA: readonly string[] = [
  'Quien administra la app ve el correo de cada cuenta, para saber quién es quién. Nadie más lo ve.',
  'Si quien organiza te sella un bar a mano, se apunta quién lo hizo y por qué, y como posición la del bar.',
  'Quien administra puede borrar una cuenta si se lo pides o si es de prueba; queda apuntado el nombre, el motivo y quién lo hizo.',
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

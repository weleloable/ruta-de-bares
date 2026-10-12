/**
 * Consumiciones (0045): las categorias y las reglas que la pantalla necesita
 * para pintar el boton. Quien decide de verdad es `registrar_consumicion` en
 * el servidor; esto solo evita ofrecer lo que va a decir que no.
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

export type IdCategoria = 'sin_alcohol' | 'tercio' | 'jarra' | 'vino' | 'sidra' | 'chupito' | 'copa';

/** "Sin alcohol" va la primera a proposito: puntua igual y es una categoria mas. */
export const CATEGORIAS: readonly { id: IdCategoria; nombre: string; icono: string }[] = [
  { id: 'sin_alcohol', nombre: 'Sin alcohol', icono: '🥤' },
  { id: 'tercio', nombre: 'Tercio', icono: '🍺' },
  { id: 'jarra', nombre: 'Jarra', icono: '🍻' },
  { id: 'vino', nombre: 'Vino', icono: '🍷' },
  { id: 'sidra', nombre: 'Sidra', icono: '🍏' },
  { id: 'chupito', nombre: 'Chupito', icono: '🥃' },
  { id: 'copa', nombre: 'Copa', icono: '🍸' },
];

export function categoria(id: string) {
  return CATEGORIAS.find((c) => c.id === id) ?? null;
}

/** El bar sellado mas recientemente de la ruta: el unico donde se pueden anadir. */
export function ultimoBarSellado(
  sellos: readonly { route_bar_id: string; stamped_at: string }[],
  baresDeLaRuta: ReadonlySet<string>,
): string | null {
  let ultimo: { route_bar_id: string; stamped_at: string } | null = null;
  for (const s of sellos) {
    if (!baresDeLaRuta.has(s.route_bar_id)) continue;
    if (!ultimo || s.stamped_at > ultimo.stamped_at) ultimo = s;
  }
  return ultimo?.route_bar_id ?? null;
}

/** Cuando se podra anadir la siguiente (null = ya). `minutos` es el de la ruta. */
export function siguientePermitida(
  mias: readonly { created_at: string }[],
  minutos: number,
  ahora: Date,
): Date | null {
  if (mias.length === 0 || minutos <= 0) return null;
  const ultima = mias.reduce((m, c) => (c.created_at > m ? c.created_at : m), mias[0].created_at);
  const siguiente = new Date(new Date(ultima).getTime() + minutos * 60_000);
  return siguiente > ahora ? siguiente : null;
}

/** "23:05" (minutos:segundos) hasta una hora. */
export function mmss(hasta: Date, ahora: Date): string {
  const s = Math.max(0, Math.ceil((hasta.getTime() - ahora.getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const MENSAJES: Record<string, string> = {
  NOT_STAMPED: 'Primero hay que sellar este bar.',
  NOT_LAST_BAR: 'Ya has sellado otro bar: aquí ya no se pueden añadir.',
  TOO_SOON: 'Aún no ha pasado el tiempo mínimo entre consumiciones.',
  INVALID_CATEGORY: 'Esa categoría no existe.',
  SUSPENDED: 'Tu cuenta está suspendida.',
  FORBIDDEN: 'Solo puede hacerlo quien está en la ruta.',
};

export function describirErrorConsumicion(mensaje: string): string {
  const codigo = Object.keys(MENSAJES).find((c) => new RegExp(`\\b${c}\\b`).test(mensaje));
  if (codigo) return MENSAJES[codigo];
  if (/PGRST202|Could not find the function/i.test(mensaje)) return 'Falta aplicar la migración 0045 en Supabase.';
  return mensaje || 'No se pudo apuntar.';
}

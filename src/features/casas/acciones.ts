/**
 * Las acciones que dan puntos, con su nombre para el panel (0048), y lo que se
 * lee de cada movimiento. Sin importaciones: los tests lo cargan tal cual.
 */

export const ACCIONES: readonly { id: string; nombre: string }[] = [
  { id: 'sello', nombre: 'Sello' },
  { id: 'consumicion', nombre: 'Consumición' },
  { id: 'categoria_nueva', nombre: 'Categoría nueva' },
  { id: 'ruta_completa', nombre: 'Ruta completa' },
  { id: 'podio_1', nombre: '1.º en minijuego' },
  { id: 'podio_2', nombre: '2.º en minijuego' },
  { id: 'podio_3', nombre: '3.º en minijuego' },
  { id: 'racha', nombre: 'Racha de casa' },
  { id: 'qr', nombre: 'Encuentro QR' },
  { id: 'reto', nombre: 'Reto' },
  { id: 'ajuste', nombre: 'Ajuste manual' },
];

export function nombreAccion(id: string): string {
  return ACCIONES.find((a) => a.id === id)?.nombre ?? id;
}

/** Lo que aclara un movimiento: el reto, el motivo del ajuste, cuantos en la racha... */
export function detalleMovimiento(m: { action: string; detail: unknown }): string | null {
  const d = (m.detail ?? {}) as { nombre?: string; motivo?: string; usuarios?: unknown[] };
  if (m.action === 'reto' && d.nombre) return d.nombre;
  if (m.action === 'ajuste' && d.motivo) return d.motivo;
  if ((m.action === 'racha' || m.action === 'qr') && Array.isArray(d.usuarios)) return `${d.usuarios.length} personas`;
  return null;
}

/** Puntos de un ajuste a mano: entero, distinto de 0, como mucho ±1000. */
export function leerPuntosAjuste(texto: string): number | null {
  const t = texto.trim().replace(/^\+/, '');
  if (!/^-?\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n !== 0 && Math.abs(n) <= 1000 ? n : null;
}

const ERRORES: Record<string, string> = {
  REASON_REQUIRED: 'Escribe el motivo (al menos 3 letras).',
  INVALID_HOUSE: 'Esa casa no existe.',
  INVALID_POINTS: 'Los puntos no son válidos.',
  NOT_FOUND: 'Ya no existe (o ya estaba anulado).',
  FORBIDDEN: 'Solo para administradores.',
};

export function describirErrorPanel(mensaje: string): string {
  const c = Object.keys(ERRORES).find((k) => new RegExp(`\\b${k}\\b`).test(mensaje));
  if (c) return ERRORES[c];
  if (/PGRST202|Could not find the function/i.test(mensaje)) return 'Falta aplicar la migración 0048 en Supabase.';
  return mensaje;
}

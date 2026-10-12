/**
 * Sorteo de la ruta (0061): el banner de Sellos, la ruleta y los errores. Quien
 * sortea de verdad es el servidor (`sorteo_realizar`); la ruleta es teatro que
 * se para en el ganador que ya eligio. Sin importaciones: los tests lo cargan tal cual.
 */

export type EstadoSorteo = {
  activo: boolean;
  premio: string;
  bares: number;
  participantes: number;
  dentro: boolean;
  resultado: {
    premio: string;
    ganador: string | null;
    soy_ganador: boolean;
    suplentes: string[];
    participantes: number;
    realizado_at: string;
  } | null;
};

export type ResultadoSorteo = { ganador: string; suplentes: string[]; participantes: number; nombres: string[] };

const premioDe = (e: Pick<EstadoSorteo, 'premio'>) => (e.premio.trim() ? e.premio.trim() : 'un premio');

/** Lo que dice el banner de Sellos, o null si no hay sorteo en la ruta. */
export function textoBanner(e: EstadoSorteo): { icono: string; titulo: string; cuerpo: string; destacado: boolean } | null {
  if (e.resultado) {
    const r = e.resultado;
    if (r.soy_ganador) {
      return { icono: '🎉', titulo: '¡Has ganado el sorteo!', cuerpo: `Te llevas ${r.premio}. Busca a la organización.`, destacado: true };
    }
    return {
      icono: '🎽',
      titulo: `Sorteo de ${r.premio}`,
      cuerpo: `Ha ganado ${r.ganador ?? 'alguien que ya no está en la app'}${
        r.suplentes.length > 0 ? ` (suplentes: ${r.suplentes.join(', ')})` : ''
      }. Entre ${r.participantes} ${r.participantes === 1 ? 'participante' : 'participantes'}.`,
      destacado: false,
    };
  }
  if (!e.activo) return null;
  const todos = e.bares === 1 ? 'el bar' : `los ${e.bares} bares`;
  return {
    icono: '🎽',
    titulo: `Sorteamos ${premioDe(e)}`,
    cuerpo: e.dentro
      ? `¡Ya estás dentro! Has sellado ${todos}. ${e.participantes === 1 ? 'Eres la única persona' : `Sois ${e.participantes}`} en el sorteo.`
      : `Entre todas las personas que sellen ${todos} de la ruta.`,
    destacado: e.dentro,
  };
}

/**
 * Los pasos de la ruleta: nombres que van pasando cada vez mas despacio hasta
 * pararse en el ganador. `azar` en [0, 1) (Math.random en la app). Con un solo
 * nombre, la ruleta es corta pero tambien se para en el.
 */
export function pasosRuleta(nombres: readonly string[], ganador: string, azar: () => number, pasos = 28): { nombre: string; ms: number }[] {
  const lista = nombres.length > 0 ? nombres : [ganador];
  const salida: { nombre: string; ms: number }[] = [];
  let anterior = '';
  for (let i = 0; i < pasos - 1; i++) {
    // Al principio rapido (60 ms) y frenando hasta ~420 ms.
    const ms = Math.round(60 + 360 * Math.pow(i / (pasos - 1), 2.2));
    let nombre = lista[Math.floor(azar() * lista.length)]!;
    // Que no se repita el mismo dos veces seguidas si hay donde elegir.
    if (lista.length > 1 && nombre === anterior) nombre = lista[(lista.indexOf(nombre) + 1) % lista.length]!;
    salida.push({ nombre, ms });
    anterior = nombre;
  }
  salida.push({ nombre: ganador, ms: 700 });
  return salida;
}

const ERRORES: Record<string, string> = {
  SORTEO_INACTIVO: 'Activa el sorteo de la ruta antes de hacerlo.',
  ALREADY_DRAWN: 'El sorteo ya está hecho. Para repetirlo, escribe el motivo.',
  REASON_REQUIRED: 'Escribe por qué se repite el sorteo (al menos 3 letras).',
  NO_PARTICIPANTS: 'Todavía nadie ha sellado todos los bares: no hay a quién sortear.',
  FORBIDDEN: 'Solo para administradores.',
};

export function describirErrorSorteo(mensaje: string): string {
  const c = Object.keys(ERRORES).find((k) => new RegExp(`\\b${k}\\b`).test(mensaje));
  if (c) return ERRORES[c]!;
  if (/PGRST202|Could not find the function/i.test(mensaje)) return 'Falta aplicar la migración 0061 en Supabase.';
  return mensaje || 'No se pudo hacer el sorteo.';
}

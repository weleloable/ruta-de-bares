/**
 * Lo que completa Estadisticas (0059): el reparto de las casas, la auditoria
 * de una ruta y la vista de todas las rutas (o de una temporada). Solo totales.
 * Sin importaciones de ejecucion (se prueba con node --test).
 */

const porcentaje = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

const NOMBRES_CASA: Record<string, string> = { mahou: 'Mahou', cruzcampo: 'Cruzcampo', estrella: 'Estrella Galicia', alhambra: 'Alhambra' };
export const nombreCasa = (h: string) => NOMBRES_CASA[h] ?? h;

// ---------------------------------------------------------------------------
// Casas
// ---------------------------------------------------------------------------
/** Lo que devuelve `casas_admin_estadisticas` (0048) de cada casa. */
export type CasaDatos = { house: string; miembros: number; puntos: number };

export type RepartoCasas = {
  filas: { house: string; nombre: string; miembros: number; pctGente: number; puntos: number; pctPuntos: number }[];
  /** Una frase sobre si las casas salieron igualadas. */
  equilibrio: string;
};

export function repartoCasas(casas: readonly CasaDatos[]): RepartoCasas {
  const gente = casas.reduce((s, c) => s + c.miembros, 0);
  const puntos = casas.reduce((s, c) => s + Math.max(0, c.puntos), 0);
  const filas = [...casas]
    .sort((a, b) => b.miembros - a.miembros || b.puntos - a.puntos)
    .map((c) => ({
      house: c.house,
      nombre: nombreCasa(c.house),
      miembros: c.miembros,
      pctGente: porcentaje(c.miembros, gente),
      puntos: c.puntos,
      pctPuntos: porcentaje(Math.max(0, c.puntos), puntos),
    }));
  let equilibrio = 'Todavía no hay nadie repartido en casas.';
  if (gente > 0 && filas.length > 0) {
    const mas = filas[0]!;
    const menos = filas[filas.length - 1]!;
    const dif = mas.miembros - menos.miembros;
    equilibrio =
      dif <= 1
        ? 'Reparto igualado: la diferencia entre la casa con más gente y la que menos tiene es de una persona como mucho.'
        : `Hay ${dif} personas de diferencia entre ${mas.nombre} (${mas.miembros}) y ${menos.nombre} (${menos.miembros}).`;
  }
  return { filas, equilibrio };
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------
export type AuditoriaRuta = {
  anulados: { n: number; puntos: number; motivos: { motivo: string; n: number }[] };
  ajustes: { n: number; puntos: number };
  cambios_casa: number;
};

const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Las frases de la seccion de auditoria. */
export function resumenAuditoria(a: AuditoriaRuta) {
  return {
    anulados: `${a.anulados.n} ${plural(a.anulados.n, 'movimiento anulado', 'movimientos anulados')}${a.anulados.n > 0 ? ` (${a.anulados.puntos} puntos)` : ''}`,
    ajustes: `${a.ajustes.n} ${plural(a.ajustes.n, 'ajuste a mano', 'ajustes a mano')}${a.ajustes.n > 0 ? `, efecto neto ${conSigno(a.ajustes.puntos)}` : ''}`,
    cambios: `${a.cambios_casa} ${plural(a.cambios_casa, 'cambio de casa', 'cambios de casa')}`,
    hayAlgo: a.anulados.n + a.ajustes.n + a.cambios_casa > 0,
    motivos: a.anulados.motivos,
  };
}

// ---------------------------------------------------------------------------
// Todas las rutas
// ---------------------------------------------------------------------------
export type GlobalRutas = {
  totales: { rutas: number; personas: number; sellos: number; consumiciones: number; encuentros: number; retos: number };
  rutas: {
    nombre: string;
    fecha: string | null;
    personas: number;
    bares: number;
    sellos: number;
    completaron: number;
    consumiciones: number;
    cerrada: boolean;
    ganadoras: string[];
  }[];
};

export type FilaRutaGlobal = {
  nombre: string;
  fecha: string;
  pctSellos: number;
  completaron: string;
  consumiciones: number;
  cierre: string;
};

/** Una fila por ruta para compararlas: barra de sellos (la mayor = 100) y quien completo. */
export function filasGlobal(g: GlobalRutas): FilaRutaGlobal[] {
  const maximo = Math.max(0, ...g.rutas.map((r) => r.sellos));
  return g.rutas.map((r) => ({
    nombre: r.nombre,
    fecha: r.fecha ? new Date(`${r.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'sin fecha',
    pctSellos: porcentaje(r.sellos, maximo),
    completaron: `${r.completaron} de ${r.personas} completaron`,
    consumiciones: r.consumiciones,
    cierre: r.cerrada ? (r.ganadoras.length > 0 ? `Ganó ${r.ganadoras.map(nombreCasa).join(' y ')}` : 'Cerrada, sin ganadora') : 'Sin cerrar',
  }));
}

// ---------------------------------------------------------------------------
// CSV: lo que se anade al resumen de una ruta
// ---------------------------------------------------------------------------
function celda(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Las lineas "seccion;dato;valor" de casas y auditoria, para pegar al final del CSV. */
export function lineasCsvExtra(casas: readonly CasaDatos[] | null, auditoria: AuditoriaRuta | null): string[] {
  const f: [string, string, string | number][] = [];
  for (const c of casas ?? []) {
    f.push(['Casas', `${nombreCasa(c.house)}: personas`, c.miembros], ['Casas', `${nombreCasa(c.house)}: puntos`, c.puntos]);
  }
  if (auditoria) {
    f.push(['Auditoría', 'Movimientos anulados', auditoria.anulados.n], ['Auditoría', 'Puntos anulados', auditoria.anulados.puntos]);
    f.push(['Auditoría', 'Ajustes a mano', auditoria.ajustes.n], ['Auditoría', 'Efecto neto de los ajustes', auditoria.ajustes.puntos]);
    f.push(['Auditoría', 'Cambios de casa', auditoria.cambios_casa]);
    for (const m of auditoria.anulados.motivos) f.push(['Auditoría', `Motivo: ${m.motivo}`, m.n]);
  }
  return f.map((x) => x.map(celda).join(';'));
}

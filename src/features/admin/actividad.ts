/**
 * De los numeros de `admin_estadisticas_actividad` (0058) a lo que pinta la
 * pantalla de Estadisticas: participacion, bares, horas, consumiciones,
 * minijuegos, retos y QR; y el resumen en CSV de la ruta.
 *
 * Solo totales de la ruta, nunca nada por persona (ver 0037 y 0058). Sin
 * importaciones de ejecucion (se prueba con node --test).
 */

import type { EstadisticasRuta } from './estadisticas';

export type ActividadRuta = {
  participacion: {
    personas: number;
    sellaron: number;
    consumieron: number;
    qr: number;
    jugaron: number;
    cana: number;
    retos: number;
    activos_30min: number;
  };
  bares: { nombre: string; sellos: number }[];
  horas: { hora: string; sellos: number }[];
  consumiciones: { total: number; puntuan: number; personas: number; por_categoria: Record<string, number> };
  juegos: { juego: string; jugadores: number; mejor: number | null }[];
  retos: { nombre: string; activo: boolean; puntos: number; plazas: number | null; conseguidos: number }[];
  qr: { encuentros: number; puntuan: number };
};

/** Parte sobre total, en %, sin decimales; 0 si no hay base. */
export function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const coma = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

// ---------------------------------------------------------------------------
// Participacion
// ---------------------------------------------------------------------------
export type FilaParticipacion = { id: string; titulo: string; valor: number; pct: number };

/** Cuanta gente de la ruta ha usado cada cosa. */
export function filasParticipacion(a: ActividadRuta): FilaParticipacion[] {
  const p = a.participacion;
  const fila = (id: string, titulo: string, valor: number): FilaParticipacion => ({ id, titulo, valor, pct: porcentaje(valor, p.personas) });
  return [
    fila('sellaron', 'Han sellado', p.sellaron),
    fila('consumieron', 'Han apuntado consumiciones', p.consumieron),
    fila('qr', 'Han hecho un encuentro QR', p.qr),
    fila('jugaron', 'Han jugado a un minijuego', p.jugaron),
    fila('cana', 'Tienen La Caña activada', p.cana),
    fila('retos', 'Han conseguido un reto', p.retos),
  ];
}

// ---------------------------------------------------------------------------
// Bares
// ---------------------------------------------------------------------------
export type FilaBar = { nombre: string; sellos: number; pct: number };

export function filasBares(a: ActividadRuta): { filas: FilaBar[]; resumen: string[] } {
  const maximo = Math.max(0, ...a.bares.map((b) => b.sellos));
  const filas = a.bares.map((b) => ({ nombre: b.nombre, sellos: b.sellos, pct: porcentaje(b.sellos, maximo) }));
  const resumen: string[] = [];
  if (a.bares.length > 0 && maximo > 0) {
    const mas = a.bares.reduce((m, b) => (b.sellos > m.sellos ? b : m));
    const menos = a.bares.reduce((m, b) => (b.sellos < m.sellos ? b : m));
    resumen.push(`Más sellado: ${mas.nombre} (${mas.sellos}).`);
    if (a.bares.length > 1 && menos.sellos < mas.sellos) resumen.push(`Menos sellado: ${menos.nombre} (${menos.sellos}).`);
    const primero = a.bares[0]!.sellos;
    const ultimo = a.bares[a.bares.length - 1]!.sellos;
    if (a.bares.length > 1 && primero > 0) {
      resumen.push(`De cada 10 personas que sellan el primer bar, ${Math.round((10 * ultimo) / primero)} sellan el último.`);
    }
  }
  return { filas, resumen };
}

// ---------------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------------
export type FilaHora = { etiqueta: string; sellos: number; pct: number; pico: boolean };

const HORA_MS = 3_600_000;

/** Sellos por hora (hora local), sin huecos entre la primera y la ultima. */
export function filasHoras(a: ActividadRuta): FilaHora[] {
  if (a.horas.length === 0) return [];
  const porHora = new Map(a.horas.map((h) => [new Date(h.hora).getTime(), h.sellos]));
  const tiempos = [...porHora.keys()];
  const desde = Math.min(...tiempos);
  const hasta = Math.max(...tiempos);
  const maximo = Math.max(...porHora.values());
  const filas: FilaHora[] = [];
  for (let t = desde; t <= hasta; t += HORA_MS) {
    const sellos = porHora.get(t) ?? 0;
    filas.push({
      etiqueta: `${String(new Date(t).getHours()).padStart(2, '0')}:00`,
      sellos,
      pct: porcentaje(sellos, maximo),
      pico: sellos === maximo && maximo > 0,
    });
  }
  return filas;
}

// ---------------------------------------------------------------------------
// Consumiciones
// ---------------------------------------------------------------------------
const CATEGORIAS: [string, string][] = [
  ['tercio', 'Tercio'],
  ['jarra', 'Jarra'],
  ['vino', 'Vino'],
  ['sidra', 'Sidra'],
  ['chupito', 'Chupito'],
  ['copa', 'Copa'],
  ['sin_alcohol', 'Sin alcohol'],
];

export type ResumenConsumo = {
  total: number;
  media: string;
  sinAlcoholPct: number;
  puntuanPct: number;
  sinPuntos: number;
  categorias: { id: string; nombre: string; n: number; pct: number }[];
};

export function resumenConsumo(a: ActividadRuta): ResumenConsumo {
  const c = a.consumiciones;
  return {
    total: c.total,
    media: c.personas > 0 ? coma(c.total / c.personas) : '0',
    sinAlcoholPct: porcentaje(c.por_categoria.sin_alcohol ?? 0, c.total),
    puntuanPct: porcentaje(c.puntuan, c.total),
    sinPuntos: c.total - c.puntuan,
    categorias: CATEGORIAS.map(([id, nombre]) => ({
      id,
      nombre,
      n: c.por_categoria[id] ?? 0,
      pct: porcentaje(c.por_categoria[id] ?? 0, c.total),
    })),
  };
}

// ---------------------------------------------------------------------------
// Minijuegos, retos y QR
// ---------------------------------------------------------------------------
/** Los nombres de los juegos (copia de los de casas/procedencia: aqui no se importan). */
const JUEGOS: Record<string, string> = {
  'cana-perfecta': 'La Caña Perfecta',
  'maestro-cervecero': 'Maestro Cervecero',
  'conga-cervecera': 'La Conga Cervecera',
  'conduces-tu': '¿Conduces tú?',
  'quien-quiere-ser-cervecero': '¿Quién quiere ser cervecero?',
  'tapon-al-vuelo': 'Tapón al Vuelo',
};

export function filasJuegos(a: ActividadRuta) {
  return a.juegos.map((j) => ({
    nombre: JUEGOS[j.juego] ?? j.juego,
    jugadores: j.jugadores,
    pct: porcentaje(j.jugadores, a.participacion.personas),
    mejor: j.mejor,
  }));
}

export type FilaReto = { nombre: string; activo: boolean; conseguidos: number; texto: string; sinNadie: boolean };

export function filasRetos(a: ActividadRuta): FilaReto[] {
  return a.retos.map((r) => ({
    nombre: r.nombre,
    activo: r.activo,
    conseguidos: r.conseguidos,
    sinNadie: r.activo && r.conseguidos === 0,
    texto:
      r.plazas === null
        ? `${r.conseguidos} ${plural(r.conseguidos, 'persona', 'personas')}`
        : `${r.conseguidos} de ${r.plazas} ${plural(r.plazas, 'plaza', 'plazas')}`,
  }));
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function celda(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * El resumen de la ruta en CSV (separado por ";" para que Excel en espanol lo
 * abra bien): seccion, dato, valor. Todo son totales de la ruta.
 */
export function resumenCsv(nombreRuta: string, general: EstadisticasRuta, a: ActividadRuta, ahora: Date): string {
  const f: [string, string, string | number][] = [];
  f.push(['Ruta', 'Nombre', nombreRuta]);
  f.push(['Ruta', 'Generado', ahora.toISOString()]);
  const r = general.ruta;
  f.push(['La ruta', 'Personas', r.personas], ['La ruta', 'Bares', r.bares], ['La ruta', 'Sellos', r.sellos]);
  f.push(['La ruta', 'Han sellado', r.han_sellado], ['La ruta', 'Completaron', r.completaron]);
  const c = general.cana;
  f.push(['La Caña', 'Activada', c.activada], ['La Caña', 'Me gusta', c.me_gusta], ['La Caña', 'Conexiones', c.conexiones]);
  f.push(['La Caña', 'Preguntas', c.preguntas], ['La Caña', 'Sí a la caña', c.si]);
  f.push(['Moderación', 'Denuncias', general.moderacion.denuncias], ['Moderación', 'Vetos', general.moderacion.vetos]);
  for (const p of filasParticipacion(a)) f.push(['Participación', p.titulo, p.valor], ['Participación', `${p.titulo} (%)`, p.pct]);
  f.push(['Participación', 'Activos en los últimos 30 min', a.participacion.activos_30min]);
  for (const b of a.bares) f.push(['Bares', b.nombre, b.sellos]);
  for (const h of filasHoras(a)) f.push(['Sellos por hora', h.etiqueta, h.sellos]);
  const k = resumenConsumo(a);
  f.push(['Consumiciones', 'Total', k.total], ['Consumiciones', 'Que puntúan', a.consumiciones.puntuan]);
  for (const cat of k.categorias) f.push(['Consumiciones', cat.nombre, cat.n]);
  for (const j of filasJuegos(a)) f.push(['Minijuegos', `${j.nombre}: jugadores`, j.jugadores]);
  for (const t of filasRetos(a)) f.push(['Retos', t.nombre, t.conseguidos]);
  f.push(['QR', 'Encuentros', a.qr.encuentros], ['QR', 'Que puntúan', a.qr.puntuan]);
  return ['Sección;Dato;Valor', ...f.map((x) => x.map(celda).join(';'))].join('\r\n');
}

/** Un nombre de fichero seguro para el CSV: "resumen-ruta-de-las-fiestas-2026-10-17.csv". */
export function nombreFicheroCsv(nombreRuta: string, ahora: Date): string {
  const base = nombreRuta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const dia = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  return `resumen-${base || 'ruta'}-${dia}.csv`;
}

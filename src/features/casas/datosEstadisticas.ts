/**
 * Estadisticas de las casas (0057): de donde sacan sus puntos y que casa
 * destaca en que. Todo "por persona" para que una casa mas numerosa no gane
 * solo por tener mas gente. Sin importaciones de ejecucion: los tests lo
 * cargan tal cual.
 */

export type FilaEstadistica = {
  house: string;
  miembros: number;
  sellos: number;
  consumiciones: number;
  p_sellos: number;
  p_consumo: number;
  p_juegos: number;
  p_social: number;
  p_otros: number;
};

export type Origen = { id: 'sellos' | 'consumo' | 'juegos' | 'social' | 'otros'; nombre: string; puntos: number };

/** Los cinco origenes de los puntos de una casa, en orden fijo. */
export function origenes(f: FilaEstadistica): Origen[] {
  return [
    { id: 'sellos', nombre: 'Sellos', puntos: f.p_sellos },
    { id: 'consumo', nombre: 'Consumiciones', puntos: f.p_consumo },
    { id: 'juegos', nombre: 'Minijuegos', puntos: f.p_juegos },
    { id: 'social', nombre: 'Social', puntos: f.p_social },
    { id: 'otros', nombre: 'Retos y otros', puntos: f.p_otros },
  ];
}

/** El origen que mas pesa en una casa (null si no tiene puntos). */
export function origenPrincipal(f: FilaEstadistica): Origen | null {
  const total = origenes(f).reduce((s, o) => s + Math.max(0, o.puntos), 0);
  if (total <= 0) return null;
  return origenes(f).reduce((mejor, o) => (o.puntos > mejor.puntos ? o : mejor));
}

export type Destacada = {
  id: 'jugona' | 'sociable' | 'andariega' | 'catadora';
  icono: string;
  titulo: string;
  /** Lo que se mide, para la explicacion bajo el titulo. */
  explicacion: string;
  /** Las casas que lo ganan (mas de una si empatan); vacio si nadie tiene nada. */
  casas: string[];
  /** Valor por persona de la ganadora, o null si no hay ganadora. */
  valor: number | null;
  unidad: string;
};

const DEFINICIONES: {
  id: Destacada['id'];
  icono: string;
  titulo: string;
  explicacion: string;
  unidad: string;
  medida: (f: FilaEstadistica) => number;
}[] = [
  { id: 'jugona', icono: '🎮', titulo: 'La más jugona', explicacion: 'Puntos de los podios de minijuegos', unidad: 'pts por persona', medida: (f) => f.p_juegos },
  { id: 'sociable', icono: '🤝', titulo: 'La más sociable', explicacion: 'Puntos de encuentros QR y rachas', unidad: 'pts por persona', medida: (f) => f.p_social },
  { id: 'andariega', icono: '🚶', titulo: 'La más andariega', explicacion: 'Sellos conseguidos', unidad: 'sellos por persona', medida: (f) => f.sellos },
  { id: 'catadora', icono: '🍺', titulo: 'La más catadora', explicacion: 'Consumiciones apuntadas, con y sin alcohol', unidad: 'consumiciones por persona', medida: (f) => f.consumiciones },
];

const redondea = (v: number) => Math.round(v * 100) / 100;

/** Que casa destaca en cada cosa, en proporcion a su gente. */
export function destacadas(filas: readonly FilaEstadistica[]): Destacada[] {
  return DEFINICIONES.map((d) => {
    const valores = filas
      .filter((f) => f.miembros > 0)
      .map((f) => ({ house: f.house, v: redondea(d.medida(f) / f.miembros) }));
    const maximo = Math.max(0, ...valores.map((x) => x.v));
    const ganadoras = maximo > 0 ? valores.filter((x) => x.v === maximo).map((x) => x.house) : [];
    return {
      id: d.id,
      icono: d.icono,
      titulo: d.titulo,
      explicacion: d.explicacion,
      unidad: d.unidad,
      casas: ganadoras,
      valor: ganadoras.length > 0 ? maximo : null,
    };
  });
}

/**
 * De los numeros de `admin_estadisticas_ruta` (0037) a lo que pinta la
 * pantalla de Estadisticas: secciones de baldosas, cada una con su cifra y una
 * linea de contexto ("85 % de la ruta", "88 siguen abiertas").
 *
 * Solo totales de la ruta, nunca nada por persona: la politica promete que a
 * quien das Me gusta no lo ve nadie, tampoco quien organiza. Sin imports (se
 * prueba con node --test).
 */

export type EstadisticasRuta = {
  ruta: { personas: number; bares: number; sellos: number; han_sellado: number; completaron: number };
  cana: {
    activada: number;
    me_gusta: number;
    conexiones: number;
    conexiones_abiertas: number;
    preguntas: number;
    si: number;
  };
  /** PERSONAS en cada paso de La Caña. Opcional: una base sin esta version no lo trae. */
  embudo?: { en_la_ruta: number; la_activaron: number; con_conexion: number; preguntaron: number; con_un_si: number };
  /** Como acabo la pregunta de la cerveza, por conexion. */
  pregunta?: { si: number; mas_tarde: number; no: number; sin_contestar: number };
  etiquetas: { etiqueta: string; veces: number }[];
  moderacion: { denuncias: number; denuncias_sin_cerrar: number; vetos: number };
};

/** Una fila con barra: cuanto, y que parte del total (0 a 1) ocupa la barra. */
export type FilaBarra = { titulo: string; valor: number; proporcion: number; destacada?: boolean };

export type Baldosa = { valor: number; titulo: string; detalle: string };
export type SeccionEstadisticas = { titulo: string; baldosas: Baldosa[] };

/** "85 %" sin decimales; 0 si no hay base, en vez de NaN. */
function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function seccionesEstadisticas(e: EstadisticasRuta): SeccionEstadisticas[] {
  const { ruta, cana, moderacion } = e;
  const posibles = ruta.personas * ruta.bares;
  return [
    {
      titulo: 'La ruta',
      baldosas: [
        { valor: ruta.personas, titulo: plural(ruta.personas, 'Persona', 'Personas'), detalle: 'en la ruta' },
        {
          valor: ruta.sellos,
          titulo: plural(ruta.sellos, 'Sello', 'Sellos'),
          detalle: ruta.bares === 0 ? 'la ruta no tiene bares' : `de ${posibles} posibles`,
        },
        { valor: ruta.han_sellado, titulo: 'Han sellado', detalle: 'al menos un bar' },
        {
          valor: ruta.completaron,
          titulo: 'Completaron',
          detalle: ruta.bares === 0 ? 'no hay bares' : ruta.bares === 1 ? 'el único bar' : `los ${ruta.bares} bares`,
        },
      ],
    },
    {
      titulo: 'La Caña',
      baldosas: [
        {
          valor: cana.activada,
          titulo: 'La tienen activada',
          detalle: `${porcentaje(cana.activada, ruta.personas)} % de la ruta`,
        },
        {
          valor: cana.me_gusta,
          titulo: 'Me gusta',
          detalle:
            cana.activada > 0 ? `${Math.round(cana.me_gusta / cana.activada)} por persona` : 'nadie la tiene activada',
        },
        {
          valor: cana.conexiones,
          titulo: plural(cana.conexiones, 'Conexión', 'Conexiones'),
          detalle: `${cana.conexiones_abiertas} ${plural(cana.conexiones_abiertas, 'sigue abierta', 'siguen abiertas')}`,
        },
        {
          valor: cana.si,
          titulo: 'Sí a la caña',
          detalle: `de ${cana.preguntas} ${plural(cana.preguntas, 'pregunta', 'preguntas')}`,
        },
      ],
    },
    {
      titulo: 'Moderación',
      baldosas: [
        {
          valor: moderacion.denuncias,
          titulo: plural(moderacion.denuncias, 'Denuncia', 'Denuncias'),
          detalle: `${moderacion.denuncias_sin_cerrar} sin cerrar`,
        },
        {
          valor: moderacion.vetos,
          titulo: plural(moderacion.vetos, 'Veto', 'Vetos'),
          detalle: plural(moderacion.vetos, 'puesto en esta ruta', 'puestos en esta ruta'),
        },
      ],
    },
  ];
}

/** 0..1 para el ancho de una barra; 0 si no hay base, nunca mas de 1. */
function proporcion(parte: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, parte / total)) : 0;
}

/**
 * El embudo de La Caña: cuanta gente llega a cada paso. La barra de cada paso
 * es respecto a la gente de la ruta, asi se ve de un vistazo donde se para.
 */
export function embudoCana(e: EstadisticasRuta): FilaBarra[] {
  const x = e.embudo;
  if (!x) return [];
  const total = x.en_la_ruta;
  return [
    { titulo: 'En la ruta', valor: x.en_la_ruta, proporcion: proporcion(x.en_la_ruta, total) },
    { titulo: 'La activaron', valor: x.la_activaron, proporcion: proporcion(x.la_activaron, total) },
    { titulo: 'Hicieron conexión', valor: x.con_conexion, proporcion: proporcion(x.con_conexion, total) },
    { titulo: 'Preguntaron', valor: x.preguntaron, proporcion: proporcion(x.preguntaron, total) },
    { titulo: 'Tuvieron un sí', valor: x.con_un_si, proporcion: proporcion(x.con_un_si, total), destacada: true },
  ];
}

/**
 * Como acaba la pregunta de la cerveza. La barra es respecto a las preguntas
 * hechas; `porcentaje` es lo que se lee al lado.
 */
export function resultadoPregunta(e: EstadisticasRuta): (FilaBarra & { porcentaje: number })[] {
  const x = e.pregunta;
  if (!x) return [];
  const total = x.si + x.mas_tarde + x.no + x.sin_contestar;
  const fila = (titulo: string, valor: number, destacada = false) => ({
    titulo,
    valor,
    proporcion: proporcion(valor, total),
    porcentaje: porcentaje(valor, total),
    destacada,
  });
  return [
    fila('Sí', x.si, true),
    fila('Más tarde', x.mas_tarde),
    fila('No', x.no),
    fila('Sin contestar', x.sin_contestar),
  ];
}

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
  etiquetas: { etiqueta: string; veces: number }[];
  moderacion: { denuncias: number; denuncias_sin_cerrar: number; vetos: number };
};

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

/**
 * "Como conseguir puntos" (el desplegable de Casas): el texto de cada
 * forma de puntuar, con los valores REALES (los que un admin puede cambiar) y
 * los limites de la ruta. Sin importaciones: los tests lo cargan tal cual.
 */

export type LimitesRuta = {
  consumo_minutos: number;
  consumo_por_bar: number;
  consumo_por_ruta: number;
  variedad_max: number;
  qr_max: number;
  racha_repetible: boolean;
};

export type ReglaInfo = { icono: string; titulo: string; puntos: string | null; texto: string };

const n = (v: number, uno: string, varios: string) => `${v} ${v === 1 ? uno : varios}`;
const mas = (v: number | undefined) => (v === undefined ? null : `+${v}`);

/** Las formas de ganar puntos, con `puntos` por accion (null si no se pudo leer). */
export function reglasInfo(puntos: Readonly<Record<string, number>>, r: LimitesRuta): ReglaInfo[] {
  const p = (a: string) => puntos[a];
  const espera = r.consumo_minutos > 0 ? ` Espera: ${r.consumo_minutos} min.` : '';
  return [
    {
      icono: '📍',
      titulo: 'Sellar un bar',
      puntos: mas(p('sello')),
      texto: 'Un sello por bar de la ruta.',
    },
    {
      icono: '🏁',
      titulo: 'Completar la ruta',
      puntos: mas(p('ruta_completa')),
      texto: 'Sella todos los bares. Una vez por ruta.',
    },
    {
      icono: '🥤',
      titulo: 'Consumición',
      puntos: mas(p('consumicion')),
      texto: r.consumo_por_bar === 0 || r.consumo_por_ruta === 0
        ? 'No puntúa en esta ruta.'
        : `En el último bar sellado: hasta ${r.consumo_por_bar} por bar y ${r.consumo_por_ruta} por ruta.${espera} Sin alcohol puntúa igual.`,
    },
    {
      icono: '🎨',
      titulo: 'Categoría nueva',
      puntos: mas(p('categoria_nueva')),
      texto:
        `La primera de cada tipo de bebida. Hasta ${n(r.variedad_max, 'vez', 'veces')} por ruta.`,
    },
    {
      icono: '🏆',
      titulo: 'Podio de los minijuegos',
      puntos: p('podio_1') === undefined ? null : `${p('podio_1')} · ${p('podio_2') ?? '?'} · ${p('podio_3') ?? '?'}`,
      texto:
        'Según el puesto actual en cada juego: 1.º, 2.º y 3.º.',
    },
    {
      icono: '🍻',
      titulo: 'Racha de casa',
      puntos: mas(p('racha')),
      texto:
        '3 personas distintas de tu casa sellando seguidas en un bar. Puntos repartidos. ' +
        (r.racha_repetible ? 'Puede repetirse.' : 'Una vez por casa y bar.'),
    },
    {
      icono: '🤝',
      titulo: 'Encuentro por QR',
      puntos: mas(p('qr')),
      texto:
        `Con alguien de tu casa, una vez por pareja. Hasta ${n(r.qr_max, 'encuentro', 'encuentros')} por persona y ruta. Puntos a medias.`,
    },
    {
      icono: '🎯',
      titulo: 'Retos',
      puntos: null,
      texto: 'Completa el objetivo. Cada reto puntúa una vez.',
    },
  ];
}

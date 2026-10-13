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
  const cuantas =
    r.consumo_por_bar === 0
      ? 'ninguna puntúa'
      : r.consumo_por_bar === 1
        ? 'solo puntúa la primera'
        : `puntúan las ${r.consumo_por_bar} primeras`;
  const espera = r.consumo_minutos > 0 ? ` Entre una y otra tienen que pasar ${r.consumo_minutos} minutos.` : '';
  return [
    {
      icono: '📍',
      titulo: 'Sellar un bar',
      puntos: mas(p('sello')),
      texto: 'Cada sello que consigues en un bar de la ruta.',
    },
    {
      icono: '🏁',
      titulo: 'Completar la ruta',
      puntos: mas(p('ruta_completa')),
      texto: 'Una sola vez, al tener sellados todos los bares.',
    },
    {
      icono: '🥤',
      titulo: 'Consumición',
      puntos: mas(p('consumicion')),
      texto:
        `Se apunta desde el bar donde acabas de sellar (el último). En cada bar ${cuantas}` +
        (r.consumo_por_ruta > 0 ? `, y ${n(r.consumo_por_ruta, 'consumición', 'consumiciones')} como máximo en toda la ruta.` : '.') +
        `${espera} Vale igual con alcohol que sin él: no se premia beber más ni más rápido.`,
    },
    {
      icono: '🎨',
      titulo: 'Categoría nueva',
      puntos: mas(p('categoria_nueva')),
      texto:
        `La primera vez que apuntas cada tipo de bebida (tercio, jarra, vino, sidra, chupito, copa o sin alcohol), hasta ${n(r.variedad_max, 'vez', 'veces')} por ruta.`,
    },
    {
      icono: '🏆',
      titulo: 'Podio de los minijuegos',
      puntos: p('podio_1') === undefined ? null : `${p('podio_1')} · ${p('podio_2') ?? '?'} · ${p('podio_3') ?? '?'}`,
      texto:
        'Los tres primeros de cada minijuego en esta ruta: 1.º, 2.º y 3.º. El resto no suma. Si alguien te supera, el podio se recalcula solo.',
    },
    {
      icono: '🍻',
      titulo: 'Racha de casa',
      puntos: mas(p('racha')),
      texto:
        'Para la casa entera: cuando los tres últimos sellos de un bar son de tres personas distintas de la misma casa. ' +
        (r.racha_repetible ? 'Puede repetirse en el mismo bar.' : 'Solo una vez por casa y bar.') +
        ' Los puntos se reparten entre quienes la hicieron.',
    },
    {
      icono: '🤝',
      titulo: 'Encuentro por QR',
      puntos: mas(p('qr')),
      texto:
        'Escanea el QR de alguien de tu casa (o deja que te escanee), en la ruta. Cada pareja cuenta una vez, y a cada persona le puntúan hasta ' +
        `${n(r.qr_max, 'encuentro', 'encuentros')}. Los puntos se reparten a partes iguales entre los dos.`,
    },
    {
      icono: '🎯',
      titulo: 'Retos',
      puntos: null,
      texto: 'Cada reto de la ruta da los puntos que indica, una sola vez. Consulta tu progreso en «Retos».',
    },
  ];
}

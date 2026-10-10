/**
 * Catalogo de bares: de aqui se elige al anadir una parada, en vez de escribir
 * nombre, direccion y marcar el mapa a mano cada vez (un admin tecleando
 * coordenadas colocaba bares mal y creaba el mismo bar con tres nombres).
 *
 * Los bares viven en Postgres, tabla `catalog_bars` (0035 y 0036), y los leen y
 * crean los admins; catalogoStore.ts los trae y los sirve a las pantallas. Ya
 * no hay lista en el codigo ni logos empaquetados: la semilla de los 14 bares
 * originales esta en scripts/semilla-catalogo/ y llego a la tabla con la 0036.
 *
 * Al guardar una parada, el bar se copia a `route_bars` con nombre, direccion,
 * posicion, radio y logo (`route_bars.logo`), asi que la ruta no depende del
 * catalogo una vez creada y los jugadores, que no leen `catalog_bars`, ven el
 * sello. El radio de sellado no esta aqui: se elige al anadir el bar a la ruta.
 *
 * Este fichero solo tiene tipos y funciones puras, sin imports de valores: los
 * tests lo cargan en Node.
 */
export type BarCatalogo = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** data URL de la imagen del sello (`catalog_bars.logo`). Sin ella sale un sello con iniciales. */
  logoUri?: string;
};

function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/** Casa por nombre, sin distinguir mayusculas ni espacios de los bordes. */
export function buscarPorNombre(
  nombre: string,
  catalogo: readonly BarCatalogo[],
): BarCatalogo | undefined {
  const buscado = normalizar(nombre);
  return catalogo.find((bar) => normalizar(bar.name) === buscado);
}

/**
 * Ids del catalogo que ya estan en la ruta, para no ofrecer el mismo bar dos
 * veces. `ignorarId` es la fila que se esta editando: su propio bar tiene que
 * seguir disponible, si no el desplegable lo marcaria como ocupado.
 */
export function idsYaEnRuta(
  baresDeLaRuta: readonly { id: string; name: string }[],
  ignorarId: string | undefined,
  catalogo: readonly BarCatalogo[],
): Set<string> {
  const ocupados = new Set<string>();
  for (const bar of baresDeLaRuta) {
    if (bar.id === ignorarId) continue;
    const coincidencia = buscarPorNombre(bar.name, catalogo);
    if (coincidencia) ocupados.add(coincidencia.id);
  }
  return ocupados;
}

/** "La Venencia" -> "LV", "Casa Labra" -> "CL", "Bar" -> "B". Para el sello sin logo. */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => p.length > 0);
  if (palabras.length === 0) return '?';
  return palabras
    .slice(0, 2)
    .map((p) => Array.from(p)[0].toUpperCase())
    .join('');
}

/** Un plus code al principio del texto: "FJMQ+XP Alcala de Henares". */
const EMPIEZA_POR_PLUS_CODE = /^\s*[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,}(\s|$)/i;

/**
 * Direccion que se puede ensenar. Un plus code no es una direccion: es el dato
 * interno con el que se coloco el bar. Los bares que se guardaron antes de
 * ocultarlo lo llevan en `route_bars.address`, asi que se filtra al pintar en
 * vez de asumir que la BBDD esta limpia.
 */
export function direccionVisible(address: string): string {
  return EMPIEZA_POR_PLUS_CODE.test(address) ? '' : address.trim();
}

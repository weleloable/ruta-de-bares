/**
 * Catalogo de bares predefinidos: de aqui se elige al anadir una parada, en
 * vez de escribir nombre, direccion y marcar el mapa a mano cada vez.
 *
 * Vive en el codigo y no en Postgres a proposito (prueba local: no se toca el
 * esquema). Al guardar, el bar se copia a `route_bars` con nombre, direccion,
 * posicion y radio, asi que la ruta no depende del catalogo una vez creada.
 * Consecuencia: `route_bars` no guarda el logo, por eso se recupera casando el
 * nombre del bar con el del catalogo (`buscarPorNombre`, ver BarLogo.tsx).
 *
 * Origen de los datos: "LISTA BARES - FINAL" (nombre, plus code de Google Maps
 * y logo de cada bar). `plusCode` es el codigo tal cual viene de Google Maps y
 * es INTERNO: documenta de donde salen `lat`/`lng`, pero no se ensena nunca ni
 * se guarda como direccion (ver `direccionVisible`). `lat`/`lng` son el centro
 * de esa celda, decodificada con la libreria oficial open-location-code
 * tomando como referencia el centro de Alcala de Henares. La celda mide unos
 * 14 m, muy por debajo del radio de sellado.
 *
 * El radio de sellado no esta aqui: se elige al anadir el bar a la ruta.
 *
 * Los logos son ficheros en assets/bares/<id>.png y se enlazan en logos.ts.
 * Esa parte no esta aqui porque un `require()` de imagen no se puede cargar en
 * los tests (Node), y este fichero si tiene que poder cargarse.
 */
export type BarCatalogo = {
  id: string;
  name: string;
  /** Solo los bares de la lista cerrada; los propios no tienen. */
  plusCode?: string;
  lat: number;
  lng: number;
  /**
   * Solo los bares propios (ver catalogoPropio.ts): la imagen va dentro, como
   * data URL, porque vive en el dispositivo y no hay fichero en assets/. Los de
   * la lista cerrada usan logos.ts.
   */
  logoUri?: string;
  /** true = lo anadio un admin desde el editor, no viene en el codigo. */
  propio?: boolean;
};

export const CATALOGO_BARES: readonly BarCatalogo[] = [
  { id: 'quinto-tapon', name: 'Quinto Tapon', plusCode: 'FJMQ+XP', lat: 40.484937, lng: -3.360688 },
  { id: 'el-hidalgo', name: 'El Hidalgo', plusCode: 'FJMP+CJ', lat: 40.483562, lng: -3.363438 },
  { id: 'anexo', name: 'Anexo', plusCode: 'FJMP+8H', lat: 40.483312, lng: -3.363563 },
  { id: 'astures', name: 'Astures', plusCode: 'FJMP+6C', lat: 40.483062, lng: -3.363938 },
  { id: 'la-oveja-negra', name: 'La Oveja Negra', plusCode: 'FJJP+J5', lat: 40.481562, lng: -3.364563 },
  { id: 'lola', name: 'Lola', plusCode: 'FJJM+RR', lat: 40.482062, lng: -3.365437 },
  { id: 'wheelans', name: "Wheelan's", plusCode: 'FJJM+P9', lat: 40.481812, lng: -3.366563 },
  { id: 'retintas', name: 'Retintas', plusCode: 'FJJM+M9', lat: 40.481687, lng: -3.366563 },
  { id: 'lucrecia', name: 'Lucrecia', plusCode: 'FJJJ+MX', lat: 40.481687, lng: -3.367563 },
  { id: 'green-factory', name: 'Green Factory', plusCode: 'FJJJ+HM', lat: 40.481437, lng: -3.368313 },
  { id: 'panaderia', name: 'Panaderia', plusCode: 'FJJJ+GJ', lat: 40.481312, lng: -3.368438 },
  { id: 'la-magistral', name: 'La Magistral', plusCode: 'FJJJ+55', lat: 40.480437, lng: -3.369563 },
  { id: 'la-ruina', name: 'La Ruina', plusCode: 'FJHH+XX', lat: 40.479937, lng: -3.370063 },
  { id: 'karaoke', name: 'Karaoke', plusCode: 'FJHM+4H', lat: 40.477812, lng: -3.366063 },
];

function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/** Casa por nombre, sin distinguir mayusculas ni espacios de los bordes. */
export function buscarPorNombre(
  nombre: string,
  catalogo: readonly BarCatalogo[] = CATALOGO_BARES,
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
  ignorarId?: string,
  catalogo: readonly BarCatalogo[] = CATALOGO_BARES,
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

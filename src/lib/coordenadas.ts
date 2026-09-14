/**
 * Parseo de coordenadas escritas a mano, para el editor en web, donde no hay
 * mapa que tocar.
 *
 * Formatos aceptados:
 *  - lo que copia Google Maps con clic derecho: "40.41680, -3.70380"
 *  - separador coma, punto y coma o espacio; parentesis o corchetes alrededor
 *  - grados con hemisferio en las dos partes: "40.4168° N, 3.7038° W"
 *    (O de oeste, y º tambien)
 *  - la URL de un sitio de Google Maps, que lleva el pin en "!3d<lat>!4d<lng>"
 *
 * Reglas que evitan guardar un bar en un sitio que nadie eligio:
 *  - Minimo DECIMALES_MIN decimales por componente. 4 decimales son unos 11 m,
 *    por debajo del radio minimo de sellado (20 m). Un texto a medio teclear
 *    ("40.4168, -3.7") no es una posicion, y la coma decimal
 *    ("40,4168, -3,7038") nunca pasa por un par de enteros como (40, 4).
 *  - Hemisferio en las dos partes o en ninguna. Con uno solo, el texto a medio
 *    teclear "40.4168° N, 3.7038" seria +3.7038, el espejo de lo que se va a
 *    escribir ("... W"), a 600 km.
 *  - De una URL solo vale el pin (!3d!4d), exactamente uno, de un host de
 *    Google Maps y con cada numero bien terminado. El "@lat,lng" es el centro
 *    de la camara, que se mueve con el panel lateral: se ignora.
 *  - Todo el texto tiene que ser la posicion; nada de buscarla dentro.
 */

export type Punto = { lat: number; lng: number };

export type ResultadoCoordenadas = { ok: true; punto: Punto } | { ok: false; error: string };

export const DECIMALES_MIN = 4;

const NUM = String.raw`[+-]?\d*\.\d+|[+-]?\d+`;
const PAR = new RegExp(
  String.raw`^(${NUM})\s*[°º]?\s*([NS])?\s*(?:[,;]\s*|\s+)(${NUM})\s*[°º]?\s*([EWO])?$`,
  'i',
);

// google.com, google.es, google.co.uk, google.com.ar. No google.evil ni google.com.x.
const TLD_GOOGLE = String.raw`(?:com|[a-z]{2}|com?\.[a-z]{2})`;
const URL_GOOGLE_MAPS = new RegExp(
  String.raw`^https?:\/\/(?:(?:www\.)?google\.${TLD_GOOGLE}\/maps(?:[\/?#]|$)|maps\.google\.${TLD_GOOGLE}(?:[\/?#]|$))\S*$`,
  'i',
);
// El numero de longitud tiene que acabar donde acaba el segmento de la URL:
// "-3.7035e2" o "-3.7035.9999" no se cortan en silencio a -3.7035.
const PIN_EN_URL = /!3d([+-]?\d*\.\d+)!4d([+-]?\d*\.\d+)(?=[!\/?&#]|$)/g;

const ERROR_FORMATO =
  'Formato: latitud, longitud con punto decimal. Ejemplo: 40.41680, -3.70380';

type Componente = { valor: string; hemisferio?: string };

function decimales(valor: string): number {
  return valor.split('.')[1]?.length ?? 0;
}

/** Aplica el hemisferio. Signo y hemisferio a la vez es ambiguo: null. */
function aNumero({ valor, hemisferio }: Componente, negativos: string): number | null {
  if (hemisferio === undefined) return Number(valor);
  if (/^[+-]/.test(valor)) return null;
  const numero = Number(valor);
  return negativos.includes(hemisferio.toUpperCase()) ? -numero : numero;
}

/** Quita parentesis o corchetes solo si abren y cierran en pareja. */
function sinEnvoltorio(texto: string): string {
  const pareja = /^\((.*)\)$|^\[(.*)\]$/s.exec(texto);
  return pareja ? (pareja[1] ?? pareja[2]).trim() : texto;
}

function componentes(limpio: string): [Componente, Componente] | string {
  if (/^https?:\/\//i.test(limpio)) {
    if (!URL_GOOGLE_MAPS.test(limpio)) {
      return 'Solo vale una URL de un sitio de Google Maps, sin nada mas en el campo.';
    }
    const pines = [...limpio.matchAll(PIN_EN_URL)];
    if (pines.length !== 1) {
      return pines.length === 0
        ? 'Esa URL no lleva la posicion del pin. En Google Maps, clic derecho sobre el bar y copia las coordenadas.'
        : 'Esa URL lleva varias posiciones. Copia las coordenadas del bar con clic derecho.';
    }
    return [{ valor: pines[0][1] }, { valor: pines[0][2] }];
  }

  const par = PAR.exec(sinEnvoltorio(limpio));
  if (!par) return ERROR_FORMATO;
  if ((par[2] === undefined) !== (par[4] === undefined)) {
    return 'Pon el hemisferio en las dos coordenadas (N/S y E/W) o en ninguna.';
  }
  return [
    { valor: par[1], hemisferio: par[2] },
    { valor: par[3], hemisferio: par[4] },
  ];
}

export function parseCoordenadas(texto: string): ResultadoCoordenadas {
  const limpio = texto.trim();
  if (limpio.length === 0) return { ok: false, error: 'Pega las coordenadas del bar.' };

  const partes = componentes(limpio);
  if (typeof partes === 'string') return { ok: false, error: partes };
  const [latTexto, lngTexto] = partes;

  const lat = aNumero(latTexto, 'S');
  const lng = aNumero(lngTexto, 'WO');
  if (lat === null || lng === null) return { ok: false, error: ERROR_FORMATO };

  if (decimales(latTexto.valor) < DECIMALES_MIN || decimales(lngTexto.valor) < DECIMALES_MIN) {
    return {
      ok: false,
      error: `Hacen falta al menos ${DECIMALES_MIN} decimales en latitud y longitud (unos 10 m de precision).`,
    };
  }
  if (lat < -90 || lat > 90) return { ok: false, error: 'La latitud debe estar entre -90 y 90.' };
  if (lng < -180 || lng > 180) {
    return { ok: false, error: 'La longitud debe estar entre -180 y 180.' };
  }
  return { ok: true, punto: { lat, lng } };
}

/**
 * Estado del campo de coordenadas para cada texto. `punto` es null en cuanto
 * el texto no es valido o esta vacio: el formulario nunca se queda con una
 * posicion anterior. Vacio no muestra error, pero sin punto no se guarda.
 */
export function estadoCampoCoordenadas(texto: string): { punto: Punto | null; error: string | null } {
  if (texto.trim().length === 0) return { punto: null, error: null };
  const resultado = parseCoordenadas(texto);
  return resultado.ok
    ? { punto: resultado.punto, error: null }
    : { punto: null, error: resultado.error };
}

/**
 * Numero en texto que parseCoordenadas acepta y que vuelve EXACTAMENTE al
 * mismo double: lo que se ve en el campo es lo que se guarda.
 */
function formatNumero(n: number): string {
  // String(n) es la representacion decimal mas corta que vuelve al mismo
  // double. Se reescribe sin exponente (mismos digitos) y se rellena con ceros
  // hasta DECIMALES_MIN: ningun paso redondea. toFixed si redondea, y con
  // 3.17e-7 el texto ya no volvia al mismo numero.
  const plano = sinExponente(Object.is(n, -0) ? '-0' : String(n));
  const faltan = DECIMALES_MIN - decimales(plano);
  if (faltan <= 0) return plano;
  return plano.includes('.') ? plano + '0'.repeat(faltan) : `${plano}.${'0'.repeat(DECIMALES_MIN)}`;
}

/** "3.1694e-7" -> "0.00000031694", "1.5e+21" -> "1500000000000000000000". */
function sinExponente(corto: string): string {
  const partes = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(corto);
  if (!partes) return corto;
  const [, signo, entero, fraccion = '', exponente] = partes;
  const digitos = entero + fraccion;
  const punto = 1 + Number(exponente); // donde cae la coma decimal dentro de `digitos`
  if (punto <= 0) return `${signo}0.${'0'.repeat(-punto)}${digitos}`;
  if (punto >= digitos.length) return `${signo}${digitos}${'0'.repeat(punto - digitos.length)}`;
  return `${signo}${digitos.slice(0, punto)}.${digitos.slice(punto)}`;
}

/** Texto inicial del campo, sin redondear. */
export function formatCoordenadas(punto: Punto): string {
  return `${formatNumero(punto.lat)}, ${formatNumero(punto.lng)}`;
}

/**
 * Como se va a guardar, en palabras: "40.41680° N, 3.70380° O". Se ensena
 * bajo el campo para que un signo o un hemisferio equivocado salte a la vista.
 */
export function describirPunto({ lat, lng }: Punto): string {
  const ns = lat < 0 ? 'S' : 'N';
  const eo = lng < 0 ? 'O' : 'E';
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lng).toFixed(5)}° ${eo}`;
}

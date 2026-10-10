import type { BarCatalogo } from './catalogo';

/**
 * Bares que un admin anade a mano al catalogo desde el editor: nombre,
 * ubicacion e imagen del sello. Solo la parte PURA (validar, leer lo que quedo
 * en el dispositivo antes de la 0035, convertir filas de `catalog_bars`,
 * fusionar con la lista cerrada); donde se guardan lo decide catalogoStore.ts.
 *
 * Sin imports de valores, como catalogo.ts: los tests cargan este fichero en
 * Node, que no resuelve imports entre hermanos sin extension.
 */

/** Clave del almacen. El sufijo permite cambiar el formato sin leer datos viejos. */
export const CLAVE_ALMACEN = 'catalogo-propio-v1';

/** Centro de Alcala de Henares: donde arranca el mapa si no hay nada mejor. */
export const CENTRO_POR_DEFECTO = { lat: 40.482, lng: -3.364 };

export const NOMBRE_MAX = 60;

/**
 * Tope de la imagen ya codificada (data URL). El logo sale a 256 px en JPEG,
 * unos 15-40 KB en base64; este limite solo caza algo que no paso por
 * logoPropio.ts, para que un dato roto no llene el almacen del dispositivo.
 */
export const LOGO_MAX_CARACTERES = 300_000;

export type BorradorBarPropio = {
  nombre: string;
  punto: { lat: number; lng: number } | null;
  /** data URL de la imagen del sello, o null si no se eligio (sale un sello con iniciales). */
  logoUri: string | null;
};

export function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase();
}

export function esLogoValido(logo: unknown): logo is string {
  return typeof logo === 'string' && logo.startsWith('data:image/') && logo.length <= LOGO_MAX_CARACTERES;
}

export function esPuntoValido(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * `existentes` es TODO lo que ya hay en la lista, cerrada y propia: el nombre
 * es la clave con la que se recupera el logo y con la que se marca "ya esta en
 * la ruta", asi que dos bares con el mismo nombre se pisarian.
 */
export function validarBarPropio(borrador: BorradorBarPropio, existentes: readonly { name: string }[]): string[] {
  const errores: string[] = [];
  const nombre = borrador.nombre.trim();

  if (nombre.length === 0) errores.push('El bar necesita un nombre.');
  else if (nombre.length > NOMBRE_MAX) errores.push(`El nombre no puede pasar de ${NOMBRE_MAX} caracteres.`);
  else if (existentes.some((e) => normalizar(e.name) === normalizar(nombre))) {
    errores.push('Ya hay un bar con ese nombre en la lista.');
  }

  if (!borrador.punto || !esPuntoValido(borrador.punto.lat, borrador.punto.lng)) {
    errores.push('Marca la ubicacion del bar en el mapa.');
  }

  if (borrador.logoUri !== null && !esLogoValido(borrador.logoUri)) {
    errores.push('La imagen elegida no es valida. Prueba con otra.');
  }

  return errores;
}

/** Id nuevo. `ahora` y `azar` se inyectan para que sea determinista en los tests. */
export function nuevoId(ahora: number, azar: number): string {
  return `propio-${ahora.toString(36)}-${Math.floor(azar * 1_679_616).toString(36)}`;
}

/** Convierte un borrador YA validado en una entrada del catalogo. */
export function crearBarPropio(borrador: BorradorBarPropio, id: string): BarCatalogo {
  if (!borrador.punto) throw new Error('crearBarPropio sin ubicacion: validar antes.');
  return {
    id,
    name: borrador.nombre.trim(),
    lat: borrador.punto.lat,
    lng: borrador.punto.lng,
    ...(borrador.logoUri ? { logoUri: borrador.logoUri } : {}),
  };
}

export function serializarPropios(propios: readonly BarCatalogo[]): string {
  return JSON.stringify(propios);
}

/**
 * Lee lo guardado. Tolerante: el almacen es del dispositivo y puede estar
 * vacio, cortado o de otra version, y un dato roto no puede tumbar el editor.
 * Lo que no sirve se descarta; una imagen rota solo pierde la imagen.
 */
export function leerPropios(json: string | null): BarCatalogo[] {
  if (!json) return [];
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(bruto)) return [];

  const propios: BarCatalogo[] = [];
  for (const item of bruto) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, lat, lng, logoUri } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id.startsWith('propio-')) continue;
    if (typeof name !== 'string' || name.trim().length === 0) continue;
    if (!esPuntoValido(lat, lng)) continue;
    propios.push({
      id,
      name: name.trim(),
      lat: lat as number,
      lng: lng as number,
      ...(esLogoValido(logoUri) ? { logoUri } : {}),
    });
  }
  return propios;
}

/**
 * `base` primero (lo que viene de la tabla) y luego los del dispositivo que aun
 * no se han subido. Si uno de estos choca con la tabla (mismo id o mismo nombre)
 * manda la tabla: es la copia compartida y la que ven los demas admins.
 */
export function fusionarCatalogo(base: readonly BarCatalogo[], propios: readonly BarCatalogo[]): BarCatalogo[] {
  const ids = new Set(base.map((b) => b.id));
  const nombres = new Set(base.map((b) => normalizar(b.name)));
  const validos: BarCatalogo[] = [];
  for (const propio of propios) {
    const nombre = normalizar(propio.name);
    if (ids.has(propio.id) || nombres.has(nombre)) continue;
    ids.add(propio.id);
    nombres.add(nombre);
    validos.push(propio);
  }
  return [...base, ...validos];
}

// ---------------------------------------------------------------------------
// Catalogo compartido entre admins (0035, tabla `catalog_bars`).
//
// Solo la parte PURA: convertir filas y decidir que bares del dispositivo hay
// que subir. Las llamadas a Supabase estan en catalogoCompartido.ts y el estado
// en catalogoStore.ts. Vive en este fichero y no en uno aparte porque los tests
// cargan estos ficheros en Node, que no resuelve imports entre hermanos sin
// extension.
// ---------------------------------------------------------------------------

/** Fila de `catalog_bars` tal como la devuelve la API. */
export type FilaBarCompartido = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  logo: string | null;
};

/** Lo que se inserta; `created_by` lo pone quien llama (la policy lo exige igual a auth.uid()). */
export type NuevoBarCompartido = {
  name: string;
  lat: number;
  lng: number;
  logo: string | null;
  created_by: string;
};

/** Fila de la tabla -> entrada del catalogo. Lo que no es valido se descarta, no se arregla. */
export function desdeFilaCompartida(fila: unknown): BarCatalogo | null {
  if (typeof fila !== 'object' || fila === null) return null;
  const { id, name, lat, lng, logo } = fila as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (!esPuntoValido(lat, lng)) return null;
  return {
    id,
    name: name.trim(),
    lat: lat as number,
    lng: lng as number,
    ...(esLogoValido(logo) ? { logoUri: logo } : {}),
  };
}

/** Lista de filas -> catalogo, sin repetir nombres (la tabla ya lo impide; esto es defensa en profundidad). */
export function desdeFilasCompartidas(filas: readonly unknown[] | null | undefined): BarCatalogo[] {
  const vistos = new Set<string>();
  const salida: BarCatalogo[] = [];
  for (const fila of filas ?? []) {
    const bar = desdeFilaCompartida(fila);
    if (!bar) continue;
    const clave = normalizar(bar.name);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(bar);
  }
  return salida;
}

/** Entrada del catalogo -> fila a insertar. El nombre se recorta igual que lo hace la tabla (`btrim`). */
export function aFilaCompartida(bar: Pick<BarCatalogo, 'name' | 'lat' | 'lng' | 'logoUri'>, uid: string): NuevoBarCompartido {
  return {
    name: bar.name.trim().slice(0, NOMBRE_MAX),
    lat: bar.lat,
    lng: bar.lng,
    logo: bar.logoUri ?? null,
    created_by: uid,
  };
}

/**
 * Bares que estaban SOLO en este dispositivo (los creados antes de la 0035) y
 * hay que subir para que los vean los demas admins. Se casa por nombre, igual
 * que el resto de la app: si ya hay uno con ese nombre en la tabla, el local no
 * se sube (la unique de la tabla lo rechazaria) y se descarta.
 */
export function pendientesDeSubir(locales: readonly BarCatalogo[], remotos: readonly BarCatalogo[]): BarCatalogo[] {
  const ocupados = new Set(remotos.map((b) => normalizar(b.name)));
  const pendientes: BarCatalogo[] = [];
  for (const local of locales) {
    const clave = normalizar(local.name);
    if (ocupados.has(clave)) continue;
    ocupados.add(clave);
    pendientes.push(local);
  }
  return pendientes;
}

/** El motivo por el que Postgres rechazo el alta, traducido para el admin. */
export function traducirErrorAlta(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'Ya hay un bar con ese nombre en la lista.';
  if (error.code === '42501') return 'Solo los administradores pueden anadir bares a la lista.';
  return 'No se pudo guardar el bar. Revisa la conexion y prueba otra vez.';
}

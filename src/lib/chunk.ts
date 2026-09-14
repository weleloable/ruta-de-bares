/**
 * Troceado de cadenas por tamano en BYTES UTF-8.
 *
 * Existe porque expo-secure-store avisa por encima de 2048 bytes por valor en
 * Android, y una sesion de Supabase (access token + refresh token + user) pasa
 * de eso con holgura. La alternativa del tutorial de Supabase es cifrar con
 * aes-js y guardar en AsyncStorage; trocear no anade dependencias y deja la
 * sesion donde debe estar, en el keystore del sistema.
 *
 * Trabaja en bytes, no en caracteres: un display_name con acentos o un emoji
 * ocupa 2-4 bytes y contar caracteres desbordaria el limite. Nunca parte un
 * par suplente (emoji), asi que cada trozo es una cadena valida por si sola.
 */

const encoder = new TextEncoder();

/** Bytes UTF-8 que ocupa un code point. */
function codePointSize(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

/**
 * Parte `value` en trozos de como mucho `maxBytes` bytes UTF-8.
 * Una cadena vacia devuelve [''] (un trozo vacio), para que
 * `joinChunks(splitChunks(x)) === x` se cumpla siempre.
 */
export function splitChunks(value: string, maxBytes: number): string[] {
  if (!Number.isInteger(maxBytes) || maxBytes < 4) {
    // 4 = el code point mas grande de UTF-8. Por debajo, un emoji no cabria en
    // ningun trozo y la funcion no podria terminar.
    throw new RangeError('maxBytes debe ser un entero >= 4');
  }
  if (value === '') return [''];

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  // for..of itera por code points, no por code units: no parte emojis.
  for (const char of value) {
    const size = codePointSize(char.codePointAt(0) as number);
    if (currentBytes + size > maxBytes) {
      chunks.push(current);
      current = char;
      currentBytes = size;
    } else {
      current += char;
      currentBytes += size;
    }
  }
  chunks.push(current);
  return chunks;
}

export function joinChunks(chunks: readonly string[]): string {
  return chunks.join('');
}

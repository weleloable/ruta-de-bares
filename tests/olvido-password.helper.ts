import { readFileSync } from 'node:fs';

/**
 * `translateAuthError` vive en AuthProvider.tsx, que importa React Native y
 * Supabase y no se puede cargar en node --test. Se extrae la funcion del codigo
 * fuente y se evalua suelta: lo unico que prueba es su tabla de textos.
 */
export function traducirOtp(mensaje: string): string {
  const fuente = readFileSync('src/features/auth/AuthProvider.tsx', 'utf8').replace(/\r\n/g, '\n');
  const inicio = fuente.indexOf('export function translateAuthError');
  const fin = fuente.indexOf('\n}\n', inicio) + 3;
  const js = fuente
    .slice(inicio, fin)
    .replace('export function translateAuthError(message: string): string', 'function f(message)')
    .replace(/^\s*\/\/.*$/gm, '');
  const traducir = new Function(`${js}; return f;`)() as (m: string) => string;
  return traducir(mensaje);
}

/**
 * La credencial esta completa cuando hay al menos un bar y TODOS tienen sello.
 * Se deduce de los sellos, no se guarda: si se borra uno, deja de estarlo. Una
 * ruta sin bares nunca esta completa (0 de 0 no es haber hecho la ruta).
 */
export function credencialCompleta(conseguidos: number, total: number): boolean {
  return total > 0 && conseguidos === total;
}

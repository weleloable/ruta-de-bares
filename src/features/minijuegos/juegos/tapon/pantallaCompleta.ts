/**
 * Pantalla completa y bloqueo en horizontal. En nativo no hace nada: la app esta
 * fijada en vertical (app.config.ts) y no hay modulo de orientacion instalado
 * (anadirlo pide un development build nuevo), asi que el juego se pinta tumbado
 * (ver `hayQueGirar`). La variante web lo pide al navegador.
 */
export function entrarEnHorizontal(): void {}
export function salirDeHorizontal(): void {}

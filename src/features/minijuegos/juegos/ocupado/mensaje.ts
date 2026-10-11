import type { ResultadoJuego } from '../../tipos';

/**
 * "Ocupado" es un juego de Godot (escape room en el baño de un bar) que vive en
 * su propio repo (github.com/weleloable/ocupado) y se publica en su propia web.
 * La app no lo empaqueta: lo carga en un iframe (web) o lo abre en el
 * navegador (nativo). Logica pura: de donde se carga y que se acepta de el.
 *
 * Contrato con el juego (`scripts/core/app_bridge.gd` en su repo): al ganar
 * manda por `postMessage`
 *   { tipo: 'ocupado:fin', version: 1, final: 'door' | 'flood',
 *     segundos, temperatura, pistas }
 * Si el juego cambia el formato, sube `version` y aqui se ignora lo que no se
 * entiende en vez de guardar basura.
 */

/** Donde esta publicado. Se puede cambiar (pruebas en local) con EXPO_PUBLIC_OCUPADO_URL. */
export const URL_OCUPADO_POR_DEFECTO = 'https://weleloable.github.io/ocupado/';

/**
 * Solo una URL http(s) que de verdad se pueda leer: `origenDe` se llama al cargar
 * el modulo, y una URL rota ("https://" a secas) lanzaba ahi y tumbaba la pestana
 * de juegos entera, no solo Ocupado. Y nunca `javascript:` ni `data:` en el iframe.
 */
export function urlOcupado(entorno: string | undefined): string {
  const url = (entorno ?? '').trim();
  try {
    // La normalizada: con una cruda rara ("http:foo") el iframe la leeria como ruta
    // relativa y el origen esperado seria otro, y nunca daria record.
    const leida = new URL(url);
    if (leida.protocol === 'https:' || leida.protocol === 'http:') return leida.href;
  } catch {
    // No es una URL: la de siempre.
  }
  return URL_OCUPADO_POR_DEFECTO;
}

/** El origen del que se aceptan mensajes: el de la URL del juego, y ningun otro. */
export function origenDe(url: string): string {
  return new URL(url).origin;
}

export type FinalOcupado = 'door' | 'flood';

export type FinOcupado = {
  final: FinalOcupado;
  segundos: number;
  /** Temperatura de la cerveza al salir (°C): es la puntuacion del juego, MENOS es mejor. */
  temperatura: number;
  pistas: number;
};

// Lo que puede salir de una partida de verdad; fuera de esto es un dato roto o falso.
const SEGUNDOS_MAX = 6 * 3600;
const TEMP_MIN = 2;
const TEMP_MAX = 60;
const PISTAS_MAX = 99;

const numero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * El mensaje, si es del juego y tiene sentido; si no, null. Primero el ORIGEN:
 * cualquier pagina (o extension) puede mandar un postMessage a la app. OJO: en
 * GitHub Pages la app y el juego comparten origen (weleloable.github.io), asi
 * que esto solo no basta; la pantalla mira ademas que lo mande SU iframe
 * (`e.source`, en Ocupado.web.tsx). Nunca lanza: el que llama no tiene que
 * protegerse de datos raros.
 */
export function leerMensajeOcupado(origen: string, origenEsperado: string, datos: unknown): FinOcupado | null {
  try {
    return leer(origen, origenEsperado, datos);
  } catch {
    return null;
  }
}

function leer(origen: string, origenEsperado: string, datos: unknown): FinOcupado | null {
  if (origen !== origenEsperado) return null;
  if (typeof datos !== 'object' || datos === null) return null;
  const m = datos as Record<string, unknown>;
  if (m.tipo !== 'ocupado:fin' || m.version !== 1) return null;
  if (m.final !== 'door' && m.final !== 'flood') return null;
  if (!numero(m.segundos) || m.segundos < 0 || m.segundos > SEGUNDOS_MAX) return null;
  if (!numero(m.temperatura) || m.temperatura < TEMP_MIN || m.temperatura > TEMP_MAX) return null;
  if (!numero(m.pistas) || !Number.isInteger(m.pistas) || m.pistas < 0 || m.pistas > PISTAS_MAX) return null;
  return { final: m.final, segundos: m.segundos, temperatura: m.temperatura, pistas: m.pistas };
}

/**
 * De la temperatura (menos es mejor, minimo 2 °C) a los puntos de la app (mas es
 * mejor, 0..100): 2 °C = 100 y cada grado de mas resta 4. Asi los tramos del
 * juego quedan asi: < 8 °C, mas de 76; 8-14 °C, 52-76; 14-20 °C, 28-52; y
 * desde 27 °C, 0.
 */
export function puntuacionOcupado(temperatura: number): number {
  const puntos = Math.round(100 - (temperatura - TEMP_MIN) * 4);
  return Math.min(Math.max(puntos, 0), 100);
}

export const NOMBRE_FINAL: Record<FinalOcupado, string> = {
  door: 'Tirar, que no empujar',
  flood: 'Que lo limpie el bar',
};

export function resultadoOcupado(fin: FinOcupado): ResultadoJuego {
  return {
    juego: 'ocupado',
    puntuacion: puntuacionOcupado(fin.temperatura),
    detalles: {
      final: fin.final,
      segundos: Math.round(fin.segundos),
      temperatura: Math.round(fin.temperatura * 10) / 10,
      pistas: fin.pistas,
    },
  };
}

/** 754 -> "12:34". */
export function formatoTiempo(segundos: number): string {
  const s = Math.max(Math.round(segundos), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

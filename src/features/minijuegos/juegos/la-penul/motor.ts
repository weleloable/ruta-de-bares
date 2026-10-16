/**
 * El motor de La Penul: recorre el guion (guion.ts), que es solo datos. Puro:
 * sin React, sin reloj y sin azar suelto (el genero sale de una semilla), asi
 * los tests recorren TODAS las partidas posibles.
 *
 * Lo que decide el motor y no el guion:
 *  - el genero de quien juega, al azar con semilla, y como se lee cada texto;
 *  - las rondas: cada opcion `ronda` pasa una; al volver a la barra con las
 *    RONDAS gastadas, el bar cierra (CIERRE). Es lo que garantiza que toda
 *    partida termina: dentro de una conversacion no hay vuelta atras, y volver
 *    a la barra cuesta una ronda;
 *  - en la barra, a quien ya se lo intentaste sale tachado y no se puede elegir.
 *
 * Sin importaciones en tiempo de ejecucion salvo el propio guion (con .ts no:
 * la app no lo admite; los tests lo cargan por la ruta del fichero).
 */
import type { Final, Genero, Imagen, Nodo, Opcion, Pagina, PersonaId } from './tipos';

export type Estado = {
  genero: Genero;
  nodo: string;
  /** Pagina que se ve del nodo actual (la replica, si la hay, es la 0). */
  pagina: number;
  /** Rondas gastadas. */
  rondas: number;
  /** Con quien ya se ha hablado (sale tachado en la barra). */
  intentados: PersonaId[];
  /** Lo que contesto alguien a la ultima opcion: se ve antes que el nodo. */
  replica: Pagina | null;
  /**
   * Quien sale en pantalla mientras se lee la replica: el del nodo donde se
   * eligio. Si no, una replica que lleva a la barra o al cierre ("Pues que te
   * bailen los novios") se veia sin nadie que la dijera.
   */
  replicaDe: Imagen | null;
};

export type Guion = { nodos: readonly Nodo[]; inicio: string; barra: string; cierre: string; rondas: number };

/** Pagina ya leida para el genero: quien habla (o null) y el texto. */
export type PaginaLeida = { habla: string | null; texto: string };

export type OpcionVisible = { indice: number; texto: string; tachada: boolean; persona: PersonaId | null };

const MARCA = /\{([^{}|]*)\|([^{}|]*)\}/g;

/** Lee un texto con variantes de genero: "cansad{o|a}" -> "cansado" / "cansada". */
export function leer(texto: string, genero: Genero): string {
  return texto.replace(MARCA, (_t, h: string, m: string) => (genero === 'h' ? h : m));
}

export function leerPagina(p: Pagina, genero: Genero): PaginaLeida {
  return typeof p === 'string' ? { habla: null, texto: leer(p, genero) } : { habla: p.habla, texto: leer(p.texto, genero) };
}

/** Genero al azar con semilla: misma semilla, mismo genero (mulberry32, un paso). */
export function generoDe(semilla: number): Genero {
  let t = (semilla + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) % 2 === 0 ? 'h' : 'm';
}

export function crearMotor(g: Guion) {
  const porId = new Map(g.nodos.map((n) => [n.id, n]));
  const nodo = (id: string): Nodo => {
    const n = porId.get(id);
    if (!n) throw new Error(`Nodo inexistente: ${id}`);
    return n;
  };

  function empezar(semilla: number, genero?: Genero): Estado {
    return { genero: genero ?? generoDe(semilla), nodo: g.inicio, pagina: 0, rondas: 0, intentados: [], replica: null, replicaDe: null };
  }

  /** Las paginas que se ven ahora: la replica (si la hay) y las del nodo. */
  function paginas(e: Estado): PaginaLeida[] {
    const n = nodo(e.nodo);
    const todas = e.replica ? [e.replica, ...n.paginas] : n.paginas;
    return todas.map((p) => leerPagina(p, e.genero));
  }

  function nodoActual(e: Estado): Nodo {
    return nodo(e.nodo);
  }

  /** Se esta leyendo la replica (la pagina 0 cuando la hay). */
  function leyendoReplica(e: Estado): boolean {
    return e.replica !== null && e.pagina === 0;
  }

  /** Quien sale en pantalla ahora: quien dijo la replica mientras se lee; si no, el del nodo. */
  function imagen(e: Estado): Imagen | null {
    // Si la replica la dijo la narracion (un nodo sin nadie), no sale nadie: ni el del destino.
    return leyendoReplica(e) ? e.replicaDe : nodo(e.nodo).imagen;
  }

  /** Se estan viendo ya todas las paginas: toca elegir (o es el final). */
  function enUltimaPagina(e: Estado): boolean {
    return e.pagina >= paginas(e).length - 1;
  }

  function siguientePagina(e: Estado): Estado {
    return enUltimaPagina(e) ? e : { ...e, pagina: e.pagina + 1 };
  }

  function opciones(e: Estado): OpcionVisible[] {
    const n = nodo(e.nodo);
    return (n.opciones ?? []).map((o, indice) => ({
      indice,
      texto: leer(o.texto, e.genero),
      tachada: !!o.persona && e.intentados.includes(o.persona),
      persona: o.persona ?? null,
    }));
  }

  /** Elegir una opcion. La misma partida si no vale (tachada, inexistente o sin leer todo). */
  function elegir(e: Estado, indice: number): Estado {
    const n = nodo(e.nodo);
    const o: Opcion | undefined = n.opciones?.[indice];
    if (!o || !enUltimaPagina(e)) return e;
    if (o.persona && e.intentados.includes(o.persona)) return e;
    const rondas = e.rondas + (o.ronda ? 1 : 0);
    const intentados = o.persona ? [...e.intentados, o.persona] : e.intentados;
    // Volver a la barra con las rondas gastadas: el bar cierra.
    const destino = o.va === g.barra && rondas >= g.rondas ? g.cierre : o.va;
    // Con todo el mundo intentado y rondas por gastar, la barra solo deja a Paco: sigue valiendo.
    return { ...e, nodo: destino, pagina: 0, rondas, intentados, replica: o.replica ?? null, replicaDe: o.replica ? n.imagen : null };
  }

  function final(e: Estado): Final | null {
    return nodo(e.nodo).final ?? null;
  }

  return { nodo, empezar, paginas, nodoActual, leyendoReplica, imagen, enUltimaPagina, siguientePagina, opciones, elegir, final };
}

export type Motor = ReturnType<typeof crearMotor>;

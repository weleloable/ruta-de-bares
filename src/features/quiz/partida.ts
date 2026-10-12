import type {
  Accion,
  Azar,
  BancoPreguntas,
  ConfigQuiz,
  EstadoPartida,
  Nivel,
  Opcion,
  Pregunta,
} from './tipos';

// Logica pura de la partida, sin React. Sin imports en tiempo de ejecucion a
// proposito: Node (los tests) pide `.ts` en cada import y Metro no lo admite,
// asi que el azar y la config llegan por parametro.

export const NIVELES: readonly Nivel[] = [1, 2, 3, 4, 5];

/** Fisher-Yates sobre una copia: no toca el original. */
export function barajar<T>(items: readonly T[], azar: Azar): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function opcionesBarajadas(p: Pregunta, azar: Azar): Opcion[] {
  return barajar<Opcion>(
    [{ texto: p.correcta, correcta: true }, ...p.incorrectas.map((texto) => ({ texto, correcta: false }))],
    azar,
  );
}

/**
 * Elige una pregunta del nivel que no se haya visto. Si ya se han visto todas
 * las de ese nivel, empieza otra vuelta (olvida SOLO ese nivel). `excluir` es
 * la pregunta que se esta cambiando: nunca vuelve a salir.
 */
export function elegirPregunta(
  banco: BancoPreguntas,
  nivel: Nivel,
  vistas: readonly string[],
  azar: Azar,
  excluir?: string,
): { pregunta: Pregunta; vistas: string[] } {
  const delNivel = banco.preguntas.filter((p) => p.nivel === nivel && p.id !== excluir);
  if (delNivel.length === 0) throw new Error(`No hay preguntas de nivel ${nivel}`);
  let base = [...vistas];
  let libres = delNivel.filter((p) => !base.includes(p.id));
  if (libres.length === 0) {
    const ids = new Set(banco.preguntas.filter((p) => p.nivel === nivel).map((p) => p.id));
    base = base.filter((id) => !ids.has(id));
    libres = delNivel;
  }
  const pregunta = libres[Math.floor(azar() * libres.length)];
  return { pregunta, vistas: [...base, pregunta.id] };
}

const SIN_COMODINES = { cincuenta: false, voto: false, cambio: false } as const;

function estadoDePregunta(
  banco: BancoPreguntas,
  indice: number,
  vistas: readonly string[],
  usados: EstadoPartida['usados'],
  azar: Azar,
  ms: number,
  excluir?: string,
): EstadoPartida {
  const elegida = elegirPregunta(banco, NIVELES[indice], vistas, azar, excluir);
  return {
    fase: 'respondiendo',
    indice,
    pregunta: elegida.pregunta,
    opciones: opcionesBarajadas(elegida.pregunta, azar),
    seleccion: null,
    eliminadas: [],
    voto: null,
    usados,
    acierto: null,
    causaFallo: null,
    vistas: elegida.vistas,
    desenlace: null,
    puntos: 0,
    ms,
  };
}

/** Empieza una partida: una pregunta del nivel 1. `vistas` son los ids ya vistos en este dispositivo. */
export function nuevaPartida(banco: BancoPreguntas, vistas: readonly string[], azar: Azar): EstadoPartida {
  return estadoDePregunta(banco, 0, vistas, SIN_COMODINES, azar, 0);
}

/** Lo maximo que se puede sacar: un punto por pregunta (0061). */
export const PUNTOS_MAXIMOS = NIVELES.length;

/** Lo tardado en una pregunta, acotado al reloj (ni negativo ni mas que el tiempo de la pregunta). */
export function acotarMs(ms: number | undefined, config: ConfigQuiz): number {
  const n = Math.round(ms ?? 0);
  return Math.max(0, Math.min(config.segundos * 1000, Number.isFinite(n) ? n : 0));
}

function repartirEnteros(pesos: readonly number[], total: number): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  const brutos = pesos.map((p) => (suma === 0 ? 0 : (p / suma) * total));
  const base = brutos.map(Math.floor);
  let resto = total - base.reduce((a, b) => a + b, 0);
  const orden = brutos.map((b, i) => ({ i, f: b - Math.floor(b) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; resto > 0 && orden.length > 0; k++, resto--) base[orden[k % orden.length].i]++;
  return base;
}

/**
 * Voto del bar: porcentajes por opcion (0 en las eliminadas) que suman 100. La
 * correcta lidera con la probabilidad del nivel; si no, lidera una incorrecta,
 * para que el publico no sea infalible. El lider siempre es estrictamente el mas votado.
 */
export function generarVoto(
  opciones: readonly Opcion[],
  eliminadas: readonly number[],
  nivel: Nivel,
  azar: Azar,
  config: ConfigQuiz,
): number[] {
  const vivas = opciones.map((_, i) => i).filter((i) => !eliminadas.includes(i));
  const correcta = vivas.find((i) => opciones[i].correcta);
  const incorrectas = vivas.filter((i) => i !== correcta);
  const correctaLidera =
    correcta !== undefined && (incorrectas.length === 0 || azar() < config.probVotoCorrecta[nivel - 1]);
  const lider = correctaLidera ? (correcta as number) : incorrectas[Math.floor(azar() * incorrectas.length)];
  const otros = vivas.filter((i) => i !== lider);

  const [min, max] = vivas.length === 2 ? [58, 85] : [42, 70];
  const resultado = Array<number>(opciones.length).fill(0);
  // Se sortea hasta que el lider gane tambien tras redondear; con un reparto
  // igual del resto siempre gana, asi que el ultimo intento no puede fallar.
  for (let intento = 0; ; intento++) {
    const ultimo = intento >= 39;
    const parteLider = min + Math.floor(azar() * (max - min + 1));
    const pesos = otros.map(() => (ultimo ? 1 : 0.2 + azar()));
    const repartido = repartirEnteros(pesos, 100 - parteLider);
    if (!ultimo && Math.max(...repartido) >= parteLider) continue;
    resultado[lider] = parteLider;
    otros.forEach((o, k) => (resultado[o] = repartido[k]));
    return resultado;
  }
}

function renormalizar(voto: readonly number[], eliminadas: readonly number[]): number[] {
  return repartirEnteros(
    voto.map((v, i) => (eliminadas.includes(i) ? 0 : v)),
    100,
  );
}

function revelarEstado(e: EstadoPartida, acierto: boolean, causa: 'fallo' | 'tiempo'): EstadoPartida {
  return { ...e, fase: 'revelada', acierto, causaFallo: acierto ? null : causa };
}

function terminar(e: EstadoPartida, desenlace: EstadoPartida['desenlace'], puntos: number): EstadoPartida {
  return { ...e, fase: 'fin', desenlace, puntos };
}

/**
 * Transicion de la partida. Una accion que no toca en esa fase devuelve el
 * MISMO estado (sin error): la pantalla puede repetir un toque o un reloj sin
 * romper nada.
 */
export function reducir(
  e: EstadoPartida,
  accion: Accion,
  ctx: { banco: BancoPreguntas; azar: Azar; config: ConfigQuiz },
): EstadoPartida {
  const { banco, azar, config } = ctx;
  switch (accion.tipo) {
    case 'elegir':
      if (e.fase !== 'respondiendo') return e;
      if (accion.opcion < 0 || accion.opcion >= e.opciones.length || e.eliminadas.includes(accion.opcion)) return e;
      return { ...e, seleccion: accion.opcion };

    case 'confirmar':
      if (e.fase !== 'respondiendo' || e.seleccion === null) return e;
      return { ...e, fase: 'suspense', ms: e.ms + acotarMs(accion.ms, config) };

    case 'revelar': {
      if (e.fase !== 'suspense' || e.seleccion === null) return e;
      return revelarEstado(e, e.opciones[e.seleccion].correcta, 'fallo');
    }

    case 'tiempoAgotado':
      // En suspense la respuesta ya esta dada: el reloj no la tumba.
      if (e.fase !== 'respondiendo') return e;
      // Sin contestar a tiempo cuenta la pregunta entera.
      return revelarEstado({ ...e, seleccion: null, ms: e.ms + config.segundos * 1000 }, false, 'tiempo');

    case 'comodin': {
      if (e.fase !== 'respondiendo' || e.usados[accion.comodin]) return e;
      const usados = { ...e.usados, [accion.comodin]: true };
      if (accion.comodin === 'cincuenta') {
        const malas = e.opciones.map((_, i) => i).filter((i) => !e.opciones[i].correcta && !e.eliminadas.includes(i));
        const eliminadas = [...e.eliminadas, ...barajar(malas, azar).slice(0, 2)];
        return {
          ...e,
          usados,
          eliminadas,
          seleccion: e.seleccion !== null && eliminadas.includes(e.seleccion) ? null : e.seleccion,
          voto: e.voto ? renormalizar(e.voto, eliminadas) : null,
        };
      }
      if (accion.comodin === 'voto') {
        return { ...e, usados, voto: generarVoto(e.opciones, e.eliminadas, NIVELES[e.indice], azar, config) };
      }
      // Cambio de ronda: otra pregunta del mismo nivel, desde cero.
      return estadoDePregunta(banco, e.indice, e.vistas, usados, azar, e.ms + acotarMs(accion.ms, config), e.pregunta.id);
    }

    case 'siguiente': {
      if (e.fase !== 'revelada') return e;
      // Un punto por acierto: al fallar te quedas con los que llevabas.
      if (!e.acierto) return terminar(e, e.causaFallo === 'tiempo' ? 'tiempo' : 'fallo', e.indice);
      if (e.indice >= NIVELES.length - 1) return terminar(e, 'gano', NIVELES.length);
      return estadoDePregunta(banco, e.indice + 1, e.vistas, e.usados, azar, e.ms);
    }

    // Una accion que ya no existe (p. ej. 'plantarse', que se quito en la 0061) no hace nada.
    default:
      return e;
  }
}

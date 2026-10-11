import type { Coche, Vec } from './modelo';

/**
 * Lo que adorna "¿Conduces tú?" sin cambiar el juego: chispas y humo
 * (particulas) y las marcas de derrape en el asfalto. Sin importaciones salvo
 * tipos.
 */

export type TipoParticula = 'chispa' | 'humo' | 'polvo';
export type Particula = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  max: number;
  tipo: TipoParticula;
  tam: number;
};

type Azar = () => number;
const MAX_PARTICULAS = 260;

/** Un chorro de chispas en el punto del golpe; mas cuanto mas fuerte. */
export function chispas(p: Vec, fuerza: number, azar: Azar): Particula[] {
  const n = Math.round(10 + Math.min(fuerza, 20) * 1.5);
  return Array.from({ length: n }, () => {
    const a = azar() * Math.PI * 2;
    const v = 4 + azar() * 10;
    const vida = 0.25 + azar() * 0.45;
    return { x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida, max: vida, tipo: 'chispa' as const, tam: 0.12 };
  });
}

/** Una bocanada de humo (motor tocado o rueda derrapando). */
export function bocanada(p: Vec, tipo: 'humo' | 'polvo', azar: Azar): Particula {
  const vida = tipo === 'humo' ? 1.4 + azar() * 0.8 : 0.6 + azar() * 0.4;
  return {
    x: p.x + (azar() - 0.5) * 0.4,
    y: p.y + (azar() - 0.5) * 0.4,
    vx: (azar() - 0.5) * 0.8,
    vy: (azar() - 0.5) * 0.8,
    vida,
    max: vida,
    tipo,
    tam: tipo === 'humo' ? 0.5 : 0.35,
  };
}

export function avanzarParticulas(ps: readonly Particula[], dt: number): Particula[] {
  const vivas: Particula[] = [];
  for (const p of ps) {
    const vida = p.vida - dt;
    if (vida <= 0) continue;
    const roce = p.tipo === 'chispa' ? Math.exp(-3 * dt) : Math.exp(-1.2 * dt);
    vivas.push({
      ...p,
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt,
      vx: p.vx * roce,
      vy: p.vy * roce,
      vida,
      // El humo se abre al subir.
      tam: p.tipo === 'chispa' ? p.tam : p.tam + dt * (p.tipo === 'humo' ? 1.1 : 0.9),
    });
  }
  return vivas.length > MAX_PARTICULAS ? vivas.slice(vivas.length - MAX_PARTICULAS) : vivas;
}

// ---------------------------------------------------------------------------
// Marcas de derrape
// ---------------------------------------------------------------------------

export type Marca = { x1: number; y1: number; x2: number; y2: number };
const MAX_MARCAS = 700;

/** Las dos ruedas de atras, en el mundo. */
export function ruedasTraseras(c: Coche): [Vec, Vec] {
  const fx = Math.sin(c.ang);
  const fy = -Math.cos(c.ang);
  const rx = Math.cos(c.ang);
  const ry = Math.sin(c.ang);
  const atras = -1.35;
  const lado = 0.75;
  return [
    { x: c.x + fx * atras - rx * lado, y: c.y + fy * atras - ry * lado },
    { x: c.x + fx * atras + rx * lado, y: c.y + fy * atras + ry * lado },
  ];
}

/**
 * Va dejando marcas mientras `marcando` es cierto; cuando deja de serlo, la
 * siguiente marca empieza de nuevo (no une con la anterior).
 */
export class Derrapes {
  marcas: Marca[] = [];
  private ultimo: [Vec, Vec] | null = null;

  seguir(c: Coche, marcando: boolean) {
    if (!marcando) {
      this.ultimo = null;
      return;
    }
    const ahora = ruedasTraseras(c);
    if (this.ultimo) {
      for (const k of [0, 1] as const) {
        const a = this.ultimo[k];
        const b = ahora[k];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) continue;
        this.marcas.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
      if (this.marcas.length > MAX_MARCAS) this.marcas.splice(0, this.marcas.length - MAX_MARCAS);
    }
    this.ultimo = ahora;
  }
}

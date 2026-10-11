/**
 * "¿Conduces tú?": el coche, sus choques y la camara, sin nada de pantalla.
 *
 * Fisica ARCADE a proposito, con pocas variables que se sientan bien (no un
 * simulador): el coche tiene posicion, rumbo y una velocidad en el mundo. En
 * cada paso esa velocidad se mira desde el coche (hacia delante y de lado):
 * los pedales tocan la de delante, el agarre se come poco a poco la de lado,
 * y el volante gira el rumbo. Como la velocidad no gira de golpe con el
 * rumbo, en las curvas rapidas el coche se va un poco de lado: el derrape
 * sale solo, sin programarlo.
 *
 * Unidades: metros, segundos y radianes. Rumbo 0 = hacia arriba en el mapa
 * (y negativa), y crece en el sentido de las agujas del reloj: girar a la
 * derecha suma.
 */

export type Vec = { x: number; y: number };

export type Coche = {
  x: number;
  y: number;
  /** Rumbo en radianes (0 = arriba). */
  ang: number;
  /** Velocidad en el mundo, m/s. */
  vx: number;
  vy: number;
};

/** Lo que pide el jugador en este instante. */
export type Entrada = {
  /** Volante: -1 todo a la izquierda, 1 todo a la derecha. */
  giro: number;
  acelerar: boolean;
  /** Frena y, ya parado, da marcha atras. */
  frenar: boolean;
};

export const ENTRADA_NULA: Entrada = { giro: 0, acelerar: false, frenar: false };

/** Medidas del coche en metros (un utilitario). */
export const COCHE = { largo: 4.2, ancho: 1.85 };

/** Los mandos del "como se siente". Todos en unidades del mundo. */
export const FISICA = {
  /** m/s² con el acelerador pisado. */
  aceleracion: 8,
  /** m/s² frenando mientras aun va hacia delante. */
  frenada: 18,
  /** m/s² de la marcha atras, que es floja. */
  aceleracionAtras: 5,
  /** 20 m/s son 72 km/h: por un casco historico ya es mucho. */
  velMax: 20,
  velMaxAtras: 6,
  /** m/s² que pierde rodando sin tocar pedales. */
  rozamiento: 1.5,
  /** Lo que se come el aire, proporcional a la velocidad (por segundo). */
  resistencia: 0.15,
  /** rad/s de giro con el volante a tope y velocidad suficiente. */
  giroMax: 2.2,
  /** Por debajo de esta velocidad el giro es proporcional: parado no gira. */
  velGiroPleno: 6,
  /** Cuanto agarran las ruedas de lado (por segundo). Menos = mas derrape. */
  agarre: 7,
} as const;

export type Fisica = { readonly [K in keyof typeof FISICA]: number };

export const adelante = (ang: number): Vec => ({ x: Math.sin(ang), y: -Math.cos(ang) });
export const derecha = (ang: number): Vec => ({ x: Math.cos(ang), y: Math.sin(ang) });
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Velocidad en el sentido de la marcha (negativa = marcha atras). */
export function velocidadAdelante(c: Coche): number {
  const f = adelante(c.ang);
  return c.vx * f.x + c.vy * f.y;
}

/** Velocidad de lado: lo que derrapa. */
export function velocidadLateral(c: Coche): number {
  const r = derecha(c.ang);
  return c.vx * r.x + c.vy * r.y;
}

/** Un paso de `dt` segundos. Mejor pasos cortos (ver PASO). */
export function avanzarCoche(c: Coche, e: Entrada, dt: number, p: Fisica = FISICA): Coche {
  const f = adelante(c.ang);
  const r = derecha(c.ang);
  let vf = c.vx * f.x + c.vy * f.y;
  let vl = c.vx * r.x + c.vy * r.y;

  if (e.acelerar && !e.frenar) {
    vf += p.aceleracion * dt;
  } else if (e.frenar) {
    // Primero frena; casi parado, marcha atras.
    vf = vf > 0.5 ? Math.max(0, vf - p.frenada * dt) : vf - p.aceleracionAtras * dt;
  } else {
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), p.rozamiento * dt);
  }
  vf *= Math.exp(-p.resistencia * dt);
  vf = limitar(vf, -p.velMaxAtras, p.velMax);
  vl *= Math.exp(-p.agarre * dt);

  // Parado no gira; marcha atras gira al reves, como un coche de verdad.
  const factor = limitar(vf / p.velGiroPleno, -1, 1);
  const ang = c.ang + limitar(e.giro, -1, 1) * p.giroMax * factor * dt;

  // La velocidad se rehace con los ejes de ANTES de girar: el rumbo cambia ya,
  // la inercia tarda un poco. De ahi el derrape.
  const vx = f.x * vf + r.x * vl;
  const vy = f.y * vf + r.y * vl;
  return { x: c.x + vx * dt, y: c.y + vy * dt, ang, vx, vy };
}

/** Paso fijo de la simulacion (s): con pasos cortos los choques no atraviesan nada. */
export const PASO = 1 / 120;

// ---------------------------------------------------------------------------
// Choques
// ---------------------------------------------------------------------------

/**
 * Un obstaculo: rectangulo con centro, medidas y giro. Edificios, bolardos,
 * coches aparcados... todo es una caja.
 */
export type Caja = { x: number; y: number; w: number; h: number; ang: number };

/** El coche, para chocar, son tres circulos en fila: barato y se nota bien en las esquinas. */
export const RADIO_CIRCULO = COCHE.ancho / 2;
const SEPARACION = (COCHE.largo - COCHE.ancho) / 2;

export function circulosDelCoche(c: Coche): Vec[] {
  const f = adelante(c.ang);
  return [-SEPARACION, 0, SEPARACION].map((d) => ({ x: c.x + f.x * d, y: c.y + f.y * d }));
}

/** Cuanto rebota tras un golpe (0 = se queda pegado, 1 = pelota). */
const REBOTE = 0.25;
/** Lo que conserva de la velocidad a lo largo de la pared al rozarla. */
const ROCE = 0.9;

/**
 * Empuja el coche fuera de las cajas que pisa y le quita la velocidad que iba
 * contra ellas. Devuelve tambien el golpe mas fuerte (m/s contra la pared): asi
 * se distingue un roce de un choque de verdad.
 */
export function resolverChoques(
  c: Coche,
  cajas: readonly Caja[],
): { coche: Coche; impacto: number; punto: Vec | null } {
  let { x, y, vx, vy } = c;
  let impacto = 0;
  // Donde fue el golpe mas fuerte: ahi salen las chispas.
  let punto: Vec | null = null;
  // Un par de vueltas: al salir de una caja se puede entrar en la de al lado (una esquina).
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    let movido = false;
    for (const caja of cajas) {
      // Descarte rapido por distancia.
      const alcance = Math.hypot(caja.w, caja.h) / 2 + COCHE.largo / 2 + RADIO_CIRCULO;
      if (Math.abs(caja.x - x) > alcance || Math.abs(caja.y - y) > alcance) continue;

      for (const p of circulosDelCoche({ ...c, x, y })) {
        const golpe = circuloContraCaja(p, RADIO_CIRCULO, caja);
        if (!golpe) continue;
        movido = true;
        x += golpe.n.x * golpe.hondo;
        y += golpe.n.y * golpe.hondo;
        const vn = vx * golpe.n.x + vy * golpe.n.y;
        if (vn < 0) {
          if (-vn > impacto) punto = { x: p.x - golpe.n.x * RADIO_CIRCULO, y: p.y - golpe.n.y * RADIO_CIRCULO };
          impacto = Math.max(impacto, -vn);
          vx -= (1 + REBOTE) * vn * golpe.n.x;
          vy -= (1 + REBOTE) * vn * golpe.n.y;
          vx *= ROCE;
          vy *= ROCE;
        }
      }
    }
    if (!movido) break;
  }
  return { coche: { ...c, x, y, vx, vy }, impacto, punto };
}

/** Si un circulo se mete en una caja: hacia donde sacarlo (normal) y cuanto. */
export function circuloContraCaja(p: Vec, r: number, caja: Caja): { n: Vec; hondo: number } | null {
  const cos = Math.cos(caja.ang);
  const sin = Math.sin(caja.ang);
  // El punto, visto desde la caja (sin giro).
  const dx = p.x - caja.x;
  const dy = p.y - caja.y;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const mx = caja.w / 2;
  const my = caja.h / 2;
  const cx = limitar(lx, -mx, mx);
  const cy = limitar(ly, -my, my);
  let nx = lx - cx;
  let ny = ly - cy;
  const d = Math.hypot(nx, ny);
  let hondo: number;
  if (d > 1e-9) {
    if (d >= r) return null;
    nx /= d;
    ny /= d;
    hondo = r - d;
  } else {
    // El centro esta DENTRO de la caja: se saca por el lado mas cercano.
    const aX = mx - Math.abs(lx);
    const aY = my - Math.abs(ly);
    if (aX < aY) {
      nx = Math.sign(lx) || 1;
      ny = 0;
      hondo = aX + r;
    } else {
      nx = 0;
      ny = Math.sign(ly) || 1;
      hondo = aY + r;
    }
  }
  // La normal, de vuelta al mundo.
  return { n: { x: nx * cos - ny * sin, y: nx * sin + ny * cos }, hondo };
}

// ---------------------------------------------------------------------------
// Camara
// ---------------------------------------------------------------------------

/** Lo que mira la pantalla: un punto y un giro (el del coche, suavizado). */
export type Camara = { x: number; y: number; ang: number };

/** Metros que la camara se adelanta al coche a toda velocidad: se ve lo que viene. */
export const ADELANTO_CAMARA = 9;

/** Diferencia de angulos por el camino corto, en (-PI, PI]. */
export function difAngulo(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** La camara persigue al coche con suavidad (independiente de los fps). */
export function seguirCoche(cam: Camara, c: Coche, dt: number): Camara {
  const f = adelante(c.ang);
  const adelanto = (limitar(velocidadAdelante(c), 0, FISICA.velMax) / FISICA.velMax) * ADELANTO_CAMARA;
  const objetivo = { x: c.x + f.x * adelanto, y: c.y + f.y * adelanto };
  const kPos = 1 - Math.exp(-5 * dt);
  const kAng = 1 - Math.exp(-3 * dt);
  return {
    x: cam.x + (objetivo.x - cam.x) * kPos,
    y: cam.y + (objetivo.y - cam.y) * kPos,
    ang: cam.ang + difAngulo(c.ang, cam.ang) * kAng,
  };
}

// ---------------------------------------------------------------------------
// Joystick
// ---------------------------------------------------------------------------

/** Zona muerta del joystick: un temblor del dedo no gira. */
export const ZONA_MUERTA = 0.12;

/**
 * Del dedo al volante: solo cuenta el eje horizontal. `dx` es lo que se ha
 * movido el dedo desde donde se apoyo, y `radio` lo que mide el joystick.
 */
export function giroDelJoystick(dx: number, radio: number, zonaMuerta = ZONA_MUERTA): number {
  const v = limitar(dx / radio, -1, 1);
  if (Math.abs(v) < zonaMuerta) return 0;
  // Se reescala para que justo pasada la zona muerta empiece desde 0, sin salto.
  return (Math.sign(v) * (Math.abs(v) - zonaMuerta)) / (1 - zonaMuerta);
}

/** Donde se dibuja la bola del joystick: el dedo, pero sin salirse del aro. */
export function bolaDelJoystick(dx: number, dy: number, radio: number): Vec {
  const d = Math.hypot(dx, dy);
  if (d <= radio) return { x: dx, y: dy };
  return { x: (dx / d) * radio, y: (dy / d) * radio };
}

// ---------------------------------------------------------------------------
// Los tres choques
// ---------------------------------------------------------------------------

/** Al tercero se acaba la partida. */
export const CHOQUES_MAX = 3;
/** Segundos sin que cuente otro choque despues de uno. */
export const INVULNERABLE = 2;
/**
 * m/s contra la pared para que un golpe cuente como choque. Rozar un bordillo
 * o arrimarse a un coche aparcado no es un choque: un golpe de verdad, si.
 */
export const GOLPE_MINIMO = 4.5;

export type EstadoChoques = { choques: number; invulnerableHasta: number };

/** Decide si un golpe cuenta como choque, y deja el estado como queda. */
export function registrarGolpe(
  e: EstadoChoques,
  impacto: number,
  ahora: number,
): { estado: EstadoChoques; choque: boolean } {
  if (impacto < GOLPE_MINIMO || ahora < e.invulnerableHasta || e.choques >= CHOQUES_MAX) {
    return { estado: e, choque: false };
  }
  return { estado: { choques: e.choques + 1, invulnerableHasta: ahora + INVULNERABLE }, choque: true };
}

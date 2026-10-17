/**
 * El sonido de Don Quijote Cervecero, generado con el audio del navegador (Web
 * Audio), sin ficheros ni librerias: el galope de Rocinante, el tintineo de
 * las jarras, los golpes, la fanfarria de la Embestida y el estruendo de un
 * gigante al caer. Desactivado por defecto; se recuerda en este movil.
 *
 * El navegador solo deja arrancar el audio dentro de un toque: por eso
 * `encender()` se llama desde un boton.
 */

const CLAVE = 'minijuegos.quijote.sonido.v1';

export function sonidoGuardado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export function guardarSonido(activo: boolean) {
  try {
    localStorage.setItem(CLAVE, activo ? '1' : '0');
  } catch {
    // Sin almacen: se juega igual, solo que no se recuerda.
  }
}

export class SonidoQuijote {
  private ctx: AudioContext | null = null;
  private salida: GainNode | null = null;
  private ruido: AudioBuffer | null = null;
  /** Fase del galope: cada vuelta, tres golpes de casco (ta-ca-ta). */
  private fase = 0;

  get activo(): boolean {
    return this.ctx !== null;
  }

  encender() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Clase: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Clase) return;
    const ctx = new Clase();
    this.ctx = ctx;
    this.salida = ctx.createGain();
    this.salida.gain.value = 0.55;
    this.salida.connect(ctx.destination);
    // Un segundo de ruido blanco, reutilizado para cascos, golpes y estruendos.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const datos = buffer.getChannelData(0);
    for (let k = 0; k < datos.length; k++) datos[k] = Math.random() * 2 - 1;
    this.ruido = buffer;
  }

  apagar() {
    void this.ctx?.close();
    this.ctx = null;
    this.salida = null;
    this.ruido = null;
  }

  /** Pausa sin perder nada (al pausar la partida o salir de la app). */
  silencio() {
    void this.ctx?.suspend();
  }

  /** Un golpe de ruido filtrado: casco, choque o estruendo, segun frecuencia y duracion. */
  private golpeRuido(frecuencia: number, duracion: number, volumen: number, retraso = 0) {
    const { ctx, salida, ruido } = this;
    if (!ctx || !salida || !ruido) return;
    const t = ctx.currentTime + retraso;
    const fuente = ctx.createBufferSource();
    fuente.buffer = ruido;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = frecuencia;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volumen, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duracion);
    fuente.connect(filtro).connect(g).connect(salida);
    fuente.start(t, Math.random() * 0.5);
    fuente.stop(t + duracion + 0.02);
  }

  /** Una nota corta (tono puro o cuadrado), para tintineos y fanfarrias. */
  private nota(frecuencia: number, duracion: number, volumen: number, tipo: OscillatorType = 'sine', retraso = 0, hasta?: number) {
    const { ctx, salida } = this;
    if (!ctx || !salida) return;
    const t = ctx.currentTime + retraso;
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(frecuencia, t);
    if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t + duracion);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volumen, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duracion);
    o.connect(g).connect(salida);
    o.start(t);
    o.stop(t + duracion + 0.02);
  }

  /** Cada fotograma: el galope, con el ritmo de la velocidad. Callado si esta en el aire. */
  galope(dt: number, velocidad: number, enSuelo: boolean) {
    if (!this.ctx || velocidad <= 0) return;
    const antes = this.fase;
    // Mismas zancadas por metro que la animacion de las patas (modelos/quijote.ts).
    this.fase += (velocidad * dt * 0.55) / (Math.PI * 2);
    if (!enSuelo) return;
    for (const golpe of [0, 0.18, 0.36]) {
      if (Math.floor(antes - golpe) !== Math.floor(this.fase - golpe)) this.golpeRuido(420, 0.07, 0.35);
    }
  }

  jarra() {
    this.nota(1320, 0.12, 0.12);
    this.nota(1980, 0.18, 0.08, 'sine', 0.05);
  }

  salto() {
    this.nota(300, 0.22, 0.05, 'triangle', 0, 700);
  }

  choque() {
    this.golpeRuido(260, 0.35, 0.9);
    this.nota(110, 0.3, 0.15, 'sawtooth', 0, 55);
  }

  escudo() {
    this.nota(880, 0.4, 0.12, 'triangle');
    this.nota(1760, 0.5, 0.06, 'sine', 0.02);
  }

  vida() {
    [660, 880, 1100].forEach((f, k) => this.nota(f, 0.16, 0.1, 'sine', k * 0.08));
  }

  /** Fanfarria de tres notas, a la carga. */
  embestida() {
    [392, 523, 784].forEach((f, k) => this.nota(f, k === 2 ? 0.45 : 0.14, 0.09, 'square', k * 0.12));
  }

  /** El estruendo de un gigante (molino) al caer. */
  gigante() {
    this.golpeRuido(900, 0.9, 0.8);
    this.golpeRuido(160, 1.2, 0.9, 0.08);
    this.nota(90, 0.9, 0.18, 'sawtooth', 0, 40);
  }
}

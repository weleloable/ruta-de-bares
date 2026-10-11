/**
 * El sonido de "¿Conduces tú?", generado con el audio del navegador (Web
 * Audio): motor, derrape y golpes, sin ficheros ni librerias. Desactivado por
 * defecto; se activa con el boton del altavoz y se recuerda en este movil.
 *
 * El navegador solo deja arrancar el audio dentro de un toque: por eso
 * `encender()` se llama desde el boton.
 */

const CLAVE = 'minijuegos.conduces.sonido.v1';

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

type Ctx = AudioContext;

export class SonidoCoche {
  private ctx: Ctx | null = null;
  private motor: OscillatorNode | null = null;
  private motorGanancia: GainNode | null = null;
  private filtro: BiquadFilterNode | null = null;
  private derrape: GainNode | null = null;
  private ruido: AudioBuffer | null = null;

  get activo(): boolean {
    return this.ctx !== null;
  }

  encender() {
    if (this.ctx) return;
    const Clase: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Clase) return;
    const ctx = new Clase();
    this.ctx = ctx;

    // Motor: diente de sierra grave, filtrado para que no chirrie.
    this.filtro = ctx.createBiquadFilter();
    this.filtro.type = 'lowpass';
    this.filtro.frequency.value = 500;
    this.motorGanancia = ctx.createGain();
    this.motorGanancia.gain.value = 0;
    this.motor = ctx.createOscillator();
    this.motor.type = 'sawtooth';
    this.motor.frequency.value = 45;
    this.motor.connect(this.filtro).connect(this.motorGanancia).connect(ctx.destination);
    this.motor.start();

    // Ruido blanco en bucle: el chirrido del derrape (pasado por un filtro agudo).
    const largo = ctx.sampleRate;
    this.ruido = ctx.createBuffer(1, largo, ctx.sampleRate);
    const datos = this.ruido.getChannelData(0);
    for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
    const fuente = ctx.createBufferSource();
    fuente.buffer = this.ruido;
    fuente.loop = true;
    const banda = ctx.createBiquadFilter();
    banda.type = 'bandpass';
    banda.frequency.value = 1800;
    banda.Q.value = 2;
    this.derrape = ctx.createGain();
    this.derrape.gain.value = 0;
    fuente.connect(banda).connect(this.derrape).connect(ctx.destination);
    fuente.start();
  }

  apagar() {
    const ctx = this.ctx;
    this.ctx = null;
    this.motor = null;
    this.motorGanancia = null;
    this.filtro = null;
    this.derrape = null;
    void ctx?.close();
  }

  /** Cada fotograma: velocidad (m/s), si se acelera y cuanto derrapa (0..1). */
  actualizar(velocidad: number, acelerando: boolean, derrape: number) {
    if (!this.ctx || !this.motor || !this.motorGanancia || !this.filtro || !this.derrape) return;
    const t = this.ctx.currentTime;
    const v = Math.min(Math.abs(velocidad) / 20, 1);
    this.motor.frequency.setTargetAtTime(42 + v * 90 + (acelerando ? 12 : 0), t, 0.08);
    this.filtro.frequency.setTargetAtTime(380 + v * 900, t, 0.1);
    this.motorGanancia.gain.setTargetAtTime(0.035 + v * 0.035 + (acelerando ? 0.015 : 0), t, 0.1);
    this.derrape.gain.setTargetAtTime(Math.min(derrape, 1) * 0.09, t, 0.05);
  }

  /** Un golpe: ruido seco y un "bum" grave, mas fuerte cuanto mas fuerte el choque (0..1). */
  golpe(fuerza: number) {
    if (!this.ctx || !this.ruido) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = Math.min(Math.max(fuerza, 0.2), 1);

    const fuente = ctx.createBufferSource();
    fuente.buffer = this.ruido;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * f, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const pasa = ctx.createBiquadFilter();
    pasa.type = 'lowpass';
    pasa.frequency.value = 2500;
    fuente.connect(pasa).connect(g).connect(ctx.destination);
    fuente.start(t);
    fuente.stop(t + 0.4);

    const bum = ctx.createOscillator();
    bum.type = 'sine';
    bum.frequency.setValueAtTime(110, t);
    bum.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const gb = ctx.createGain();
    gb.gain.setValueAtTime(0.6 * f, t);
    gb.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    bum.connect(gb).connect(ctx.destination);
    bum.start(t);
    bum.stop(t + 0.32);
  }

  /** Para el motor un momento (fin de partida) sin cerrar el audio. */
  silencio() {
    if (!this.ctx || !this.motorGanancia || !this.derrape) return;
    const t = this.ctx.currentTime;
    this.motorGanancia.gain.setTargetAtTime(0, t, 0.05);
    this.derrape.gain.setTargetAtTime(0, t, 0.05);
  }
}

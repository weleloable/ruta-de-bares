/**
 * Tests del teaser: rapidos, sin Chrome ni ffmpeg.  npm test --prefix scripts/teaser
 * Vigilan lo que no se ve al mirar un fotograma suelto: huecos en el guion,
 * cortes fuera de pulso, planos que se congelan, musica que no cuadra con el
 * video y una escena que deje de ser repetible.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import * as G from './guion.mjs';
import { FRECUENCIA, aWav, generarMusica } from './musica.mjs';

const escena = readFileSync(new URL('./escena.html', import.meta.url), 'utf8');

describe('guion', () => {
  it('las escenas van seguidas, sin huecos ni solapes, de 0 al final', () => {
    assert.equal(G.ESCENAS[0].inicio, 0);
    for (let i = 1; i < G.ESCENAS.length; i++) assert.equal(G.ESCENAS[i].inicio, G.ESCENAS[i - 1].fin, G.ESCENAS[i].id);
    for (const e of G.ESCENAS) assert.ok(e.fin > e.inicio, e.id);
  });

  it('dura lo que pidieron: corto, entre 15 y 25 s', () => {
    assert.ok(G.DURACION >= 15 && G.DURACION <= 25, `dura ${G.DURACION} s`);
    assert.equal(G.FOTOGRAMAS, G.DURACION * G.FPS);
  });

  it('todo corte cae en golpe (cada 0,5 s a 120 BPM)', () => {
    for (const e of G.ESCENAS) {
      const golpes = e.inicio / G.GOLPE;
      assert.ok(Math.abs(golpes - Math.round(golpes)) < 1e-9, `${e.id} empieza a ${e.inicio} s`);
    }
  });

  it('acaba en "Próximamente disponible" (lo pidio el equipo)', () => {
    const cierre = G.ESCENAS.at(-1);
    assert.equal(cierre.tipo, 'cierre');
    assert.deepEqual(cierre.titular, ['PRÓXIMAMENTE', 'DISPONIBLE']);
    assert.ok(G.DURACION - cierre.inicio >= 4, 'el cartel final se tiene que poder leer');
  });

  it('la fecha del sello es la de la ruta y el dia de la semana cuadra', () => {
    const { fecha } = G.ESCENAS.at(-1);
    assert.equal(fecha.iso, '2026-10-17');
    const d = new Date(`${fecha.iso}T12:00:00Z`);
    const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    assert.deepEqual(fecha.lineas, [dias[d.getUTCDay()], String(d.getUTCDate()), meses[d.getUTCMonth()]]);
    assert.ok(G.golpesSonoros().some((g) => g.tipo === 'sello' && g.t === fecha.t), 'el sello de la fecha suena');
    assert.ok(Math.abs(fecha.t / G.GOLPE - Math.round(fecha.t / G.GOLPE)) < 1e-9, 'y cae en golpe');
  });

  it('cada escena de movil tiene plano, y el plano no se congela antes de tiempo', () => {
    for (const e of G.ESCENAS.filter((e) => e.tipo === 'movil')) {
      const p = G.PLANOS[e.plano];
      assert.ok(p, `${e.id}: no existe el plano ${e.plano}`);
      assert.ok(G.duracionPlano(p) + 1e-9 >= e.fin - e.inicio, `${e.id}: el plano dura menos que la escena`);
    }
  });

  it('los tramos estan dentro de la grabacion fuente y en orden', () => {
    for (const [id, p] of Object.entries(G.PLANOS)) {
      for (const [a, b] of p.tramos) {
        assert.ok(a >= 0 && b <= 71.4 && b > a, `${id}: [${a}, ${b}]`);
      }
    }
  });

  it('tiempoFuente recorre los tramos seguidos y salta el hueco entre ellos', () => {
    const p = G.PLANOS.cana; // [[50.9, 51.4], [54.1, 54.6]]
    assert.equal(G.tiempoFuente(p, 0), 50.9);
    assert.ok(Math.abs(G.tiempoFuente(p, 0.6) - 54.2) < 1e-9);
    assert.ok(G.tiempoFuente(p, 99) < 54.6);
    const ts = G.fotogramasPlano(p);
    assert.equal(ts.length, 30);
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i] > ts[i - 1]);
    assert.ok(!ts.some((t) => t > 51.4 && t < 54.1), 'ningun fotograma del movil inclinado');
  });

  it('escenaEn devuelve la escena de cada instante', () => {
    assert.equal(G.escenaEn(0).id, 'negro');
    assert.equal(G.escenaEn(4.0).id, 'sellar');
    assert.equal(G.escenaEn(4.9999).id, 'sellar');
    assert.equal(G.escenaEn(G.DURACION).id, 'cierre');
  });

  it('los golpes de sonido van ordenados y dentro del video', () => {
    const g = G.golpesSonoros();
    for (let i = 1; i < g.length; i++) assert.ok(g[i].t >= g[i - 1].t);
    for (const x of g) assert.ok(x.t >= 0 && x.t < G.DURACION, `${x.tipo} a ${x.t}`);
    assert.ok(g.some((x) => x.tipo === 'sello' && x.t === 4.75), 'el SELLADO suena cuando se ve');
  });
});

describe('musica', () => {
  const a = generarMusica();

  it('dura exactamente lo que el video', () => {
    assert.equal(a.L.length, G.DURACION * FRECUENCIA);
    assert.equal(a.R.length, a.L.length);
  });

  it('no satura: pico a -1 dBFS y ningun NaN', () => {
    let pico = 0;
    for (const v of [...a.L, ...a.R]) { assert.ok(Number.isFinite(v)); pico = Math.max(pico, Math.abs(v)); }
    assert.ok(Math.abs(20 * Math.log10(pico) + 1) < 0.01, `pico ${20 * Math.log10(pico)} dBFS`);
  });

  it('el drop suena mas fuerte que el final (que se apaga)', () => {
    const rms = (desde, hasta) => {
      let s = 0; const i0 = desde * FRECUENCIA, i1 = hasta * FRECUENCIA;
      for (let i = i0; i < i1; i++) s += a.L[i] ** 2;
      return Math.sqrt(s / (i1 - i0));
    };
    assert.ok(rms(4, 9) > rms(G.DURACION - 0.5, G.DURACION) * 3);
    assert.ok(rms(4, 9) > 0.05, 'el drop no puede estar casi mudo');
  });

  it('es determinista: dos renders dan el mismo WAV', () => {
    const h = (x) => createHash('sha256').update(aWav(x)).digest('hex');
    assert.equal(h(a), h(generarMusica()));
  });
});

describe('escena', () => {
  it('no depende del reloj: todo sale de t', () => {
    // sin comentarios: la cabecera EXPLICA que no se usa Date.now, y eso vale
    const codigo = escena.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const prohibido of ['Date.now', 'performance.now', 'requestAnimationFrame', 'Math.random', '@keyframes', 'transition:', 'animation:']) {
      assert.ok(!codigo.includes(prohibido), `escena.html usa ${prohibido}`);
    }
  });

  it('sabe pintar cada tipo de escena del guion', () => {
    const tipos = new Set(G.ESCENAS.map((e) => e.tipo).filter((t) => t !== 'negro'));
    for (const t of tipos) assert.ok(escena.includes(`e.tipo === '${t}'`), `falta pintar '${t}'`);
  });

  it('usa assets que existen en el repo', () => {
    for (const m of escena.matchAll(/\.\.\/\.\.\/assets\/[\w/.-]+/g)) {
      assert.doesNotThrow(() => readFileSync(new URL(m[0], import.meta.url)), m[0]);
    }
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { elegirGuia, textoGuia, type EntornoInstalar, type GuiaInstalar } from './guiaInstalar.ts';

// User-agents reales (recortados a lo que importa para decidir).
const UA = {
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  firefoxIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  whatsappIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  instagramIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 330.0.0.0.0 (iPhone14,2)',
  safariIpadEscritorio:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  whatsappAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.0;]',
  chromeEscritorio:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

const entorno = (userAgent: string, cambios: Partial<EntornoInstalar> = {}): EntornoInstalar => ({
  userAgent,
  plataforma: /iPhone/.test(userAgent) ? 'iPhone' : /Android/.test(userAgent) ? 'Linux armv8l' : 'Win32',
  puntosTactiles: /iPhone|Android/.test(userAgent) ? 5 : 0,
  yaInstalada: false,
  avisoNativoListo: false,
  ...cambios,
});

describe('elegirGuia', () => {
  it('iPhone con Safari: instrucciones de Compartir', () => {
    assert.equal(elegirGuia(entorno(UA.safariIphone)), 'ios-safari');
  });

  it('iPhone con Chrome o Firefox: tambien por Compartir, pero con el boton junto a la barra', () => {
    assert.equal(elegirGuia(entorno(UA.chromeIphone)), 'ios-otro');
    assert.equal(elegirGuia(entorno(UA.firefoxIphone)), 'ios-otro');
  });

  it('iPad en "sitio de escritorio" (se hace pasar por un Mac) cuenta como iOS', () => {
    const e = entorno(UA.safariIpadEscritorio, { plataforma: 'MacIntel', puntosTactiles: 5 });
    assert.equal(elegirGuia(e), 'ios-safari');
  });

  it('un Mac de verdad (sin pantalla tactil) no recibe guia', () => {
    assert.equal(elegirGuia(entorno(UA.safariMac, { plataforma: 'MacIntel', puntosTactiles: 0 })), null);
  });

  it('navegadores integrados (WhatsApp, Instagram, Facebook): abrir en el navegador', () => {
    assert.equal(elegirGuia(entorno(UA.whatsappIphone)), 'abrir-en-navegador'); // sin "Safari/"
    assert.equal(elegirGuia(entorno(UA.instagramIphone)), 'abrir-en-navegador');
    assert.equal(elegirGuia(entorno(UA.whatsappAndroid)), 'abrir-en-navegador'); // "; wv)"
    assert.equal(elegirGuia(entorno(UA.facebookAndroid)), 'abrir-en-navegador');
  });

  it('Android sin aviso nativo (Firefox, Chrome que lo descarto): guia del menu', () => {
    assert.equal(elegirGuia(entorno(UA.chromeAndroid)), 'menu');
    assert.equal(elegirGuia(entorno(UA.firefoxAndroid)), 'menu');
  });

  it('si el navegador ya tiene su aviso de instalar, no hace falta guia (se usa el nativo)', () => {
    assert.equal(elegirGuia(entorno(UA.chromeAndroid, { avisoNativoListo: true })), null);
  });

  it('ya instalada: nada, ni en iPhone', () => {
    assert.equal(elegirGuia(entorno(UA.safariIphone, { yaInstalada: true })), null);
    assert.equal(elegirGuia(entorno(UA.chromeAndroid, { yaInstalada: true })), null);
  });

  it('ordenador sin evento: no se ofrece nada (no hay forma fiable de instalar)', () => {
    assert.equal(elegirGuia(entorno(UA.chromeEscritorio)), null);
  });
});

describe('textoGuia', () => {
  const guias: GuiaInstalar[] = ['ios-safari', 'ios-otro', 'abrir-en-navegador', 'menu'];

  it('cada guia tiene titulo y de tres a cuatro pasos con texto', () => {
    for (const g of guias) {
      const t = textoGuia(g);
      assert.ok(t.titulo.length > 0, g);
      assert.ok(t.pasos.length >= 3 && t.pasos.length <= 4, `${g}: ${t.pasos.length} pasos`);
      for (const p of t.pasos) assert.ok(p.trim().length > 10, `${g}: ${p}`);
    }
  });

  it('las de iPhone nombran Compartir, "Ver más" y "Añadir a pantalla de inicio"', () => {
    for (const g of ['ios-safari', 'ios-otro'] as const) {
      const texto = textoGuia(g).pasos.join(' ');
      assert.match(texto, /Compartir/);
      assert.match(texto, /«Ver más»/);
      assert.match(texto, /Añadir a pantalla de inicio/);
      // El boton se llama "Ver más", no "Más": asi lo ve quien lo usa en su iPhone.
      assert.doesNotMatch(texto, /«Más»/);
    }
  });

  it('en Safari, lo primero son los tres puntos «•••» y luego Compartir, en ese orden', () => {
    const pasos = textoGuia('ios-safari').pasos;
    assert.match(pasos[0] ?? '', /«•••»/);
    assert.match(pasos[1] ?? '', /Compartir/);
    assert.ok(pasos.findIndex((p) => /Ver más/.test(p)) > 1, '"Ver más" va despues de Compartir');
  });
});

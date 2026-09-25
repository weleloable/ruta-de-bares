import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INSTAGRAM_URL } from '../../lib/enlacesExternos.ts';
import {
  CIERRES,
  CUENTA_INSTAGRAM,
  DIPLOMA_ALTO,
  DIPLOMA_ANCHO,
  DIPLOMA_PIXEL_RATIO,
  cierreDiploma,
  lineaCompletado,
  nombreFicheroDiploma,
  rutaEnDiploma,
} from './textoDiploma.ts';

describe('CUENTA_INSTAGRAM', () => {
  it('es la cuenta del enlace de Instagram de la app (una sola verdad)', () => {
    assert.equal(CUENTA_INSTAGRAM, `@${INSTAGRAM_URL.replace(/\/+$/, '').split('/').pop()}`);
  });
  it('empieza por @ y no lleva espacios (se pega tal cual como mencion)', () => {
    assert.match(CUENTA_INSTAGRAM, /^@[a-z0-9._]+$/);
  });
});

describe('lineaCompletado', () => {
  it('"Nombre ha completado:"', () => {
    assert.equal(lineaCompletado('Dudu'), 'Dudu ha completado:');
  });
  it('sin nombre, Peregrino (como en la credencial)', () => {
    assert.equal(lineaCompletado('  '), 'Peregrino ha completado:');
  });
  it('recorta espacios', () => {
    assert.equal(lineaCompletado(' Ana '), 'Ana ha completado:');
  });
});

describe('rutaEnDiploma', () => {
  it('en mayusculas, con tildes bien puestas', () => {
    assert.equal(rutaEnDiploma('Ruta de Bares 26'), 'RUTA DE BARES 26');
    assert.equal(rutaEnDiploma(' compostelana alcalá '), 'COMPOSTELANA ALCALÁ');
  });
});

describe('cierreDiploma', () => {
  it('es siempre uno de los cierres', () => {
    for (const n of ['Dudu', 'Ana', 'Luis', 'Marta', '']) {
      assert.ok((CIERRES as readonly string[]).includes(cierreDiploma(n, 'Ruta de Bares 26')));
    }
  });

  it('es estable: la misma persona y ruta dicen siempre lo mismo', () => {
    assert.equal(cierreDiploma('Dudu', 'Ruta 26'), cierreDiploma('Dudu', 'Ruta 26'));
    assert.equal(cierreDiploma(' Dudu ', ' Ruta 26 '), cierreDiploma('Dudu', 'Ruta 26'));
  });

  it('reparte: con varios nombres salen varios cierres distintos', () => {
    const usados = new Set(['Dudu', 'Ana', 'Luis', 'Marta', 'Pepe', 'Lola', 'Nico', 'Sara'].map((n) => cierreDiploma(n, 'R')));
    assert.ok(usados.size >= 2);
  });

  it('ninguno es largo: caben en dos lineas del diploma', () => {
    for (const c of CIERRES) assert.ok(c.length <= 56, c);
  });
});

describe('nombreFicheroDiploma', () => {
  it('sin espacios, tildes ni mayusculas', () => {
    assert.equal(nombreFicheroDiploma('Ruta de Bares 26'), 'diploma-ruta-de-bares-26.png');
    assert.equal(nombreFicheroDiploma('Compostelana Alcalá'), 'diploma-compostelana-alcala.png');
  });
  it('un nombre sin letras ni numeros no deja el fichero vacio', () => {
    assert.equal(nombreFicheroDiploma('***'), 'diploma-ruta.png');
  });
});

describe('formato', () => {
  it('9:16 vertical, y a x3 son 1080 x 1920', () => {
    assert.equal(DIPLOMA_ANCHO * DIPLOMA_PIXEL_RATIO, 1080);
    assert.equal(DIPLOMA_ALTO * DIPLOMA_PIXEL_RATIO, 1920);
    assert.equal(DIPLOMA_ANCHO / DIPLOMA_ALTO, 9 / 16);
  });
});

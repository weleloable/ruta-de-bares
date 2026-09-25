import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DIPLOMA_ALTO,
  DIPLOMA_ANCHO,
  DIPLOMA_PIXEL_RATIO,
  fraseDiploma,
  nombreFicheroDiploma,
} from './textoDiploma.ts';

describe('fraseDiploma', () => {
  it('nombre, ruta y "con honores"', () => {
    assert.equal(fraseDiploma('Dudu', 'Ruta de Bares 26'), 'Dudu ha finalizado la Ruta de Bares 26 con honores.');
  });
  it('sin nombre, Peregrino (como en la credencial)', () => {
    assert.equal(fraseDiploma('  ', 'Ruta 1'), 'Peregrino ha finalizado la Ruta 1 con honores.');
  });
  it('recorta espacios sobrantes', () => {
    assert.equal(fraseDiploma(' Ana ', ' Ruta 2 '), 'Ana ha finalizado la Ruta 2 con honores.');
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

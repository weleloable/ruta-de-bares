import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Cableado de la olla de maceracion (Maestro Cervecero, paso 2). Lo que la olla
 * decide ensenar esta probado en maceracion.test.ts; esto es una red rapida y
 * PARCIAL que lee el codigo: que la pantalla la pinte con la temperatura de
 * verdad, que cada toque dispare la llamarada y que se respete "reducir
 * movimiento". La prueba de que se ve bien fue en Chrome (capturas del PR).
 */
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const paso = leer('src/features/minijuegos/juegos/maestro/PasoMaceracion.tsx');
const olla = leer('src/features/minijuegos/juegos/maestro/OllaMaceracion.tsx');

describe('maceracion: que quepa en la pantalla', () => {
  it('olla y termometro se encogen JUNTOS con la misma escala, y el boton Calentar va debajo', () => {
    assert.match(paso, /escalaOlla\(altoVentana, ALTO_RESTO_PASO, ALTO\)/);
    assert.match(paso, /<Termometro temp=\{estado\.temp\} min=\{TEMP_MIN\} max=\{TEMP_MAX\} zona=\{ZONA\} alto=\{altoTermometro\} \/>/);
    assert.match(paso, /const altoTermometro = ALTO \* escala;/);
    assert.ok(paso.indexOf('<OllaMaceracion') < paso.indexOf('accessibilityLabel="Calentar"'));
  });
});

describe('olla de maceracion', () => {
  it('la pantalla la pinta a la izquierda del termometro, con la temperatura del juego', () => {
    assert.match(
      paso,
      /<OllaMaceracion temp=\{estado\.temp\} pulsos=\{pulsos\} escala=\{escala\} \/>\s*<Termometro /,
    );
  });

  it('cada toque de Calentar suma un pulso (la llamarada)', () => {
    const tocar = paso.slice(paso.indexOf('const tocar'), paso.indexOf('const fin'));
    assert.match(tocar, /setPulsos\(\(n\) => n \+ 1\)/);
  });

  it('decide con climaOlla, la misma ZONA que puntua (o la de la levadura), y no con umbrales propios', () => {
    assert.match(olla, /climaOlla\(temp, zona\)/);
    assert.match(olla, /colorMosto\(temp, zona\)/);
    assert.doesNotMatch(olla, /\b6[0-9]\b\s*[<>]=?|[<>]=?\s*\b6[0-9]\b/);
  });

  it('respeta "reducir movimiento" y no arranca animaciones tras desmontarse', () => {
    assert.match(olla, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
    assert.match(olla, /if \(!vivo\) return;/);
    assert.match(olla, /vivo = false;/);
  });

  it('es decorativa: los lectores de pantalla no leen copos ni burbujas', () => {
    assert.match(olla, /importantForAccessibility="no-hide-descendants"/);
  });
});

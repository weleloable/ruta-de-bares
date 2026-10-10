import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Cableado del paso del lupulo (Maestro Cervecero, paso 3): bolsitas sobre la
 * barra, olla debajo, y la bolsita que cae a la olla al pulsar. Lo que decide
 * cual toca y cual se perdio esta probado en lupulo.test.ts (estadoBolsa); esto
 * es una red rapida y PARCIAL que lee el codigo. La prueba de que se ve bien y
 * de que la bolsa llega a la olla fue en Chrome (capturas en el PR).
 */
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const paso = leer('src/features/minijuegos/juegos/maestro/PasoLupulo.tsx');
const bolsas = leer('src/features/minijuegos/juegos/maestro/BolsitaLupulo.tsx');

describe('paso del lupulo: bolsitas y olla', () => {
  it('el boton va ANTES que la olla: la olla es alta y debajo de ella el boton se salia de la pantalla', () => {
    const boton = paso.indexOf('accessibilityLabel={empezado ?');
    const olla = paso.indexOf('<OllaMaceracion');
    assert.ok(boton > 0 && olla > 0);
    assert.ok(boton < olla, 'el boton esta despues de la olla');
  });

  it('las bolsitas cuelgan ENCIMA de la barra y la olla va debajo', () => {
    const filaBolsas = paso.indexOf('style={styles.filaBolsas}');
    const barra = paso.indexOf('<View style={styles.barraZona}>');
    const olla = paso.indexOf('<OllaMaceracion');
    assert.ok(filaBolsas > 0 && filaBolsas < barra && barra < olla);
  });

  it('cada bolsita cuelga del mismo % que su marca de la barra', () => {
    assert.match(paso, /huecoBolsa, \{ left: pct\(m\.en\) \}/);
  });

  it('un toque aceptado echa la bolsita; uno ignorado ("aun no es el momento") no', () => {
    const pulsar = paso.slice(paso.indexOf('const pulsar'), paso.indexOf('const fin'));
    const sinMarca = pulsar.indexOf('r.marca === null');
    const echar = pulsar.indexOf('setVolando(');
    assert.ok(sinMarca > 0 && echar > sinMarca, 'echar la bolsa antes de descartar el toque ignorado');
    assert.match(pulsar, /return;\s*\}\s*estadoRef\.current = r\.estado/);
  });

  it('la bolsa que cae acaba en la olla y entonces se quita la que vuela', () => {
    assert.match(paso, /setVolando\(\(v\) => v\.filter/);
    assert.match(paso, /setEnOlla\(\(v\) => \[\.\.\.v, id\]\)/);
  });

  it('la olla hierve y recibe las bolsas dentro de su escena, y la llamarada sigue a las bolsas', () => {
    assert.match(paso, /<OllaMaceracion\s+hervor\s+pulsos=\{enOlla\.length\}/);
    assert.match(paso, /<BolsaEnOlla key=\{id\} id=\{id\} \/>/);
  });

  it('la bolsa aterriza donde se dibuja la que ya esta dentro (misma posicion)', () => {
    assert.match(paso, /posicionEnOlla\(id\)/);
    assert.match(bolsas, /const \{ izquierda, arriba \} = posicionEnOlla\(id\)/);
  });

  it('respeta "reducir movimiento" y es decorativa para los lectores de pantalla', () => {
    assert.match(bolsas, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
    assert.match(bolsas, /if \(!vivo\) return;/);
    assert.match(paso, /pointerEvents="none"/);
  });
});

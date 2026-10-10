import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Cableado del paso 4 de Maestro Cervecero ("enfriar y sembrar"). La mecanica
 * esta probada en siembra.test.ts y la nota contra Postgres en
 * migration-0037.test.ts; esto es una red rapida y PARCIAL que lee el codigo
 * para que no se pierda un eslabon sin dar error (lo que si se ve de verdad lo
 * mide `npm run verificar:juego`).
 */
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const paso = leer('src/features/minijuegos/juegos/maestro/PasoSiembra.tsx');
const juego = leer('src/features/minijuegos/juegos/maestro/MaestroCervecero.tsx');

describe('paso 4: enfriar y sembrar', () => {
  it('el grifo es MANTENER pulsado: abre al apretar y cierra al soltar', () => {
    assert.match(paso, /onPressIn=\{abrirGrifo\}\s*onPressOut=\{cerrarGrifo\}/);
  });

  it('echar la levadura es un solo disparo, y antes de empezar a enfriar no se puede', () => {
    assert.match(paso, /disabled=\{!empezado \|\| fin\}\s*onPressIn=\{echar\}/);
    const echar = paso.slice(paso.indexOf('const echar'), paso.indexOf('const fin'));
    assert.match(echar, /terminado\(estadoRef\.current\)\) return;/);
  });

  it('la levadura se bloquea al empezar a enfriar, y cambiarla borra lo sembrado', () => {
    assert.match(paso, /disabled=\{empezado\}/);
    assert.match(juego, /onElegirLevadura=\{\(levadura\) => setReceta\(\(r\) => \(\{ \.\.\.r, levadura, siembra: null \}\)\)\}/);
  });

  it('la olla y el termometro usan la ventana de ESA levadura, sin fuego y con el serpentin al enfriar', () => {
    assert.match(paso, /zona=\{ventana \?\? VENTANAS\.ale\}\s*fuego=\{false\}\s*enfriando=\{grifo\}/);
    assert.match(paso, /<Termometro[\s\S]*?zona=\{ventana \?\? VENTANAS\.ale\}/);
  });

  it('cabe en pantalla como los otros pasos: escala la olla con el alto de la ventana', () => {
    assert.match(paso, /escalaOlla\(altoVentana, ALTO_RESTO_PASO, ALTO_OLLA\)/);
    assert.ok(paso.indexOf('<OllaMaceracion') < paso.indexOf('accessibilityLabel="Enfriar"'), 'los botones van debajo de la olla');
  });

  it('el juego lo monta en el paso de fermentacion y la siembra llega a la receta, al resultado y al servidor', () => {
    assert.match(juego, /<PasoSiembra/);
    assert.match(juego, /onTerminar=\{\(siembra\) => setReceta\(\(r\) => \(\{ \.\.\.r, siembra \}\)\)\}/);
    assert.match(juego, /siembra: pct\(completa\.siembra\)/);
    assert.match(juego, /siembra=\{completa\?\.siembra \?\? 0\}/);
    assert.match(leer('src/features/minijuegos/api.ts'), /rpc\('maestro_submit_beer_v2'[\s\S]*?p_siembra: r\.siembra/);
    assert.match(leer('src/features/minijuegos/juegos/maestro/ResultadoCerveza.tsx'), /etiqueta="Fermentación"/);
  });

  it('si se agota el tiempo tambien se avisa (se echa sola) y se cierra el grifo aunque no llegue el "soltar"', () => {
    const bucle = paso.slice(paso.indexOf('const bucle'), paso.indexOf('raf = requestAnimationFrame(bucle);'));
    assert.match(bucle, /avisar\(estadoRef\.current\)/);
    assert.match(bucle, /if \(terminado\(estadoRef\.current\) && grifoRef\.current\) \{\s*grifoRef\.current = false;\s*setGrifo\(false\);/);
  });

  it('repetir el paso (volviendo con Atras) anula la siembra anterior al empezar a enfriar', () => {
    const abrir = paso.slice(paso.indexOf('const abrirGrifo'), paso.indexOf('const cerrarGrifo'));
    assert.match(abrir, /onEmpezar\(\);/);
    assert.match(juego, /onEmpezar=\{\(\) => setReceta\(\(r\) => \(\{ \.\.\.r, siembra: null \}\)\)\}/);
  });
});

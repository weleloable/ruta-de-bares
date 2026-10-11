import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * La Cana Perfecta: el boton de mantener y el sensor de inclinacion. Red
 * rapida y PARCIAL que lee el codigo; lo que se ve y se toca de verdad lo
 * comprueba `npm run verificar:juego` en Chrome (dos dedos, dedo que se sale,
 * levantar el dedo, sensor emulado a 30 grados, pagina sin https).
 */
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const botonWeb = leer('src/features/minijuegos/BotonMantener.web.tsx');
const botonNativo = leer('src/features/minijuegos/BotonMantener.tsx');
const cana = leer('src/features/minijuegos/juegos/cana/CanaPerfecta.tsx');
const siembra = leer('src/features/minijuegos/juegos/maestro/PasoSiembra.tsx');
const sensorWeb = leer('src/features/minijuegos/juegos/cana/useInclinacion.web.ts');

describe('boton de mantener pulsado', () => {
  it('en web NO es un Pressable: escucha el dedo del navegador (con Pressable, dos dedos se pisaban)', () => {
    assert.doesNotMatch(botonWeb, /<Pressable/);
    assert.match(botonWeb, /addEventListener\('pointerdown', empezar\)/);
    assert.match(botonWeb, /setPointerCapture\(e\.pointerId\)/);
  });

  it('solo se suelta al levantar ESE dedo (o si se cancela), no al salirse del boton', () => {
    assert.match(botonWeb, /window\.addEventListener\('pointerup', terminar\)/);
    assert.match(botonWeb, /window\.addEventListener\('pointercancel', terminar\)/);
    assert.match(botonWeb, /e\.pointerId !== dedo\.current/);
  });

  it('sin gestos del navegador encima: ni desplazar, ni seleccionar, ni menu de pulsacion larga', () => {
    assert.match(botonWeb, /touchAction = 'none'/);
    assert.match(botonWeb, /userSelect = 'none'/);
    assert.match(botonWeb, /-webkit-touch-callout', 'none'/);
    assert.match(botonWeb, /addEventListener\('contextmenu', sinMenu\)/);
  });

  it('se suelta si se apaga, se desmonta o la pestana se oculta estando abierto (dedo, tecla o lector)', () => {
    assert.match(botonWeb, /if \(disabled && \(dedo\.current !== null \|\| sinDedo\.current !== null\)\)/);
    assert.match(botonWeb, /if \(document\.hidden\) soltarTodo\(\);/);
    assert.match(botonWeb, /Desmontarse abierto/);
  });

  it('teclado (Espacio / Enter con el foco) y lector de pantalla (un clic sin dedo ALTERNA): lo que daba Pressable', () => {
    assert.match(botonWeb, /addEventListener\('keydown', teclaAbajo\)/);
    assert.match(botonWeb, /addEventListener\('keyup', teclaArriba\)/);
    assert.match(botonWeb, /addEventListener\('click', clic\)/);
    assert.match(botonWeb, /if \(sinDedo\.current === 'alterno'\) return soltarTodo\(\);/);
  });

  it('el clic que manda el navegador al levantar el dedo NO se toma por un lector (reabriria el grifo)', () => {
    const terminar = botonWeb.slice(botonWeb.indexOf('const terminar'), botonWeb.indexOf('const empezar'));
    assert.match(terminar, /ultimoGesto\.current = Date\.now\(\);/);
    assert.match(botonWeb, /Date\.now\(\) - ultimoGesto\.current < 700/);
  });

  it('se suelta si la ventana pierde el foco o el navegador quita la captura (Alt-Tab con el raton apretado)', () => {
    assert.match(botonWeb, /window\.addEventListener\('blur', sinFoco\)/);
    assert.match(botonWeb, /addEventListener\('lostpointercapture', sinCaptura\)/);
  });

  it('en nativo es un Pressable que no se puede cancelar', () => {
    assert.match(botonNativo, /cancelable=\{false\}/);
  });

  it('lo usan servir la cana y el grifo de la siembra', () => {
    assert.match(cana, /<BotonMantener[\s\S]*?onApretar=\{abrir\}\s*onSoltar=\{cerrar\}/);
    assert.match(siembra, /<BotonMantener[\s\S]*?onApretar=\{abrirGrifo\}\s*onSoltar=\{cerrarGrifo\}/);
  });

  it('la franja del deslizador tiene alto fijo: pasar de sensor a deslizador no mueve el boton bajo el dedo', () => {
    assert.match(cana, /<View style=\{styles\.control\}>/);
    assert.match(cana, /control: \{ height: ALTO_CONTROL/);
  });
});

describe('sensor de inclinacion en web', () => {
  it('lee la GRAVEDAD de devicemotion, no expo-sensors (que en web da angulos de deviceorientation)', () => {
    assert.match(sensorWeb, /addEventListener\('devicemotion'/);
    assert.match(sensorWeb, /accelerationIncludingGravity/);
    assert.doesNotMatch(sensorWeb, /from 'expo-sensors'/);
  });

  it('mira https ANTES que nada (en http Chrome oculta el evento y pareceria "sin sensor")', () => {
    const empezar = sensorWeb.slice(sensorWeb.indexOf('const empezar'));
    assert.ok(empezar.indexOf("usarManual('https')") < empezar.indexOf("usarManual('sin-sensor')"));
  });

  it('pide el permiso de iOS sin ningun await antes (fuera del toque, Safari lo ignora)', () => {
    const empezar = sensorWeb.slice(sensorWeb.indexOf('const empezar'), sensorWeb.indexOf('const fijar'));
    assert.doesNotMatch(empezar, /await/);
    assert.match(empezar, /pedir\s*\.call\(window\.DeviceMotionEvent\)/);
  });

  it('un permiso que llega TARDE no manda: si ya se eligio el deslizador o se salio, se ignora', () => {
    assert.match(sensorWeb, /const mio = \+\+intento\.current;/);
    assert.match(sensorWeb, /if \(mio !== intento\.current\) return;/);
    // Elegir el deslizador y salir del juego invalidan el intento en curso.
    assert.match(sensorWeb, /\(porque: MotivoManual = 'elegido'\) => \{\s*intento\.current \+= 1;/);
    assert.match(sensorWeb, /\(\) => \(\) => \{\s*intento\.current \+= 1;\s*parar\(\);/);
  });

  it('doble toque en Empezar: un solo dialogo de permiso y nunca dos escuchas a la vez', () => {
    assert.match(sensorWeb, /if \(pidiendo\.current\) return;/);
    const escuchar = sensorWeb.slice(sensorWeb.indexOf('const escuchar'), sensorWeb.indexOf('let recibido'));
    assert.match(escuchar, /parar\(\);/);
  });

  it('el giro del sensor tiene tope a cada lado (el movil apaisado daria 90 grados), lo ponga quien lo ponga', () => {
    // Todo pasa por `apuntar`, que recorta con limitarGiro: web, nativo y deslizador.
    assert.match(leer('src/features/minijuegos/juegos/cana/useGiro.ts'), /objetivo\.current = limitarGiro\(grados\);/);
    assert.match(sensorWeb, /apuntar\(medido\)/);
    assert.match(leer('src/features/minijuegos/juegos/cana/useInclinacion.ts'), /apuntar\(medido\)/);
  });

  it('el vaso gira hacia el lado en que se inclina el movil, con el signo, y el modelo solo mira cuanto', () => {
    for (const f of ['useInclinacion.ts', 'useInclinacion.web.ts']) {
      const hook = leer(`src/features/minijuegos/juegos/cana/${f}`);
      assert.match(hook, /inclinacionConSigno\(/, f);
      assert.doesNotMatch(hook, /anguloDesdeAcelerometro\(/, f);
    }
    assert.match(cana, /rotate: `\$\{inclinado\}deg`/);
    assert.match(cana, /Math\.abs\(giro\.current\)/);
    assert.match(cana, /<SelectorAngulo valor=\{Math\.abs\(inclinado\)\}/);
  });

  it('el giro se filtra en el TIEMPO, un paso por fotograma, y no en cada lectura del sensor (daba trompicones)', () => {
    assert.match(cana, /avanzarGiro\(dt\);/);
    assert.match(leer('src/features/minijuegos/juegos/cana/useGiro.ts'), /suavizarEnTiempo\(giro\.current, objetivo\.current, dt, TAU_GIRO\)/);
    for (const f of ['useInclinacion.ts', 'useInclinacion.web.ts']) {
      const hook = leer(`src/features/minijuegos/juegos/cana/${f}`);
      assert.doesNotMatch(hook, /suavizar\(/, f);
      assert.match(hook, /apuntar\(medido\)/, f);
    }
  });

  it('la pantalla dice por que se esta con el deslizador', () => {
    assert.match(cana, /textoMotivo\(motivo\)/);
    // `onPress={usarManual}` pasaria el evento del toque como si fuera el motivo.
    assert.doesNotMatch(cana, /onPress=\{usarManual\}\s*\/>/);
    assert.match(cana, /onPress=\{\(\) => usarManual\(\)\}/);
  });
});

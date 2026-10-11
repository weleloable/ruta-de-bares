import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Cableado de "Ocupado" (juego de Godot en su propio repo, weleloable/ocupado).
 * La logica (origen, formato del mensaje, puntos) esta probada en mensaje.test.ts;
 * esto es una red rapida y PARCIAL que lee el codigo. El flujo de verdad (abrir,
 * capa a pantalla completa, aviso del juego, record) se probo en Chrome contra la
 * exportacion web real del juego (ver el PR).
 */
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const juegos = leer('src/features/minijuegos/juegos.ts');
const web = leer('src/features/minijuegos/juegos/ocupado/Ocupado.web.tsx');
const nativo = leer('src/features/minijuegos/juegos/ocupado/Ocupado.tsx');

describe('Ocupado en el menu de minijuegos', () => {
  it('esta en la lista, con su detalle y SIN ranking ni envio a la ruta (pediria una migracion)', () => {
    const ficha = juegos.slice(juegos.indexOf("id: 'ocupado'"));
    assert.ok(juegos.includes("id: 'ocupado'"));
    assert.match(ficha, /Componente: Ocupado,/);
    assert.match(ficha, /Detalle: DetalleOcupado,/);
    assert.doesNotMatch(ficha.slice(0, ficha.indexOf('},')), /ranking|enviar/);
  });

  it('se importa sin extension: Metro elige Ocupado.web.tsx en web y Ocupado.tsx en nativo', () => {
    assert.match(juegos, /from '\.\/juegos\/ocupado\/Ocupado';/);
  });
});

describe('Ocupado en web', () => {
  it('solo acepta el aviso del ORIGEN del juego (si no, cualquiera se regala un record)', () => {
    assert.match(web, /const ORIGEN = origenDe\(URL_JUEGO\);/);
    assert.match(web, /leerMensajeOcupado\(e\.origin, ORIGEN, e\.data\)/);
  });

  it('...y que lo mande SU iframe: publicados, la app y el juego comparten origen (weleloable.github.io)', () => {
    assert.match(web, /e\.source !== marco\.current\.contentWindow\) return;/);
    assert.match(web, /<iframe\s+ref=\{marco\}/);
  });

  it('el iframe solo se monta al pulsar Jugar (abrir la ficha no descarga los ~10 MB)', () => {
    assert.match(web, /\{jugando \? \(\s*<iframe/);
  });

  it('se juega en una capa FIJA sobre toda la ventana, en un portal a <body> (dentro de la pantalla le quedaban ~120 px)', () => {
    assert.match(web, /createPortal\(/);
    assert.match(web, /document\.body,/);
    assert.match(web, /position: 'fixed',\s*inset: 0,/);
  });

  it('la pantalla completa se pide DESDE el toque en Jugar (fuera de un gesto el navegador la niega)', () => {
    const jugar = web.slice(web.indexOf('const jugar = () =>'), web.indexOf('const salir = () =>'));
    assert.match(jugar, /requestFullscreen\(\)/);
    assert.doesNotMatch(jugar, /await|setTimeout/);
  });

  it('el resultado se entrega UNA vez: con el boton o, si nadie lo pulsa, solo al rato', () => {
    assert.match(web, /if \(terminado\.current\) return;/);
    assert.match(web, /setTimeout\(\(\) => entregar\(fin\), GUARDAR_SOLO_MS\)/);
  });

  it('se puede salir del juego, y al salir se quita la pantalla completa', () => {
    assert.match(web, /aria-label="Salir del juego"/);
    const salir = web.slice(web.indexOf('const salir = () =>'), web.indexOf('return (', web.indexOf('const salir = () =>')));
    assert.match(salir, /salirDePantallaCompleta\(\);\s*setJugando\(false\);/);
  });

  it('ganar y salir con la X entrega el resultado (antes su temporizador cortaba la partida siguiente)', () => {
    assert.match(web, /const salir = \(\) => \{\s*if \(fin\) return entregar\(fin\);/);
  });

  it('cada partida empieza sin el aviso de la anterior', () => {
    const jugar = web.slice(web.indexOf('const jugar = () =>'), web.indexOf('const salir = () =>'));
    assert.match(jugar, /setFin\(null\);/);
  });

  it('desmontar con la partida ganada y sin entregar no pierde el record', () => {
    assert.match(web, /if \(finPendiente\.current\) entregar\(finPendiente\.current\);/);
  });
});

describe('Ocupado en nativo', () => {
  it('se abre en el navegador del sistema, sin WebView (sin modulo nativo nuevo ni build de EAS)', () => {
    assert.match(nativo, /WebBrowser\.openBrowserAsync\(URL_JUEGO\)/);
    assert.doesNotMatch(leer('package.json'), /react-native-webview/);
  });
});

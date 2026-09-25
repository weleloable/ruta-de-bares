import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Botones de Instagram y Telegram al pie de la pantalla Sellos: uno a cada
 * lado (justifyContent: space-between), abren con abrirEnlaceExterno (helper
 * local a la pantalla, ver su comentario) usando las URL exactas de
 * src/lib/enlacesExternos.ts (que las fija con su propio test).
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const codigo = readFileSync(join(raiz, 'app/(tabs)/index.tsx'), 'utf8');

describe('enlaces al pie de Sellos', () => {
  it('las URL vienen del modulo centralizado, no escritas dos veces', () => {
    assert.match(codigo, /import \{ INSTAGRAM_URL, TELEGRAM_URL \} from '\.\.\/\.\.\/src\/lib\/enlacesExternos'/);
  });

  it('abrirEnlaceExterno usa Linking.openURL con un .catch (sin Alert si falla)', () => {
    assert.match(codigo, /function abrirEnlaceExterno\(url: string\): void \{/);
    assert.match(codigo, /Linking\.openURL\(url\)\.catch\(\(\) => undefined\)/);
  });

  it('un boton de Instagram (@rutadebaresoficial) y uno de Telegram (Social), cada uno con su url', () => {
    assert.match(codigo, /title="@rutadebaresoficial"[\s\S]{0,220}?abrirEnlaceExterno\(INSTAGRAM_URL\)/);
    assert.match(codigo, /title="Social"[\s\S]{0,220}?abrirEnlaceExterno\(TELEGRAM_URL\)/);
  });

  it('el texto va en marron (colors.inkSoft), no negro ni el color por defecto', () => {
    const m = /textoEnlace:\s*\{([^}]*)\}/.exec(codigo);
    assert.ok(m, 'no se encuentra el estilo textoEnlace');
    assert.match(m[1], /color:\s*colors\.inkSoft/);
    assert.match(codigo, /textStyle=\{styles\.textoEnlace\}[\s\S]{0,80}?onPress=\{\(\) => abrirEnlaceExterno\(INSTAGRAM_URL\)\}/);
    assert.match(codigo, /textStyle=\{styles\.textoEnlace\}[\s\S]{0,80}?onPress=\{\(\) => abrirEnlaceExterno\(TELEGRAM_URL\)\}/);
  });

  it('el icono va del mismo marron que el texto (iconColor), no negro por defecto', () => {
    assert.match(codigo, /iconColor=\{colors\.inkSoft\}[\s\S]{0,80}?onPress=\{\(\) => abrirEnlaceExterno\(INSTAGRAM_URL\)\}/);
    assert.match(codigo, /iconColor=\{colors\.inkSoft\}[\s\S]{0,80}?onPress=\{\(\) => abrirEnlaceExterno\(TELEGRAM_URL\)\}/);
  });

  it('la fila los separa a los lados (uno a la izquierda, otro a la derecha) con aire extra arriba', () => {
    const m = /enlacesFila:\s*\{([^}]*)\}/.exec(codigo);
    assert.ok(m, 'no se encuentra el estilo enlacesFila');
    assert.match(m[1], /flexDirection:\s*'row'/);
    assert.match(m[1], /justifyContent:\s*'space-between'/);
    assert.match(m[1], /marginTop:/, 'sin aire extra arriba, quedaria pegado a la rejilla');
  });

  it('estan al final de la pantalla, despues de la rejilla', () => {
    const indiceRejilla = codigo.indexOf('styles.rejilla}');
    const indiceFila = codigo.indexOf('styles.enlacesFila');
    assert.ok(indiceRejilla > 0 && indiceFila > indiceRejilla);
  });
});

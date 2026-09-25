import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Enlaces de Instagram (@rutadebaresoficial) y Telegram (Social): antes al pie de
 * Sellos, ahora apilados en la cabecera de Ruta (EnlacesRuta.tsx). Abren con
 * abrirEnlaceExterno (src/lib/abrirEnlace.ts) usando las URL exactas de
 * src/lib/enlacesExternos.ts (que las fija con su propio test).
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const enlaces = leer('src/features/routes/EnlacesRuta.tsx');
const sellos = leer('app/(tabs)/index.tsx');

describe('EnlacesRuta', () => {
  it('las URL vienen del modulo centralizado, no escritas dos veces', () => {
    assert.match(enlaces, /import \{ INSTAGRAM_URL, TELEGRAM_URL \} from '\.\.\/\.\.\/lib\/enlacesExternos'/);
  });

  it('un boton de Instagram (@rutadebaresoficial) y uno de Telegram (Social), cada uno con su url', () => {
    assert.match(enlaces, /titulo="@rutadebaresoficial" icono="logo-instagram" url=\{INSTAGRAM_URL\}/);
    assert.match(enlaces, /titulo="Social" icono="paper-plane-outline" url=\{TELEGRAM_URL\}/);
  });

  it('van apilados: el de Instagram arriba y Social debajo', () => {
    assert.ok(enlaces.indexOf('titulo="@rutadebaresoficial"') < enlaces.indexOf('titulo="Social"'));
    const m = /columna:\s*\{([^}]*)\}/.exec(enlaces);
    assert.ok(m, 'no encuentro el estilo columna');
    assert.doesNotMatch(m[1], /flexDirection:\s*'row'/, 'en una fila no cabrian junto al nombre de la ruta');
    assert.match(m[1], /flexShrink:\s*0/, 'si el nombre es largo, se recorta el nombre y no los botones');
  });

  it('el texto y el icono van en marron (colors.inkSoft)', () => {
    assert.match(enlaces, /<Ionicons name=\{icono\} size=\{16\} color=\{colors\.inkSoft\} \/>/);
    const m = /texto:\s*\{([^}]*)\}/.exec(enlaces);
    assert.ok(m);
    assert.match(m[1], /color:\s*colors\.inkSoft/);
  });

  it('cada boton es tocable: rectangulo de al menos 36 px y accesible con su texto', () => {
    const m = /boton:\s*\{([^}]*)\}/.exec(enlaces);
    assert.ok(m);
    assert.ok(Number(/height:\s*(\d+)/.exec(m[1])?.[1]) >= 36);
    assert.match(m[1], /borderRadius:\s*radius\.md/);
    assert.match(enlaces, /accessibilityRole="button"/);
    assert.match(enlaces, /accessibilityLabel=\{titulo\}/);
  });

  it('abren con abrirEnlaceExterno', () => {
    assert.match(enlaces, /onPress=\{\(\) => abrirEnlaceExterno\(url\)\}/);
  });
});

describe('abrirEnlaceExterno', () => {
  const codigo = leer('src/lib/abrirEnlace.ts');
  it('usa Linking.openURL con un .catch (sin Alert si falla)', () => {
    assert.match(codigo, /export function abrirEnlaceExterno\(url: string\): void \{/);
    assert.match(codigo, /Linking\.openURL\(url\)\.catch\(\(\) => undefined\)/);
  });
});

describe('Sellos: ya no lleva los enlaces', () => {
  it('ni los botones, ni las URL, ni Linking, ni sus estilos', () => {
    assert.doesNotMatch(sellos, /@rutadebaresoficial/);
    assert.doesNotMatch(sellos, /title="Social"/);
    assert.doesNotMatch(sellos, /INSTAGRAM_URL|TELEGRAM_URL|abrirEnlaceExterno|Linking/);
    assert.doesNotMatch(sellos, /enlacesFila|textoEnlace/);
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * La etiqueta de Google Search Console tiene que seguir en la web publicada.
 *
 * Google solo da la marca del login con Google por buena si el dominio esta
 * verificado en Search Console, y esa verificacion se mantiene COMPROBANDO la
 * etiqueta de forma periodica: si alguien la quita, la propiedad se desverifica
 * y, tarde o temprano, el login vuelve a ensenar el dominio de Supabase. No da
 * ningun error en la app: por eso hay test.
 */
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const html = leer('public/index.html');

describe('Google Search Console', () => {
  it('public/index.html lleva la etiqueta de verificacion, una sola vez y dentro del head', () => {
    const etiquetas = html.match(/<meta name="google-site-verification" content="[A-Za-z0-9_-]{30,}" \/>/g) ?? [];
    assert.equal(etiquetas.length, 1);
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    assert.ok(head.includes('google-site-verification'), 'la etiqueta tiene que estar en <head>');
  });

  it('esta fuera de los comentarios HTML (dentro de uno, Google no la ve)', () => {
    const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
    assert.match(sinComentarios, /<meta name="google-site-verification"/);
  });

  it('la web se publica desde esta plantilla (si el workflow cambia de origen, la etiqueta no llegaria)', () => {
    assert.match(leer('.github/workflows/deploy-web.yml'), /expo export --platform web --output-dir dist/);
    assert.match(leer('.github/workflows/deploy-web.yml'), /cp dist\/index\.html dist\/404\.html/);
  });
});

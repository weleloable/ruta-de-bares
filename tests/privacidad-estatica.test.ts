import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { NOMBRE_APP, politica } from '../src/features/legal/politica.ts';
import {
  CORREO_PRIVACIDAD,
  DIAS_CONSERVACION,
  PENDIENTE,
  RESPONSABLE,
  VERSION_POLITICA,
} from '../src/features/legal/responsable.ts';

/**
 * La politica de privacidad como pagina HTML estatica de la web.
 *
 * Por que: Google, para verificar el "Continuar con Google", exige la politica
 * en el CUERPO de una pagina HTML que responda 200. Comprobado contra la web
 * publicada: /ruta-de-bares/privacidad respondia 404 (la servia 404.html, el
 * fallback de la app de una sola pagina) y su HTML no traia ni una linea de la
 * politica. Lo que se vigila:
 *  - que la pagina lleve TODO el texto de la app, sin JavaScript;
 *  - que el workflow la genere en dist/privacidad/ (-> 200 en Pages) y con la
 *    misma subruta que la app.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const { paginaPrivacidad } = (await import(pathToFileURL(join(raiz, 'scripts/generar-privacidad.mjs')).href)) as {
  paginaPrivacidad: (baseUrl?: string) => string;
};

const html = paginaPrivacidad('/ruta-de-bares');
/** El texto que se lee, sin etiquetas y con las entidades deshechas. */
const leible = html
  .replace(/<style>[\s\S]*?<\/style>/, '')
  // Los enlaces van dentro de la frase: quitarlos no puede partirla.
  .replace(/<\/?a\b[^>]*>/g, '')
  .replace(/<[^>]+>/g, '\n')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&amp;', '&');

const texto = politica({ responsable: RESPONSABLE, correo: CORREO_PRIVACIDAD, diasConservacion: DIAS_CONSERVACION });

describe('la pagina estatica lleva la politica entera en el HTML', () => {
  it('cada titulo, subtitulo y punto de la app esta en la pagina', () => {
    const faltan: string[] = [];
    for (const s of texto.secciones) {
      for (const trozo of [s.titulo, ...s.bloques.flatMap((b) => [b.subtitulo ?? '', ...b.puntos])]) {
        if (trozo && !leible.includes(trozo)) faltan.push(trozo.slice(0, 60));
      }
    }
    for (const p of [texto.presentacion, ...texto.verLoQueGuardamos.parrafos]) {
      if (!leible.includes(p)) faltan.push(p.slice(0, 60));
    }
    assert.deepEqual(faltan, []);
  });

  it('nombra la app, en el titulo y en la cabecera, y lleva la version', () => {
    assert.match(html, new RegExp(`<title>Política de privacidad · ${NOMBRE_APP}</title>`));
    assert.match(html, new RegExp(`<h1>Política de privacidad de ${NOMBRE_APP}</h1>`));
    assert.ok(leible.includes(`Versión ${VERSION_POLITICA}`));
  });

  it('es HTML de verdad, sin JavaScript que tenga que pintarla', () => {
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<html lang="es">/);
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<iframe/i);
  });

  it('las URL de Google se pueden pulsar', () => {
    assert.match(html, /<a href="https:\/\/developers\.google\.com\/terms\/api-services-user-data-policy"/);
    assert.match(html, /<a href="https:\/\/myaccount\.google\.com\/connections"/);
  });

  it('el aviso de borrador sale si y solo si sigue pendiente', () => {
    assert.equal(/Borrador\./.test(leible), PENDIENTE);
  });

  it('dice donde se descargan los datos, que solo se puede dentro de la app', () => {
    assert.ok(leible.includes('Mi perfil > Política de privacidad y datos > Ver mis datos'));
  });

  it('enlaza de vuelta a la app, con su subruta', () => {
    assert.match(html, /<a href="\/ruta-de-bares\/">Abrir Ruta de Bares<\/a>/);
  });

  it('escapa lo que podria romper el HTML', () => {
    assert.doesNotMatch(html, /Mi perfil > /, 'un ">" suelto en el texto tiene que salir como &gt;');
  });
});

describe('el workflow publica la pagina donde Pages responde 200', () => {
  // En Windows git saca el fichero con CRLF y las regex de abajo cuentan con \n.
  const workflow = readFileSync(join(raiz, '.github/workflows/deploy-web.yml'), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');

  it('la genera en dist con la misma subruta que la app', () => {
    const base = /WEB_BASE_URL:\s*(\S+)/.exec(workflow)?.[1];
    assert.ok(base);
    assert.match(workflow, new RegExp(`node scripts/generar-privacidad\\.mjs dist ${base}\\n`));
  });

  it('despues de exportar la app (que vacia dist) y antes de subir el artefacto', () => {
    const iExport = workflow.indexOf('npx expo export');
    const iPolitica = workflow.indexOf('generar-privacidad.mjs');
    const iSubida = workflow.indexOf('upload-pages-artifact');
    assert.ok(iExport > -1 && iExport < iPolitica && iPolitica < iSubida);
  });
});

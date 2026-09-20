import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Boton "Instalar App" en Mi perfil, encima de "Cerrar sesion".
 *
 * Debe aparecer SOLO cuando useInstalarApp() dice que la PWA es instalable y
 * todavia no esta instalada (pwaInstalar.web.ts, gateado por `disponible`):
 * en nativo (pwaInstalar.ts) esa senal siempre es false, asi que el boton no
 * se pinta nunca ahi tampoco. Aqui no se puede probar el DOM real (sin
 * jsdom), asi que se vigila el cableado por codigo, igual que otros tests de
 * esta pantalla (barra-superior.test.ts).
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8');

const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Perfil: boton "Instalar App"', () => {
  const perfil = sinComentarios(leer('app/(tabs)/perfil.tsx')).replace(/["`]/g, "'");

  it('usa useInstalarApp() de src/lib/pwaInstalar', () => {
    assert.match(perfil, /useInstalarApp\(\)/);
    assert.match(perfil, /from '\.\.\/\.\.\/src\/lib\/pwaInstalar'/);
  });

  it('el boton esta gateado por "disponible" y no se pinta a pelo', () => {
    const bloque = /\{instalarDisponible \? \(([\s\S]*?)\) : null\}/.exec(perfil);
    assert.ok(bloque, 'no hay bloque {instalarDisponible ? (...) : null}');
    assert.match(bloque[1], /title='Instalar App'/);
    assert.match(bloque[1], /onPress=\{instalar\}/);
  });

  it('la variable disponible viene del propio hook, no de un estado propio inventado', () => {
    assert.match(
      perfil,
      /const \{ disponible: instalarDisponible, instalando, instalar \} = useInstalarApp\(\);/,
    );
  });

  it('el boton de instalar va ANTES que "Cerrar sesion" en el JSX', () => {
    const iInstalar = perfil.indexOf("title='Instalar App'");
    const iCerrar = perfil.indexOf("title='Cerrar sesion'");
    assert.ok(iInstalar > -1 && iCerrar > -1);
    assert.ok(iInstalar < iCerrar, 'Instalar App deberia ir encima de Cerrar sesion');
  });
});

describe('useInstalarApp: version nativa siempre inactiva', () => {
  it('pwaInstalar.ts (fallback fuera de web) nunca ofrece el boton', () => {
    const codigo = sinComentarios(leer('src/lib/pwaInstalar.ts'));
    assert.match(codigo, /disponible:\s*false/);
  });
});

describe('useInstalarApp: version web solo escucha si aun no esta instalada', () => {
  const codigo = sinComentarios(leer('src/lib/pwaInstalar.web.ts'));

  it('usa estaInstalada() (pwaInstalada.ts) para no escuchar el evento si ya esta instalada', () => {
    assert.match(codigo, /import\s*\{\s*estaInstalada\s*\}\s*from\s*'\.\/pwaInstalada'/);
    assert.match(codigo, /if\s*\(typeof window === 'undefined' \|\| yaInstalada\(\)\)\s*return;/);
  });

  it('se apaga con appinstalled, para no ofrecer instalar dos veces', () => {
    assert.match(codigo, /addEventListener\('appinstalled'/);
    assert.match(codigo, /setDisponible\(false\)/);
  });
});

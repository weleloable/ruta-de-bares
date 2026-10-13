import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * El aviso "Estas en el navegador de otra app" (WhatsApp, Instagram...).
 *
 * Que se DETECTA bien el navegador lo prueba src/lib/guiaInstalar.test.ts con
 * user-agents reales. Aqui, sin DOM, se vigila el cableado: que solo sale con
 * esa guia, que se puede cerrar, y que esta en las pantallas por las que entra
 * quien llega desde un enlace de invitacion.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('AvisoNavegadorIntegrado', () => {
  const codigo = sinComentarios(leer('src/features/profile/AvisoNavegadorIntegrado.tsx'));

  it('solo pinta algo con la guia "abrir-en-navegador"', () => {
    assert.match(codigo, /if \(guia !== 'abrir-en-navegador' \|\| cerrado\) return null;/);
    assert.match(codigo, /const \{ guia \} = useInstalarApp\(\);/);
  });

  it('se puede cerrar y se acuerda, sin romperse si no hay almacenamiento', () => {
    assert.match(codigo, /accessibilityLabel="Cerrar aviso"/);
    assert.match(codigo, /window\.localStorage\.setItem\(CLAVE_CERRADO, '1'\)/);
    // leer y escribir, los dos dentro de try/catch (ventana privada, bloqueado)
    assert.equal((codigo.match(/\btry \{/g) ?? []).length, 2);
    assert.equal((codigo.match(/\bcatch\b/g) ?? []).length, 2);
  });

  it('explica como abrirla con las mismas instrucciones del boton de instalar', () => {
    assert.match(codigo, /<GuiaInstalarModal guia=\{verPasos \? guia : null\}/);
  });

  it('no promete un boton que abra el navegador (iOS no deja)', () => {
    assert.doesNotMatch(codigo, /Linking\.openURL|intent:\/\//);
  });
});

describe('donde sale', () => {
  const pantallas: [string, string][] = [
    ['la invitacion (sin sesion)', 'app/invitacion.tsx'],
    ['entrar', 'app/(auth)/login.tsx'],
    ['crear cuenta', 'app/(auth)/registro.tsx'],
    ['Sellos', 'app/(tabs)/index.tsx'],
  ];
  for (const [nombre, ruta] of pantallas) {
    it(nombre, () => {
      const codigo = sinComentarios(leer(ruta));
      assert.match(codigo, /import \{ AvisoNavegadorIntegrado \} from '[./]+\/src\/features\/profile\/AvisoNavegadorIntegrado'/);
      assert.match(codigo, /<AvisoNavegadorIntegrado \/>/);
    });
  }

  it('en la invitacion sale en la rama SIN sesion, que es por donde entra quien llega del enlace', () => {
    const codigo = sinComentarios(leer('app/invitacion.tsx'));
    assert.match(codigo, /if \(!loading && !session\) \{\s*return \(\s*<Screen scroll>\s*<AvisoNavegadorIntegrado \/>/);
  });
});

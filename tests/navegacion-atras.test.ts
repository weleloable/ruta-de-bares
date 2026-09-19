import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Entrar directamente a una pantalla apilada tiene que dejar flecha de volver.
 *
 * Al recargar (F5) o abrir un enlace a /cana/persona/<id>, la app arranca en
 * esa pantalla con la pila vacia: sin `unstable_settings.anchor` no hay flecha
 * y la persona se queda encerrada, con la pestana Cana fuera de alcance.
 * Comprobado en Chrome con el arreglo y sin el: sin ancla, no hay flecha.
 *
 * Es un guardia de cableado (como encuadre-cableado.test.ts): lee el codigo,
 * porque el comportamiento de verdad solo se ve en un navegador.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const layout = readFileSync(join(raiz, 'app/_layout.tsx'), 'utf8');

describe('volver desde una pantalla abierta directamente', () => {
  it('el layout raiz declara el ancla de las pestanas', () => {
    const sinComentarios = layout.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.match(sinComentarios, /export const unstable_settings\s*=\s*\{[\s\S]*?anchor:\s*'\(tabs\)'[\s\S]*?\}/);
  });

  it('las pantallas de la cana cuelgan de ese layout, no de otro', () => {
    // Si alguien las mueve a su propio _layout, el ancla de aqui deja de
    // cubrirlas y hay que repetirla alli.
    for (const pantalla of ['cana/persona/[userId]', 'cana/chat/[connectionId]', 'cana/bloqueados', 'cana/mis-datos']) {
      assert.ok(layout.includes(`name="${pantalla}"`), `${pantalla} ya no esta en app/_layout.tsx`);
    }
  });
});

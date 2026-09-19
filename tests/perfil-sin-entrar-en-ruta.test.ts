import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Mi perfil no ofrece "Entrar en una ruta".
 *
 * La gente entra por el enlace de invitacion, no desde un boton del perfil, asi
 * que ese boton se quito. Es un guardia de lectura de codigo (como
 * navegacion-atras.test.ts): el fallo que evita es que alguien lo devuelva, por
 * ejemplo al resolver un conflicto de merge, sin que ninguna otra prueba se
 * entere.
 *
 * La pantalla /invitacion NO se toca: es el destino del enlace y tiene que
 * seguir registrada.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const sinComentarios = (ruta: string) =>
  readFileSync(join(raiz, ruta), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('Mi perfil', () => {
  const perfil = sinComentarios('app/(tabs)/perfil.tsx');

  it('no navega a /invitacion (canje a mano)', () => {
    assert.doesNotMatch(perfil, /['"`]\/invitacion['"`]/);
  });

  it('no tiene el boton ni la tarjeta "Entrar en una ruta" / "Rutas"', () => {
    assert.doesNotMatch(perfil, /Entrar en una ruta/);
    assert.doesNotMatch(perfil, />\s*Rutas\s*</);
  });

  it('el panel de invitaciones de admin sigue: es otra pantalla, /invitaciones', () => {
    assert.match(perfil, /['"`]\/invitaciones['"`]/);
  });
});

describe('destino del enlace de invitacion', () => {
  it('la pantalla /invitacion sigue registrada: es a donde llega el enlace', () => {
    assert.ok(sinComentarios('app/_layout.tsx').includes('name="invitacion"'));
  });
});

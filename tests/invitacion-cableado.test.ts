import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * El camino de quien abre el enlace de una ruta SIN cuenta (Instagram, p. ej.):
 * crea la cuenta, confirma el correo y tiene que acabar dentro de la ruta, no
 * en la pantalla de Sellos. Sin renderizador ni Supabase aqui, se vigila el
 * cableado por codigo (como login-google.test.ts); la logica esta probada en
 * auth/portero.test.ts y auth/confirmacionUrl.test.ts.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('invitacion sin cuenta', () => {
  it('el portero de la app decide con destinoDelPortero y lee el pendiente (sin consumirlo)', () => {
    const c = sinComentarios(leer('app/_layout.tsx'));
    assert.match(c, /destinoDelPortero\(/);
    assert.match(c, /pendiente:\s*leerInvitacionPendiente\(\)/);
    assert.doesNotMatch(c, /tomarInvitacionPendiente/, 'consumirlo aqui perderia la invitacion en la segunda pasada del efecto');
  });

  it('el alta pone el token de la invitacion en el enlace del correo', () => {
    const c = sinComentarios(leer('src/features/auth/AuthProvider.tsx'));
    assert.match(c, /emailRedirectTo:\s*urlConfirmacion\(leerInvitacionPendiente\(\)\)/);
  });

  it('urlConfirmacion existe en las dos plataformas con la misma firma', () => {
    for (const f of ['urlConfirmacion.ts', 'urlConfirmacion.web.ts']) {
      assert.match(leer(`src/features/auth/${f}`), /export function urlConfirmacion\(\w+: string \| null\): string \| undefined/);
    }
  });

  it('la web NO importa nada nativo y construye la URL con la funcion probada', () => {
    const c = leer('src/features/auth/urlConfirmacion.web.ts');
    assert.match(c, /urlConfirmacionWeb\(window\.location\.origin, alcance, token\)/);
  });

  it('registro y login avisan de que la invitacion sigue en pie', () => {
    for (const f of ['app/(auth)/registro.tsx', 'app/(auth)/login.tsx']) {
      assert.match(leer(f), /<AvisoInvitacionPendiente \/>/, f);
    }
  });

  it('/invitacion sigue siendo publica y borra el pendiente solo al verse con sesion', () => {
    const c = sinComentarios(leer('app/invitacion.tsx'));
    assert.match(c, /if \(!loading && !session && tokenValido\) guardarInvitacionPendiente/);
    assert.match(c, /if \(!loading && session\) olvidarInvitacionPendiente\(\)/);
  });
});

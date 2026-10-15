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

describe('meter a alguien en una ruta desde Usuarios (0069)', () => {
  it('la ficha llama a admin_meter_en_ruta y la lista tiene el filtro Sin ruta', () => {
    assert.match(sinComentarios(leer('src/features/admin/usuarios.ts')), /rpc\('admin_meter_en_ruta'/);
    const ficha = sinComentarios(leer('app/admin/usuario/[userId].tsx'));
    assert.match(ficha, /meterEnRuta\(userId, ruta\.id\)/);
    assert.match(ficha, /<DialogoConfirmar[\s\S]*visible=\{confirmarMeter\}/, 'meter pide confirmacion');
    assert.match(sinComentarios(leer('app/admin/usuarios.tsx')), /u\.rutas === 0/);
  });
});

describe('La Caña Perfecta con decimales (0069)', () => {
  it('la nota se envia, se guarda y se ensena con la misma funcion', () => {
    assert.match(sinComentarios(leer('src/features/minijuegos/api.ts')), /p_score: redondearNota\(game, score\)/);
    for (const f of ['src/features/minijuegos/MenuMinijuegos.tsx', 'src/features/minijuegos/Ranking.tsx', 'src/features/admin/ActividadRuta.tsx']) {
      assert.match(sinComentarios(leer(f)), /formatearNota\(/, f);
    }
  });
});

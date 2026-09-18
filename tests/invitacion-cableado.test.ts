/**
 * Cableado del flujo "abrir el enlace de invitacion".
 *
 * Los tests de src/features/invites prueban cada pieza; esto vigila que las
 * pantallas las sigan usando como hace falta. Es una red rapida y PARCIAL (lee
 * codigo, no ejecuta pantallas), del mismo tipo que encuadre-cableado.test.ts.
 * Cada aserto nombra el fallo concreto que evita.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));

/** Codigo sin comentarios, para que una mencion en un comentario no haga pasar el test. */
function codigo(ruta: string): string {
  return readFileSync(`${raiz}${ruta}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');
}

test('AuthGate solo LEE el token pendiente: su efecto se repite y borrarlo perderia la invitacion', () => {
  const layout = codigo('app/_layout.tsx');
  assert.match(layout, /leerInvitacionPendiente\(\)/);
  assert.doesNotMatch(layout, /tomarInvitacionPendiente/);
});

test('AuthGate lleva a /invitacion con el token como parametro, no pegado en una cadena', () => {
  const layout = codigo('app/_layout.tsx');
  assert.match(layout, /pathname: '\/invitacion', params: \{ token: pendiente \}/);
  assert.doesNotMatch(layout, /`\/invitacion\?token=\$\{/);
});

test('/invitacion es publica: AuthGate no la manda a /login sin sesion', () => {
  const layout = codigo('app/_layout.tsx');
  assert.match(layout, /segments\[0\] === 'invitacion'/);
  assert.match(layout, /!session && !enAuth && !enInvitacion/);
});

test('/invitacion guarda el token sin sesion y lo borra con sesion', () => {
  const pantalla = codigo('app/invitacion.tsx');
  assert.match(pantalla, /!loading && !session && tokenValido\) guardarInvitacionPendiente\(/);
  assert.match(pantalla, /!loading && session\) olvidarInvitacionPendiente\(\)/);
});

test('/invitacion lee el parametro con parseInviteParam: ?token=a&token=b llega como array', () => {
  const pantalla = codigo('app/invitacion.tsx');
  assert.match(pantalla, /parseInviteParam\(params\.token\)/);
  assert.doesNotMatch(pantalla, /parseInviteToken\(params\.token/);
});

test('Compartir no copia al portapapeles cuando el usuario cancela la hoja', () => {
  const pantalla = codigo('app/invitaciones.tsx');
  assert.match(pantalla, /if \(!debeCopiarTrasFalloDeCompartir\(e\)\) return;/);
});

test('Compartir y copiar usan el enlace https (buildInviteUrl), no el deep link', () => {
  const pantalla = codigo('app/invitaciones.tsx');
  assert.match(pantalla, /buildInviteUrl\(/);
  assert.match(pantalla, /buildShareMessage\(/);
  assert.doesNotMatch(pantalla, /buildAppLink/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Red rapida que lee el codigo: el minimo de la contrasena del alta es 6 (el de
// Supabase) y el texto que se ve no se queda en otro numero.
const registro = readFileSync('app/(auth)/registro.tsx', 'utf8').replace(/\r\n/g, '\n');

test('la contrasena del registro pide 6 caracteres, y el texto lo dice', () => {
  assert.match(registro, /const MIN_PASSWORD = 6;/);
  assert.match(registro, /password\.length >= MIN_PASSWORD/);
  assert.doesNotMatch(registro, /Minimo 8|>= 8/);
  assert.equal((registro.match(/Minimo 6 caracteres\./g) ?? []).length, 2, 'el error y la ayuda');
});

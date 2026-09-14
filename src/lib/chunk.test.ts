import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { byteLength, joinChunks, splitChunks } from './chunk.ts';

describe('splitChunks', () => {
  it('devuelve un unico trozo cuando cabe', () => {
    assert.deepEqual(splitChunks('hola', 16), ['hola']);
  });

  it('preserva la cadena vacia como un trozo vacio', () => {
    assert.deepEqual(splitChunks('', 16), ['']);
    assert.equal(joinChunks(splitChunks('', 16)), '');
  });

  it('ningun trozo supera maxBytes', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.'.repeat(400);
    for (const chunk of splitChunks(jwt, 2048)) {
      assert.ok(byteLength(chunk) <= 2048, `trozo de ${byteLength(chunk)} bytes`);
    }
  });

  it('cuenta bytes y no caracteres', () => {
    // 10 enes: 1 caracter, 2 bytes cada una => 20 bytes => 3 trozos con maxBytes 8.
    const chunks = splitChunks('n'.repeat(10).replace(/n/g, 'ñ'), 8);
    for (const chunk of chunks) assert.ok(byteLength(chunk) <= 8);
    assert.equal(chunks.length, 3);
  });

  it('nunca parte un emoji por la mitad', () => {
    const value = '\u{1F37B}'.repeat(20); // jarras de cerveza, 4 bytes cada una
    const chunks = splitChunks(value, 6); // solo cabe una por trozo
    assert.equal(chunks.length, 20);
    for (const chunk of chunks) {
      assert.equal(chunk, '\u{1F37B}');
      assert.ok(byteLength(chunk) <= 6);
    }
  });

  it('round-trip exacto para entradas variadas', () => {
    const casos = [
      'a',
      'sesion con acentos: cafe con lena, jamon',
      '\u{1F37B}\u{1F1EA}\u{1F1F8} mezcla ñ ascii',
      JSON.stringify({ access_token: 'x'.repeat(1500), refresh_token: 'y'.repeat(900) }),
    ];
    for (const caso of casos) {
      for (const size of [4, 7, 64, 2048]) {
        assert.equal(joinChunks(splitChunks(caso, size)), caso, `size=${size}`);
      }
    }
  });

  it('rechaza tamanos imposibles', () => {
    assert.throws(() => splitChunks('x', 3), RangeError);
    assert.throws(() => splitChunks('x', 2.5), RangeError);
  });
});

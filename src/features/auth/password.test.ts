import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  codigoValido,
  correoValido,
  limpiarCodigo,
  MIN_PASSWORD,
  passwordValida,
  SEGUNDOS_REENVIO,
  segundosParaReenviar,
} from './password.ts';

describe('contrasena', () => {
  it('el minimo es 4: 3 no vale, 4 si', () => {
    assert.equal(MIN_PASSWORD, 4);
    assert.ok(!passwordValida(''));
    assert.ok(!passwordValida('abc'));
    assert.ok(passwordValida('abcd'));
    assert.ok(passwordValida('1234'));
    assert.ok(passwordValida('una frase larga con espacios'));
  });

  it('la pantalla de registro usa este minimo y no un 8 suelto', async () => {
    const { readFileSync } = await import('node:fs');
    const registro = readFileSync('app/(auth)/registro.tsx', 'utf8');
    assert.doesNotMatch(registro, /length >= 8|Minimo 8/);
    assert.match(registro, /passwordValida/);
    assert.match(registro, /MIN_PASSWORD/);
  });
});

describe('correo', () => {
  it('acepta uno normal y rechaza lo que no lo parece', () => {
    assert.ok(correoValido('ana@example.com'));
    assert.ok(correoValido('  ana@example.com  '));
    for (const mal of ['', 'ana', 'ana@', '@example.com', 'ana@example', 'a na@example.com']) {
      assert.ok(!correoValido(mal), mal);
    }
  });
});

describe('codigo de recuperacion', () => {
  it('se limpia lo que se pega del correo: espacios, guiones, saltos y letras', () => {
    assert.equal(limpiarCodigo('123 456'), '123456');
    assert.equal(limpiarCodigo(' 12-34-56\n'), '123456');
    assert.equal(limpiarCodigo('codigo: 987654'), '987654');
  });

  it('no pasa de 6 digitos', () => {
    assert.equal(limpiarCodigo('123456789'), '123456');
  });

  it('solo es valido con exactamente 6 digitos', () => {
    assert.ok(codigoValido('123456'));
    assert.ok(codigoValido('123 456'));
    assert.ok(!codigoValido('12345'));
    assert.ok(!codigoValido(''));
    assert.ok(!codigoValido('abcdef'));
  });
});

describe('reenviar el codigo', () => {
  it('sin envio previo, ya se puede', () => {
    assert.equal(segundosParaReenviar(1_000_000, null), 0);
  });

  it('cuenta atras de 60 s hasta 0, y nunca negativa', () => {
    const t0 = 5_000_000;
    assert.equal(segundosParaReenviar(t0, t0), SEGUNDOS_REENVIO);
    assert.equal(segundosParaReenviar(t0 + 1_000, t0), SEGUNDOS_REENVIO - 1);
    assert.equal(segundosParaReenviar(t0 + 59_100, t0), 1);
    assert.equal(segundosParaReenviar(t0 + 60_000, t0), 0);
    assert.equal(segundosParaReenviar(t0 + 999_999, t0), 0);
  });

  it('un reloj que va hacia atras no deja mas de 60 s ni NaN', () => {
    const t0 = 5_000_000;
    assert.equal(segundosParaReenviar(t0 - 30_000, t0), SEGUNDOS_REENVIO);
    assert.equal(segundosParaReenviar(Number.NaN, t0), 0);
  });
});

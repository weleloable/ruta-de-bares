import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { traducirOtp } from './olvido-password.helper.ts';

/**
 * "He olvidado mi contrasena": red rapida y PARCIAL que lee el codigo. La logica
 * (minimo, codigo, espera) esta en password.test.ts; lo que no se puede probar
 * aqui es Supabase de verdad (ver docs/SETUP.md, seccion 10).
 */
const leer = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const login = leer('app/(auth)/login.tsx');
const olvido = leer('app/(auth)/olvido.tsx');
const proveedor = leer('src/features/auth/AuthProvider.tsx');
const setup = leer('docs/SETUP.md');

describe('recuperar la contrasena', () => {
  it('el login tiene el enlace y lleva a /olvido', () => {
    assert.match(login, /He olvidado mi contraseña/);
    assert.match(login, /router\.push\('\/olvido'\)/);
  });

  it('esta dentro del grupo (auth): se ve sin sesion sin tocar AuthGate', () => {
    assert.ok(olvido.length > 0);
    assert.doesNotMatch(leer('app/_layout.tsx'), /olvido/);
  });

  it('usa el codigo (verifyOtp, type recovery) y no el enlace', () => {
    assert.match(proveedor, /resetPasswordForEmail\(/);
    assert.match(proveedor, /verifyOtp\(\{[^}]*type: 'recovery'/s);
    assert.match(proveedor, /updateUser\(\{ password: newPassword \}\)/);
    assert.doesNotMatch(proveedor, /redirectTo/);
  });

  it('canjear y cambiar van JUNTOS en el proveedor, y si cambiar falla se cierra la sesion', () => {
    const f = proveedor.slice(proveedor.indexOf('const resetPasswordWithCode'));
    const cuerpo = f.slice(0, f.indexOf('}, []);'));
    assert.ok(cuerpo.indexOf('verifyOtp') < cuerpo.indexOf('updateUser'), 'primero el codigo');
    assert.match(cuerpo, /signOut\(\)/);
  });

  it('la pantalla pide codigo y contrasena en el mismo paso, y tiene reenvio con espera', () => {
    assert.match(olvido, /resetPasswordWithCode\(email, codigo, password\)/);
    assert.match(olvido, /segundosParaReenviar/);
    assert.match(olvido, /autoComplete="one-time-code"/);
  });

  it('el codigo mal escrito o caducado sale en castellano, no en crudo', () => {
    assert.match(traducirOtp('Token has expired or is invalid'), /código no es válido o ha caducado/);
    assert.match(traducirOtp('Email OTP expired'), /código no es válido o ha caducado/);
    assert.match(traducirOtp('For security purposes, you can only request this after 52 seconds'), /Demasiados intentos/);
    // Lo de antes no se rompe.
    assert.equal(traducirOtp('Invalid login credentials'), 'Correo o contrasena incorrectos.');
  });

  it('SETUP.md dice lo que hay que cambiar en el panel de Supabase', () => {
    assert.match(setup, /\{\{ \.Token \}\}/);
    assert.match(setup, /Minimum\s+password length/);
  });
});

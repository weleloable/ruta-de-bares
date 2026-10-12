import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CLAVE_PUBLICA_PUSH, claveABytes, decidirEstado, textoEstado } from './estado.ts';

describe('avisos en el movil', () => {
  const base = { soportado: true, ios: false, instalada: false, permiso: 'default' as const, suscrito: false };

  it('estado del dispositivo', () => {
    assert.equal(decidirEstado(base), 'pendiente');
    assert.equal(decidirEstado({ ...base, permiso: 'granted', suscrito: true }), 'activo');
    // Con permiso pero sin suscripcion (se perdio): se puede volver a activar.
    assert.equal(decidirEstado({ ...base, permiso: 'granted' }), 'pendiente');
    assert.equal(decidirEstado({ ...base, permiso: 'denied' }), 'denegado');
    assert.equal(decidirEstado({ ...base, soportado: false, permiso: null }), 'no-soportado');
  });

  it('en iPhone hay que instalarla antes', () => {
    assert.equal(decidirEstado({ ...base, ios: true, soportado: false, permiso: null }), 'instalar');
    assert.equal(decidirEstado({ ...base, ios: true, instalada: true }), 'pendiente');
    assert.match(textoEstado('instalar'), /pantalla de inicio/);
  });

  it('la clave publica es un punto P-256 sin comprimir (65 bytes, empieza por 4)', () => {
    const bytes = claveABytes(CLAVE_PUBLICA_PUSH);
    assert.equal(bytes.length, 65);
    assert.equal(bytes[0], 4);
  });
});

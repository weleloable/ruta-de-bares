import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// La siembra crea usuarios con contrasena conocida: si alguna vez apunta a
// produccion es un agujero. Tiene que negarse ANTES de hacer nada.
test('la semilla local se niega a sembrar una URL que no es de esta maquina', () => {
  for (const url of ['https://abc.supabase.co', 'http://192.168.1.5:54421', 'http://127.0.0.1.evil.com']) {
    const r = spawnSync(process.execPath, ['scripts/semilla-local.mjs'], {
      env: { ...process.env, SEMILLA_API_URL: url },
      encoding: 'utf8',
    });
    assert.equal(r.status, 1, url);
    assert.match(r.stderr, /no es local/, url);
  }
});

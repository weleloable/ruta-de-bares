import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { estaInstalada } from './pwaInstalada.ts';

describe('estaInstalada', () => {
  it('no instalada: ni display-mode standalone ni navigator.standalone', () => {
    assert.equal(estaInstalada(false, false), false);
  });

  it('instalada por display-mode: standalone (Chrome/Edge/Android)', () => {
    assert.equal(estaInstalada(true, false), true);
  });

  it('instalada por navigator.standalone (Safari/iOS)', () => {
    assert.equal(estaInstalada(false, true), true);
  });

  it('las dos senales a la vez tambien cuentan como instalada', () => {
    assert.equal(estaInstalada(true, true), true);
  });
});

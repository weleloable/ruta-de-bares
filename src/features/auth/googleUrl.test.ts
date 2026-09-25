import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extraerCodigo, extraerErrorVuelta, traducirErrorGoogle, urlVueltaWeb } from './googleUrl.ts';

describe('urlVueltaWeb', () => {
  it('localhost: la raiz', () => {
    assert.equal(urlVueltaWeb('http://localhost:8081', '/'), 'http://localhost:8081/');
  });
  it('GitHub Pages: bajo la subruta', () => {
    assert.equal(
      urlVueltaWeb('https://weleloable.github.io', '/ruta-de-bares/'),
      'https://weleloable.github.io/ruta-de-bares/',
    );
  });
  it('no duplica barras', () => {
    assert.equal(urlVueltaWeb('http://localhost:8081/', '/'), 'http://localhost:8081/');
  });
});

describe('extraerCodigo', () => {
  it('lo saca de la consulta del deep link', () => {
    assert.equal(extraerCodigo('rutadebares://auth-callback?code=abc123'), 'abc123');
  });
  it('null si no hay codigo o no hay consulta', () => {
    assert.equal(extraerCodigo('rutadebares://auth-callback'), null);
    assert.equal(extraerCodigo('rutadebares://auth-callback?otra=1'), null);
  });
  it('ignora lo que venga tras el #', () => {
    assert.equal(extraerCodigo('rutadebares://auth-callback?code=abc#code=zzz'), 'abc');
  });
});

describe('extraerErrorVuelta', () => {
  it('lee el error de la consulta', () => {
    assert.equal(extraerErrorVuelta('rutadebares://cb?error=access_denied&error_description=User+denied'), 'User denied');
  });
  it('lee el error del fragmento', () => {
    assert.equal(extraerErrorVuelta('https://x/#error=server_error'), 'server_error');
  });
  it('null cuando todo fue bien', () => {
    assert.equal(extraerErrorVuelta('rutadebares://cb?code=abc'), null);
  });
});

describe('traducirErrorGoogle', () => {
  it('proveedor sin activar en Supabase', () => {
    assert.match(traducirErrorGoogle('Unsupported provider: provider is not enabled'), /no esta activado/);
  });
  it('cancelar', () => {
    assert.match(traducirErrorGoogle('User denied access'), /cancelado/);
  });
  it('redirect no permitido', () => {
    assert.match(traducirErrorGoogle('redirect URL is not allowed'), /falta permitir/);
  });
  it('navegador embebido', () => {
    assert.match(traducirErrorGoogle('Error 403: disallowed_useragent'), /Chrome o Safari/);
  });
  it('lo desconocido pasa tal cual', () => {
    assert.equal(traducirErrorGoogle('algo raro'), 'algo raro');
  });
});

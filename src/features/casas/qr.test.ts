import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import jsQR from 'jsqr';
import QRCode from 'qrcode/lib/core/qrcode.js';

import { contenidoQr, describirErrorQr, leerQr, qrUri } from './qr.ts';

const CODIGO = '0123456789abcdef0123456789abcdef';

describe('QR social', () => {
  it('lo que se escribe es lo que se lee', () => {
    assert.equal(leerQr(contenidoQr(CODIGO)), CODIGO);
    assert.equal(leerQr(`  ${contenidoQr(CODIGO)}\n`), CODIGO);
    assert.equal(leerQr('https://example.com'), null, 'un QR cualquiera no');
    assert.equal(leerQr('rutapp-qr:nada'), null);
  });

  it('la imagen es un SVG valido', () => {
    const uri = qrUri(contenidoQr(CODIGO));
    assert.match(uri, /^data:image\/svg\+xml;utf8,/);
    assert.match(decodeURIComponent(uri), /<svg[\s\S]*<path d="M/);
  });

  it('un QR generado asi lo lee jsQR (el escaner de la app)', () => {
    const texto = contenidoQr(CODIGO);
    const m = QRCode.create(texto, { errorCorrectionLevel: 'M' }).modules;
    const escala = 4;
    const margen = 4;
    const lado = (m.size + margen * 2) * escala;
    const px = new Uint8ClampedArray(lado * lado * 4).fill(255);
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const f = Math.floor(y / escala) - margen;
        const c = Math.floor(x / escala) - margen;
        if (f >= 0 && c >= 0 && f < m.size && c < m.size && m.get(f, c)) {
          const i = (y * lado + x) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
      }
    }
    assert.equal(jsQR(px, lado, lado)?.data, texto);
  });

  it('los errores del servidor se leen en castellano', () => {
    assert.match(describirErrorQr('ERROR: QR_OTHER_HOUSE'), /otra casa/);
    assert.match(describirErrorQr('QR_REPEATED'), /Ya os habíais/);
    assert.match(describirErrorQr('PGRST202'), /0046/);
  });
});

import { decodeStampPayload, encodeStampPayload } from '../src/lib/qr';

const ROUTE_ID = '11111111-1111-4111-8111-111111111111';
const BAR_ID = '22222222-2222-4222-8222-222222222222';

describe('encodeStampPayload / decodeStampPayload', () => {
  it('round-trips a valid payload', () => {
    const encoded = encodeStampPayload({ routeId: ROUTE_ID, barId: BAR_ID, secret: 'abc123' });
    const decoded = decodeStampPayload(encoded);
    expect(decoded).toEqual({
      ok: true,
      payload: { v: 1, routeId: ROUTE_ID, barId: BAR_ID, secret: 'abc123' },
    });
  });

  it('rejects garbage that is not base64', () => {
    const decoded = decodeStampPayload('%%%not-base64%%%');
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toBe('not_base64');
  });

  it('rejects base64 that is not JSON', () => {
    const encoded = Buffer.from('not json at all', 'utf-8').toString('base64');
    const decoded = decodeStampPayload(encoded);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toBe('not_json');
  });

  it('rejects JSON with the wrong shape (e.g. a QR from another app)', () => {
    const encoded = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf-8').toString('base64');
    const decoded = decodeStampPayload(encoded);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toBe('invalid_shape');
  });

  it('rejects a payload with a non-uuid barId', () => {
    const encoded = Buffer.from(
      JSON.stringify({ v: 1, routeId: ROUTE_ID, barId: 'not-a-uuid', secret: 'x' }),
      'utf-8'
    ).toString('base64');
    const decoded = decodeStampPayload(encoded);
    expect(decoded.ok).toBe(false);
  });

  it('rejects an unknown payload version (future/old QR format)', () => {
    const encoded = Buffer.from(
      JSON.stringify({ v: 2, routeId: ROUTE_ID, barId: BAR_ID, secret: 'x' }),
      'utf-8'
    ).toString('base64');
    const decoded = decodeStampPayload(encoded);
    expect(decoded.ok).toBe(false);
  });
});

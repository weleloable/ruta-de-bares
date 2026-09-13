// Codificación/decodificación del payload que llevan los QR físicos de cada
// bar. Puro (sin I/O) a propósito: así se puede testear sin mocks de cámara
// ni de red. El secreto en sí solo lo valida el servidor (redeem_stamp);
// esta capa solo empaqueta/desempaqueta el mensaje.
import { z } from 'zod';

const PAYLOAD_VERSION = 1;

const stampPayloadSchema = z.object({
  v: z.literal(PAYLOAD_VERSION),
  routeId: z.string().uuid(),
  barId: z.string().uuid(),
  secret: z.string().min(1),
});

export type StampPayload = z.infer<typeof stampPayloadSchema>;

/** Construye el texto que se codifica en el QR físico de un bar. */
export function encodeStampPayload(payload: Omit<StampPayload, 'v'>): string {
  const full: StampPayload = { v: PAYLOAD_VERSION, ...payload };
  const json = JSON.stringify(full);
  return base64Encode(json);
}

export type DecodeResult =
  | { ok: true; payload: StampPayload }
  | { ok: false; error: 'not_base64' | 'not_json' | 'invalid_shape' };

/** Decodifica y valida lo leído por el escáner de QR. Nunca lanza. */
export function decodeStampPayload(raw: string): DecodeResult {
  let json: string;
  try {
    json = base64Decode(raw);
  } catch {
    return { ok: false, error: 'not_base64' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'not_json' };
  }

  const result = stampPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: 'invalid_shape' };
  }
  return { ok: true, payload: result.data };
}

function base64Encode(input: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(input)));
  }
  return Buffer.from(input, 'utf-8').toString('base64');
}

function base64Decode(input: string): string {
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(input)));
  }
  return Buffer.from(input, 'base64').toString('utf-8');
}

import QRCode from 'qrcode/lib/core/qrcode.js';

/**
 * QR social (0046): lo que lleva dentro el QR, su imagen y los errores. El
 * codigo lo da y lo comprueba el servidor (`qr_mi_codigo`, `qr_escanear`);
 * caduca al minuto, asi que aqui no hay nada que guardar.
 */

const PREFIJO = 'rutapp-qr:';

export function contenidoQr(codigo: string): string {
  return PREFIJO + codigo;
}

/** El codigo de un QR leido, o null si no es un QR de la app. */
export function leerQr(texto: string): string | null {
  const t = texto.trim();
  if (!t.startsWith(PREFIJO)) return null;
  const codigo = t.slice(PREFIJO.length);
  return /^[0-9a-f]{32}$/.test(codigo) ? codigo : null;
}

/** El QR como SVG (cuadros negros sobre blanco, con su margen) en data URI. */
export function qrUri(texto: string): string {
  const m = QRCode.create(texto, { errorCorrectionLevel: 'M' }).modules;
  const margen = 4;
  const lado = m.size + margen * 2;
  let d = '';
  for (let f = 0; f < m.size; f++) {
    for (let c = 0; c < m.size; c++) {
      if (m.get(f, c)) d += `M${c + margen} ${f + margen}h1v1h-1z`;
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges">` +
    `<rect width="${lado}" height="${lado}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const MENSAJES: Record<string, string> = {
  QR_INVALID: 'Ese QR ha caducado o no es válido. Pide que lo vuelva a enseñar.',
  QR_SELF: 'Ese es tu propio QR.',
  QR_OTHER_HOUSE: 'Es de otra casa: los encuentros solo cuentan entre gente de la misma casa.',
  QR_NOT_IN_ROUTE: 'Esa persona no está en esta ruta.',
  QR_REPEATED: 'Ya os habíais encontrado en esta ruta.',
  QR_OUT_OF_TIME: 'Los encuentros solo cuentan durante la ruta.',
  SUSPENDED: 'Tu cuenta está suspendida.',
  FORBIDDEN: 'Tienes que estar en la ruta.',
};

export function describirErrorQr(mensaje: string): string {
  const codigo = Object.keys(MENSAJES).find((c) => new RegExp(`\\b${c}\\b`).test(mensaje));
  if (codigo) return MENSAJES[codigo];
  if (/PGRST202|Could not find the function/i.test(mensaje)) return 'Falta aplicar la migración 0046 en Supabase.';
  return mensaje || 'No se pudo leer el QR.';
}

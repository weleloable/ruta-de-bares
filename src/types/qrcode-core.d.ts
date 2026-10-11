/**
 * Solo el nucleo de `qrcode` (la matriz del QR, JS puro). El paquete entero
 * arrastra canvas y `fs` en Node; el nucleo vale igual en web, movil y tests.
 */
declare module 'qrcode/lib/core/qrcode.js' {
  const QRCode: {
    create(
      texto: string,
      opciones?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' },
    ): { modules: { size: number; get(fila: number, columna: number): number } };
  };
  export default QRCode;
}

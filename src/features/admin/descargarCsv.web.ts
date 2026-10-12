/**
 * Descarga el CSV como fichero. Lleva delante la marca de orden de bytes
 * (BOM) de UTF-8: sin ella, Excel en Windows abre el fichero en otra
 * codificacion y los acentos salen rotos.
 */
const BOM = '﻿';

export async function descargarCsv(nombre: string, contenido: string): Promise<void> {
  const blob = new Blob([BOM, contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

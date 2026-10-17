/** SVG -> JPEG con el Chrome del grabador (sin Pillow ni sharp: una dependencia menos). */
export function crearRasterizador(navegador) {
  let pagina = null;
  return async function rasterizar(svg, lado) {
    pagina ??= await navegador.newPage();
    await pagina.setViewportSize({ width: lado, height: lado });
    await pagina.setContent(
      `<html><body style="margin:0">${svg.replace('width="512" height="512"', `width="${lado}" height="${lado}"`)}</body></html>`,
    );
    return pagina.screenshot({ type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: lado, height: lado } });
  };
}

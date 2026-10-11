/** Piezas que repiten varios guiones. */
import { CLAVE_DEMO, correo } from '../reparto.mjs';

/** Abre una ruta de la app en el movil y espera a que pinte `texto`. */
export async function abrir(d, ctx, camino, texto) {
  await d.pagina.evaluate((u) => window.escena.abrir(u), `${ctx.base}${camino}`);
  await d.app.waitForLoadState('domcontentloaded').catch(() => {});
  if (texto) await d.buscar(texto, 30000);
}

/** Entra SIN grabar (antes de empezar o detras de una tarjeta). */
export async function entrarDeprisa(d, ctx, nombre) {
  await abrir(d, ctx, '/login', 'Entrar');
  await d.app.getByPlaceholder('tu@correo.com').fill(correo(nombre));
  await d.app.getByPlaceholder('********').fill(CLAVE_DEMO);
  await d.clic('Entrar');
  await d.buscar('Credencial de', 30000);
}

export function portada(seccion, titulo, texto, lista) {
  return { sobre: `Cómo se usa · ${seccion}`, titulo, texto, lista };
}

export function cierre(texto, siguiente) {
  return {
    sobre: 'Ruta de Bares',
    titulo: '¡Listo!',
    texto,
    pie: siguiente ? `Siguiente vídeo: ${siguiente}` : '',
  };
}

/** Portada de unos segundos, y se retira para ver la app. */
export async function empezar(d, { seccion, pasos, tarjeta }) {
  await d.seccion(seccion, pasos);
  await d.tarjeta(tarjeta, 4200);
  await d.quitarTarjeta(700);
}

export async function terminar(d, tarjeta) {
  await d.sinDedo();
  await d.tarjeta(tarjeta, 3800);
}

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

/**
 * Un boton de la barra de pestanas. Por su rol y no por el texto: "Sellos" o
 * "Casas" salen tambien en otras pantallas (la leyenda de Casas) y el primero
 * visible no era la pestana.
 */
export function pestana(d, nombre) {
  // El nombre accesible lleva delante el glifo del icono: se mira el final.
  return d.app.getByRole('tab', { name: new RegExp(`${nombre}$`) });
}

/** Portada de unos segundos (`ms`), y se retira para ver la app. */
export async function empezar(d, { seccion, pasos, tarjeta, ms = 4200 }) {
  await d.seccion(seccion, pasos);
  await d.tarjeta(tarjeta, ms);
  await d.quitarTarjeta(700);
}

export async function terminar(d, tarjeta, ms = 3800) {
  await d.sinDedo();
  await d.tarjeta(tarjeta, ms);
}

/**
 * La presentacion "Tu casa es…" (0057) sale una vez al entrar en la primera
 * ruta, por encima de todo. Los videos que no hablan de casas la quitan antes
 * de grabar; el de Casas la ensena.
 */
export async function quitarCasaNueva(d) {
  const vamos = d.app.getByText('¡Vamos!', { exact: true });
  if (await d.buscar(vamos, 6000).then(() => true, () => false)) {
    await d.clic(vamos);
    await d.esperar(800);
  }
}

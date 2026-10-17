/** Piezas que repiten varios guiones. */
import { CLAVE_DEMO, correo } from '../reparto.mjs';

/** Abre una ruta de la app en el movil y espera a que pinte `texto`. */
export async function abrir(d, ctx, camino, texto) {
  await d.pagina.evaluate((u) => window.escena.abrir(u), `${ctx.base}${camino}`);
  await d.app.waitForLoadState('domcontentloaded').catch(() => {});
  if (texto) await d.buscar(texto, 30000);
}

/**
 * Clave con la que la app recuerda que ya pregunto por los avisos en el movil
 * (src/features/push/InvitacionAvisos.tsx, YA_PREGUNTADO). La vigila un test.
 */
export const CLAVE_AVISOS_PREGUNTADO = 'rb-avisos-preguntado';

/**
 * Entra SIN grabar (antes de empezar o detras de una tarjeta). Como alguien
 * que ya usaba la app: la invitacion "¿Te avisamos?" ya la contesto, o sale
 * en mitad del video.
 */
export async function entrarDeprisa(d, ctx, nombre) {
  await abrir(d, ctx, '/login', 'Entrar');
  await d.app.evaluate((clave) => localStorage.setItem(clave, '1'), CLAVE_AVISOS_PREGUNTADO);
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
 * Lo que la app ensena SOLO al entrar, por encima de todo, y que no es de lo
 * que va el video: el aviso de politica nueva (0063), la invitacion a los
 * avisos en el movil (0064) y la presentacion "Tu casa es…" (0057). Salen en
 * cualquier orden y unas tras otras, asi que se van quitando hasta que pasan
 * unos segundos sin que salga ninguna. El video de Casas deja la de la casa.
 */
export async function limpiarEntrada(d, { dejarCasa = false } = {}) {
  const botones = [
    ['Entendido', 'Hemos actualizado la política de privacidad'],
    ['Ahora no', '¿Te avisamos?'],
    ...(dejarCasa ? [] : [['¡Vamos!', 'Tu casa es…']]),
  ];
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    let quitado = false;
    for (const [boton, titulo] of botones) {
      if (await d.seVe(titulo)) {
        await d.clic(d.app.getByText(boton, { exact: true }));
        await d.esperar(900);
        quitado = true;
      }
    }
    if (!quitado) {
      await d.esperar(1500);
      if (!(await Promise.all(botones.map(([, t]) => d.seVe(t)))).some(Boolean)) return;
    }
  }
}

/** Antes de grabar, sin dejar nada de la entrada (ni la casa). */
export async function quitarCasaNueva(d) {
  await limpiarEntrada(d);
}

/**
 * Que ensenar a quien quiere instalar la web como app pero el navegador no le
 * da el boton nativo. Separado de pwaInstalar.web.ts (que toca `window`) para
 * probarlo en Node con user-agents reales, igual que pwaInstalada.ts.
 *
 * Por que hace falta: el boton de "Instalar App" solo existe cuando el navegador
 * dispara `beforeinstallprompt`, y no lo hace en
 *   - Safari de iPhone/iPad (nunca: ahi se instala a mano desde Compartir),
 *   - el navegador interno de WhatsApp, Instagram, Facebook... (donde se reparten
 *     los enlaces de invitacion) ni en Telegram con su pestana integrada,
 *   - Firefox o un Chrome que ya descarto la oferta.
 * En todos esos casos antes no salia nada y nadie sabia por que. Ahora el boton
 * sale igual y, en vez de lanzar el aviso del navegador, abre estas
 * instrucciones.
 */

export type GuiaInstalar = 'ios-safari' | 'ios-otro' | 'abrir-en-navegador' | 'menu';

export type EntornoInstalar = {
  userAgent: string;
  /** `navigator.platform`: iPadOS pide "sitio de escritorio" y se hace pasar por un Mac. */
  plataforma: string;
  puntosTactiles: number;
  /** Ya abierta como app (display-mode: standalone o navigator.standalone). */
  yaInstalada: boolean;
  /** El navegador ya dio su aviso de instalar (`beforeinstallprompt`): entonces no hace falta guia. */
  avisoNativoListo: boolean;
};

// Navegadores integrados en otras apps. En Android son un WebView (`; wv)`) o
// la propia app lo declara; en iOS (WKWebView) no llevan "Safari/" (ver abajo).
const NAVEGADOR_INTEGRADO =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|Bytedance|Twitter|LinkedInApp|Pinterest|WhatsApp|Telegram|; wv\)/i;

function esIos(e: EntornoInstalar): boolean {
  if (/iPhone|iPad|iPod/.test(e.userAgent)) return true;
  // iPadOS 13+ con "sitio de escritorio": UA de Mac, pero con pantalla tactil.
  return e.plataforma === 'MacIntel' && e.puntosTactiles > 1;
}

/**
 * La guia que toca, o null si no hace falta (ya instalada, el navegador tiene su
 * propio aviso, o es un ordenador sin forma de instalar: ahi no se ofrece nada).
 */
export function elegirGuia(e: EntornoInstalar): GuiaInstalar | null {
  if (e.yaInstalada || e.avisoNativoListo) return null;

  if (esIos(e)) {
    const otroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS/.test(e.userAgent);
    // Los navegadores integrados de iOS no llevan "Safari/" en el user-agent; Safari y
    // los navegadores de terceros (que son WebKit por dentro) si.
    if (NAVEGADOR_INTEGRADO.test(e.userAgent) || (!otroNavegador && !/Safari\//.test(e.userAgent))) {
      return 'abrir-en-navegador';
    }
    return otroNavegador ? 'ios-otro' : 'ios-safari';
  }

  const movil = /Android|Mobile/i.test(e.userAgent);
  if (!movil) return null;
  return NAVEGADOR_INTEGRADO.test(e.userAgent) ? 'abrir-en-navegador' : 'menu';
}

export type TextoGuia = { titulo: string; pasos: string[] };

export function textoGuia(guia: GuiaInstalar): TextoGuia {
  switch (guia) {
    case 'ios-safari':
      return {
        titulo: 'Instalar en el iPhone',
        pasos: [
          'Toca los tres puntos «•••» de la barra de Safari.',
          'Toca «Compartir».',
          'Toca «Ver más» y, en la lista, «Añadir a pantalla de inicio».',
          'Toca «Añadir». Ya la tienes como una app más.',
        ],
      };
    case 'ios-otro':
      return {
        titulo: 'Instalar en el iPhone',
        pasos: [
          'Toca el botón Compartir (el cuadrado con una flecha hacia arriba), junto a la barra de direcciones.',
          'Toca «Ver más» y, en la lista, «Añadir a pantalla de inicio».',
          'Toca «Añadir». Ya la tienes como una app más.',
        ],
      };
    case 'abrir-en-navegador':
      return {
        titulo: 'Ábrela en tu navegador',
        pasos: [
          'Ahora estás dentro de otra app (WhatsApp, Instagram...) y desde aquí no se puede instalar.',
          'Toca el menú ⋯ (o el icono del navegador) y elige «Abrir en Safari», «Abrir en Chrome» o «Abrir en el navegador».',
          'Ya en el navegador, vuelve a abrir el enlace. Para instalar la app, toca luego «Instalar App» en Mi perfil.',
        ],
      };
    case 'menu':
      return {
        titulo: 'Instalar en el móvil',
        pasos: [
          'Abre el menú del navegador (los tres puntos ⋮ o las tres rayas ≡).',
          'Toca «Instalar aplicación» o «Añadir a pantalla de inicio».',
          'Si no te sale ninguna de las dos, abre este enlace en Chrome: algunas pestañas integradas no dejan instalar.',
        ],
      };
  }
}

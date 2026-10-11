import { PARADA_EN_VIVO, PROTA } from '../reparto.mjs';
import { entrarDeprisa } from './comun.mjs';
import { tirarCana } from './juegos.mjs';

/**
 * El trailer: lo mismo que las demos pero a ritmo de anuncio. Frases en vez
 * de pasos numerados, y la app de verdad en cada plano (nada de maquetas).
 */
export default {
  id: 'trailer',
  fichero: '00-trailer',
  titulo: 'Tráiler',
  posicionInicial: (datos) => ({ latitude: datos.bares[PARADA_EN_VIVO].lat + 0.00008, longitude: datos.bares[PARADA_EN_VIVO].lng }),
  async preparar(d, ctx) {
    // La Caña ya activada (su demo ensena la activacion) y Sergio esperando un Me gusta.
    await ctx.mundo.activarCana(PROTA);
    await ctx.mundo.meGusta('Sergio', PROTA);
    await entrarDeprisa(d, ctx, PROTA);
    await d.inclinar(0, { dibujo: false });
  },
  async grabar(d, ctx) {
    const bar = ctx.bares[PARADA_EN_VIVO];
    await d.seccion('', 0);
    // Frases grandes y centradas en vez de pasos (escenario: body.trailer).
    await d.pagina.evaluate(() => document.body.classList.add('trailer'));
    await d.tarjeta({ clase: 'oscura grande', sobre: 'Ruta de Bares', titulo: '¿Te vienes de ruta?' }, 2800);
    await d.tarjeta({ logo: false, clase: 'grande', titulo: 'Múltiples bares.<br>Una ruta.', texto: 'Y una medalla para quien llegue al final.' }, 2800);
    await d.quitarTarjeta(500);

    await d.titular('Tus sellos de la ruta, <b>en el móvil</b>.', 2200);
    await d.tocar(d.app.getByText(bar.name, { exact: true }), { despues: 1400 });
    await d.titular('Llegas al bar. <b>Sellas.</b>', 600);
    await d.tocar('Sellar este bar', { despues: 2600 });
    await d.titular('¡Uno más!', 1200);
    if (await d.seVe('Cerrar')) await d.tocar('Cerrar', { despues: 900 });

    await d.titular('La ruta entera, <b>en el mapa</b>.', 500);
    await d.tocar(d.app.getByText('Ruta', { exact: true }), { despues: 2600 });

    await d.titular('Conoce a <b>la gente de tu ruta</b>.', 500);
    await d.tocar(d.app.getByText('Caña', { exact: true }), { despues: 1800 });
    await d.tocar('Sergio', { despues: 1400 });
    await d.titular('Si os gustáis…', 400);
    await d.tocar('Me gusta', { despues: 1800 });
    await d.titular('…¿te tomas <b>una caña</b> conmigo?', 2400);

    // La ficha tapa la barra de pestanas: de vuelta a la lista.
    await d.tocar(d.app.getByLabel('Volver', { exact: true }), { despues: 900 });
    await d.titular('Y entre bar y bar, <b>juegos</b>.', 500);
    await d.tocar(d.app.getByText('Juegos', { exact: true }), { despues: 1300 });
    await d.tocar('La Caña Perfecta', { despues: 1000 });
    await d.tocar('Empezar', { despues: 600 });
    await d.titular('¿Tiras <b>la caña perfecta</b>?', 300);
    await tirarCana(d);
    await d.tocar('Entregar', { despues: 2400 });

    await d.tarjeta({ logo: false, clase: 'oscura', titulo: 'Y cuando completas la ruta…' });
    await ctx.mundo.sellarResto(PROTA);
    await d.clic(d.app.getByText('Sellos', { exact: true }));
    await d.recargar('Credencial de');
    await d.esperar(1800);
    await d.quitarTarjeta(600);
    await d.titular('…tu <b>medalla</b>…', 300);
    await d.tocar(d.app.getByLabel('Medalla: ruta completa. Toca para ver tu diploma'), { despues: 1600 });
    await d.titular('…y tu <b>diploma</b>.', 2800);
    await d.sinDedo();
    await d.tarjeta({
      clase: 'grande',
      sobre: 'Pide tu invitación',
      titulo: 'Ruta de Bares',
      texto: 'Abre el enlace que te pasen y entra. Sin tienda: se instala desde el navegador.',
    }, 5000);
  },
};

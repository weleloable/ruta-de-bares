import { PARADA_EN_VIVO, PROTA } from '../reparto.mjs';
import { entrarDeprisa, pestana } from './comun.mjs';

/**
 * Tira la caña como se debe: vaso inclinado ~45 grados (poca espuma) y recto
 * al final para la corona. Con el caudal de modelo.ts (0,22 por segundo) son
 * ~3,7 s inclinado y ~0,75 s recto: ~20 % de espuma y el vaso al borde.
 */
async function tirarCana(d) {
  await d.inclinar(45);
  await d.esperar(700);
  const soltar = await d.apretar(d.app.getByLabel('Mantén pulsado para servir cerveza'));
  await d.esperar(3650);
  for (const g of [30, 15, 0]) {
    await d.inclinar(g);
    await d.esperar(70);
  }
  await d.esperar(560);
  await soltar();
  await d.esperar(600);
  await d.inclinar(0);
  await d.esperar(700);
}

/**
 * El trailer: lo mismo que las demos pero a ritmo de anuncio. Frases en vez
 * de pasos numerados, y la app de verdad en cada plano (nada de maquetas).
 * Los minijuegos solo salen aqui, como adelanto: no tienen demo a proposito,
 * la idea es que cada cual los descubra jugando.
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
    await d.titular('Y entre bar y bar, <b>minijuegos</b>.', 500);
    await d.tocar(d.app.getByText('Juegos', { exact: true }), { despues: 2600 });
    await d.tocar('La Caña Perfecta', { despues: 1000 });
    await d.tocar('Empezar', { despues: 600 });
    await d.titular('¿Tiras <b>la caña perfecta</b>?', 300);
    await tirarCana(d);
    await d.tocar('Entregar', { despues: 2400 });

    await d.tarjeta({ logo: false, clase: 'oscura', titulo: 'Y cuando completas la ruta…' });
    await ctx.mundo.sellarResto(PROTA);
    await d.clic(pestana(d, 'Sellos'));
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

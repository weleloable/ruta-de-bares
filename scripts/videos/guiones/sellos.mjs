import { PARADA_EN_VIVO, PARADA_FOTO, PARADAS, PROTA, SORTEO } from '../reparto.mjs';
import { abrir, cierre, empezar, entrarDeprisa, pestana, portada, quitarCasaNueva, terminar } from './comun.mjs';

/** A ~250 m al norte del bar: "te faltan X m". */
const lejos = (bar) => ({ latitude: bar.lat + 0.0023, longitude: bar.lng + 0.0004 });
/** En la puerta. */
const cerca = (bar) => ({ latitude: bar.lat + 0.00008, longitude: bar.lng });

/**
 * Ruta y Sellos en un minuto: el mapa (con la parada de foto, que no se sella),
 * sellar un bar al llegar, el sorteo de la camiseta y la medalla.
 */
export default {
  id: 'sellos',
  fichero: '04-ruta-y-sellos',
  titulo: 'Ruta y sellos',
  posicionInicial: (datos) => lejos(datos.bares[PARADA_EN_VIVO]),
  async preparar(d, ctx) {
    await entrarDeprisa(d, ctx, PROTA);
    await quitarCasaNueva(d);
    await abrir(d, ctx, '/ruta', 'Ver toda la ruta');
    await d.esperar(2500); // teselas del mapa
  },
  async grabar(d, ctx) {
    const bar = ctx.bares[PARADA_EN_VIVO];
    await empezar(d, {
      seccion: 'Ruta y sellos',
      pasos: 9,
      ms: 3200,
      tarjeta: portada('Ruta y sellos', 'Tus sellos de la ruta', 'Un sello por bar, y una camiseta en juego.', [
        'La ruta en el mapa',
        'Sellar un bar al llegar',
        'El sorteo de la camiseta',
      ]),
    });
    await d.paso('En <b>Ruta</b> tienes todas las paradas en el mapa, en orden, con su horario.', { pausa: 2800 });
    await d.paso(`Una es para la foto de grupo: el <b>${PARADA_FOTO.nombre}</b>. Sale en el mapa, pero no se sella.`, { pausa: 700 });
    // Su marcador es una camara: tocarlo la centra y trae su tarjeta al carrusel.
    await d.tocar(d.app.getByText('📷', { exact: true }), { despues: 1600 });
    await d.foco(d.app.getByText(new RegExp(PARADA_FOTO.nombre)), 2000);

    await d.paso('Los sellos, en el botón del centro: <b>Sellos</b>. Cada chapa es un bar.', { pausa: 700 });
    await d.tocar(pestana(d, 'Sellos'), { despues: 1800 });

    await d.paso(`Al llegar al bar, toca su chapa: <b>${bar.name}</b>.`, { pausa: 700 });
    await d.tocar(d.app.getByText(bar.name, { exact: true }), { despues: 1600 });
    await d.paso('Solo sella si estás <b>dentro del bar</b> y en su <b>horario</b>. Aquí aún estás lejos.', { pausa: 600 });
    await d.foco(d.app.getByText(/Estas a \d+ m/), 2200);

    await ctx.contexto.setGeolocation(cerca(bar));
    await d.paso('Ya en la puerta: <b>Volver a medir mi posición</b> y <b>Sellar este bar</b>.', { pausa: 600 });
    await d.tocar('Volver a medir mi posicion', { despues: 1500 });
    await d.tocar('Sellar este bar', { despues: 3200 });
    const cerrar = d.app.getByText('Cerrar', { exact: true });
    if (await d.seVe(cerrar)) await d.tocar(cerrar, { despues: 1000 });

    await d.paso(`Si sellas todos los bares, entras en el <b>sorteo de una ${SORTEO.premio.toLowerCase()}</b>.`, { pausa: 600 });
    await d.tocar('Información del sorteo', { despues: 2600 });
    await d.tocar(d.app.getByText('Entendido', { exact: true }), { despues: 600 });

    await d.tarjeta({ logo: false, sobre: 'Ruta y sellos', titulo: `Unas horas y ${PARADAS.length - PARADA_EN_VIVO - 1} bares después…`, clase: 'oscura' });
    await ctx.mundo.sellarResto(PROTA);
    await d.recargar('Credencial de');
    await d.esperar(2200);
    await d.quitarTarjeta(800);
    await d.paso('¡Ruta completa! Ya estás <b>dentro del sorteo</b>.', { pausa: 600 });
    await d.tocar('Información del sorteo', { despues: 2600 });
    await d.tocar(d.app.getByText('Entendido', { exact: true }), { despues: 600 });
    await d.paso('Y te llevas la <b>medalla</b>: tócala para ver tu diploma.', { pausa: 600 });
    await d.tocar(d.app.getByLabel('Medalla: ruta completa. Toca para ver tu diploma'), { despues: 3000 });
    await terminar(d, cierre('La ubicación solo se pide al sellar, nunca para el mapa.', 'Casas'), 3000);
  },
};

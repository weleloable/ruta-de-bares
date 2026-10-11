import { PARADA_EN_VIVO, PARADAS, PROTA } from '../reparto.mjs';
import { abrir, cierre, empezar, entrarDeprisa, portada, terminar } from './comun.mjs';

/** A ~250 m al norte del bar: "te faltan X m". */
const lejos = (bar) => ({ latitude: bar.lat + 0.0023, longitude: bar.lng + 0.0004 });
/** En la puerta. */
const cerca = (bar) => ({ latitude: bar.lat + 0.00008, longitude: bar.lng });

export default {
  id: 'sellos',
  fichero: '04-ruta-y-sellos',
  titulo: 'Ruta y sellos',
  posicionInicial: (datos) => lejos(datos.bares[PARADA_EN_VIVO]),
  async preparar(d, ctx) {
    await entrarDeprisa(d, ctx, PROTA);
    await abrir(d, ctx, '/ruta', 'Ver toda la ruta');
    await d.esperar(2500); // teselas del mapa
  },
  async grabar(d, ctx) {
    const bar = ctx.bares[PARADA_EN_VIVO];
    await empezar(d, {
      seccion: 'Ruta y sellos',
      pasos: 13,
      tarjeta: portada('Ruta y sellos', 'Tu credencial de bares', 'Un sello por cada bar de la ruta. Así se consigue.', [
        'Ver la ruta en el mapa',
        'Sellar un bar al llegar',
        'Completarla y ganar la medalla',
      ]),
    });
    await d.paso('En <b>Ruta</b> tienes todos los bares en el mapa, numerados en orden.', { pausa: 3400 });
    await d.paso('Abajo, las paradas con su horario. Toca una para verla en el mapa.', { pausa: 1500 });
    await d.tocar(d.app.getByText('El Hidalgo', { exact: true }), { despues: 2200 });
    await d.tocar('Ver toda la ruta', { despues: 2000 });
    await d.paso('Arriba, el Instagram de la ruta y su grupo de Telegram (<b>Social</b>).', { pausa: 900 });
    await d.foco(d.app.getByText('@rutadebaresoficial'), 2200);

    await d.paso('Para sellar, ve a la pestaña <b>Sellos</b>.', { pausa: 900 });
    await d.tocar(d.app.getByText('Sellos', { exact: true }), { despues: 1500 });
    await d.paso('Esta es tu <b>credencial</b>: cada chapa es un bar. Llevas 3 de 8.', { pausa: 900 });
    await d.foco(d.app.getByText('Credencial de', { exact: true }), 2800);

    await d.paso(`Cuando llegues al bar, toca su chapa. Ahora toca <b>${bar.name}</b>.`, { pausa: 1200 });
    await d.tocar(d.app.getByText(bar.name, { exact: true }), { despues: 2500 });
    await d.paso('Solo sella si estás <b>dentro del bar</b> y en su <b>horario</b>. Aquí aún estás lejos.', { pausa: 900 });
    await d.foco(d.app.getByText(/Estas a \d+ m/), 3200);

    await ctx.contexto.setGeolocation(cerca(bar));
    await d.paso('Ya en la puerta, toca <b>Volver a medir mi posición</b>.', { pausa: 1200 });
    await d.tocar('Volver a medir mi posicion', { despues: 2200 });
    await d.paso('¡Estás dentro! Pulsa <b>Sellar este bar</b>.', { pausa: 1200 });
    await d.tocar('Sellar este bar', { despues: 4200 });
    await d.paso('¡Sellado! La chapa se queda con la hora en que llegaste.', { pausa: 3000 });
    const cerrar = d.app.getByText('Cerrar', { exact: true });
    if (await d.seVe(cerrar)) await d.tocar(cerrar, { despues: 1500 });

    await d.paso('Los bares que aún no han abierto te dicen <b>cuándo abren</b>.', { pausa: 1000 });
    await d.tocar(d.app.getByText(PARADAS[PARADA_EN_VIVO + 1], { exact: true }), { despues: 1200 });
    await d.foco(d.app.getByText(/Todavia no abre/), 2800);
    await d.tocar(d.app.getByText('Cerrar', { exact: true }), { despues: 1000 });

    await d.tarjeta({ logo: false, sobre: 'Ruta y sellos', titulo: 'Unas horas y cuatro bares después…', clase: 'oscura' });
    await ctx.mundo.sellarResto(PROTA);
    await d.recargar('Credencial de');
    await d.esperar(2600);
    await d.quitarTarjeta(900);
    await d.paso('¡Credencial completa! Aparece la <b>medalla</b>. Tócala.', { pausa: 1500 });
    await d.tocar(d.app.getByLabel('Medalla: ruta completa. Toca para ver tu diploma'), { despues: 2500 });
    await d.paso('Tu <b>diploma</b>, con el recorrido. Puedes guardarlo o compartirlo.', { pausa: 4200 });
    await terminar(d, cierre('Recuerda: la ubicación solo se pide al sellar, nunca para el mapa.', 'La Caña'));
  },
};

import { PROTA } from '../reparto.mjs';
import { cierre, empezar, entrarDeprisa, pestana, portada, terminar } from './comun.mjs';

/**
 * Casas: cual te toca, la clasificacion en directo y TODAS las formas de
 * sumar puntos (la hoja del boton (i), que dice los valores reales), y donde
 * se hace cada cosa: la consumicion en el bar sellado y el QR en Mi perfil.
 * Los puntos de los demas los sembro semilla.mjs por las funciones reales.
 */
export default {
  id: 'casas',
  fichero: '05-casas',
  titulo: 'Casas',
  async preparar(d, ctx) {
    // Se graba con la presentacion "Tu casa es…" en pantalla: es el arranque del video.
    await entrarDeprisa(d, ctx, PROTA);
    await d.buscar('¡Vamos!', 20000);
    await d.esperar(1500);
  },
  async grabar(d, ctx) {
    await empezar(d, {
      seccion: 'Casas',
      pasos: 10,
      ms: 3200,
      tarjeta: portada('Casas', 'Tu casa y sus puntos', 'Cuatro casas compiten en cada ruta. Todo lo que haces suma para la tuya.', [
        'Qué casa te toca',
        'Cómo va la clasificación',
        'Todas las formas de ganar puntos',
      ]),
    });
    await d.paso('Al entrar en una ruta te toca una casa: <b>Mahou</b>, <b>Cruzcampo</b>, <b>Estrella Galicia</b> o <b>Alhambra</b>.', { pausa: 3400 });
    await d.tocar(d.app.getByText('¡Vamos!', { exact: true }), { despues: 1000 });

    await d.paso('En la pestaña <b>Casas</b> ves la clasificación de la ruta, en directo.', { pausa: 700 });
    await d.tocar(pestana(d, 'Casas'), { despues: 1400 });
    await d.foco(d.app.getByText('Clasificación', { exact: true }).locator('xpath=../../..'), 2400);

    await d.paso('La <b>ⓘ</b> explica <b>cómo se ganan puntos</b>.', { pausa: 600 });
    await d.tocar(d.app.getByLabel('Cómo se ganan puntos', { exact: true }), { despues: 1200 });
    await d.paso('<b>Sellar un bar</b> (+10) y <b>completar la ruta</b> (+20).', { pausa: 2600 });
    await d.paso('<b>Apuntar lo que tomas</b> (+2) y <b>probar bebidas distintas</b> (+5). Sin alcohol puntúa igual.', { pausa: 900 });
    await d.deslizar(330, { y: 520 });
    await d.esperar(1600);
    await d.paso('Quedar en el <b>podio de un minijuego</b> (10, 7 o 5) y las <b>rachas</b> de tu casa en un bar (+6).', { pausa: 900 });
    await d.deslizar(330, { y: 520 });
    await d.esperar(1600);
    await d.paso('Los <b>encuentros por QR</b> con gente de tu casa (+5) y los <b>retos</b> de la ruta.', { pausa: 900 });
    await d.deslizar(500, { y: 520 });
    await d.esperar(1600);
    await d.tocar(d.app.getByText('Entendido', { exact: true }), { despues: 800 });

    await d.paso('Los <b>retos</b> de esta ruta, con sus puntos y cuáles llevas.', { pausa: 600 });
    await d.tocar(d.app.getByLabel(/^Retos de la ruta/), { despues: 2600 });
    await d.tocar(d.app.getByText('Cerrar', { exact: true }), { despues: 700 });

    await d.paso('La consumición se apunta en el <b>bar que acabas de sellar</b>.', { pausa: 600 });
    await d.tocar(pestana(d, 'Sellos'), { despues: 1200 });
    const ultimo = ctx.bares[2].name; // el ultimo que Marta tiene sellado al empezar (SELLADAS_POR_PROTA = 3)
    await d.tocar(d.app.getByText(ultimo, { exact: true }), { despues: 1200 });
    await d.tocar('Añadir consumición', { despues: 1200 });
    await d.tocar('Sin alcohol', { despues: 2200 });
    await d.tocar(d.app.getByText('Cerrar', { exact: true }), { despues: 600 });

    await d.paso('Y tu <b>QR</b>, en <b>Mi perfil</b>: que lo escanee alguien de tu casa.', { pausa: 600 });
    await d.tocar(d.app.getByLabel('Mi perfil', { exact: true }), { despues: 1500 });
    await d.tocar('Mi QR', { despues: 2600 });
    await terminar(d, cierre('Bebe con cabeza: ningún punto premia beber más ni más rápido.', 'La Caña'), 3000);
  },
};

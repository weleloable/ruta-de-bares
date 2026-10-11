import { PROTA } from '../reparto.mjs';
import { cierre, empezar, entrarDeprisa, portada, terminar } from './comun.mjs';

/** Grados que marca el termometro de la app ("64 °C"), o null. */
async function temperatura(d) {
  // Linea sola: "Zona: 63–68 °C" tambien acaba en °C y no es la temperatura.
  const m = /^(\d+) °C$/m.exec(await d.textoApp());
  return m ? Number(m[1]) : null;
}

/** Espera a que el texto de la app case con `re` (o se acabe el tiempo). */
async function hasta(d, re, limite = 40000) {
  const fin = Date.now() + limite;
  while (Date.now() < fin) {
    if (re.test(await d.textoApp())) return true;
    await d.esperar(150);
  }
  throw new Error(`No llego: ${re}`);
}

/**
 * Tira la caña como se debe: vaso inclinado ~45 grados (poca espuma) y recto
 * al final para la corona. Con el caudal de modelo.ts (0,22 por segundo) son
 * ~3,7 s inclinado y ~0,75 s recto: ~20 % de espuma y el vaso al borde.
 */
export async function tirarCana(d) {
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

export default {
  id: 'juegos',
  fichero: '06-juegos',
  titulo: 'Juegos',
  async preparar(d, ctx) {
    await entrarDeprisa(d, ctx, PROTA);
    await d.inclinar(0, { dibujo: false });
  },
  async grabar(d) {
    await empezar(d, {
      seccion: 'Juegos',
      pasos: 17,
      tarjeta: portada('Juegos', 'Para el rato entre bar y bar', 'Dos juegos, con ranking solo entre la gente de tu ruta.', [
        'La Caña Perfecta',
        'Maestro Cervecero',
        'Ranking y cervezas de la ruta',
      ]),
    });
    await d.paso('Los juegos están en la pestaña <b>Juegos</b>. Solo aparece dentro de una ruta.', { pausa: 900 });
    await d.tocar(d.app.getByText('Juegos', { exact: true }), { despues: 1800 });
    await d.paso('Empecemos por <b>La Caña Perfecta</b>.', { pausa: 900 });
    await d.tocar('La Caña Perfecta', { despues: 1600 });
    await d.paso('Objetivo: llenar el vaso hasta arriba con <b>dos dedos de espuma</b>. Pulsa <b>Empezar</b>.', { pausa: 1500 });
    await d.tocar('Empezar', { despues: 1200 });
    await d.paso('<b>Inclina el móvil</b> y el vaso se inclina con él: así sale menos espuma.', { pausa: 600 });
    await d.inclinar(45);
    await d.esperar(2400);
    await d.inclinar(0);
    await d.esperar(900);
    await d.paso('<b>Mantén pulsado</b> para servir y endereza el móvil al final para la corona.', { pausa: 600 });
    await tirarCana(d);
    await d.paso('Cuando esté lleno, pulsa <b>Entregar</b>.', { pausa: 900 });
    await d.tocar('Entregar', { despues: 2200 });
    await d.paso('¡Tu nota! Se guarda tu mejor marca en el ranking de la ruta.', { pausa: 2800 });
    await d.tocar('Ver ranking', { despues: 2400 });
    await d.paso('El <b>ranking</b> es solo de tu ruta. ¿Le ganas a Sergio?', { pausa: 3200 });
    await d.tocar(d.app.getByLabel('Volver', { exact: true }), { despues: 1500 }).catch(async () => {
      await d.tocar('Salir', { despues: 1500 });
    });
    if (!(await d.seVe('Maestro Cervecero'))) await d.tocar(d.app.getByText('Juegos', { exact: true }), { despues: 1500 });

    await d.paso('Ahora, <b>Maestro Cervecero</b>: fabrica tu cerveza en cuatro pasos.', { pausa: 900 });
    await d.tocar('Maestro Cervecero', { despues: 1800 });
    await d.paso('<b>1. La malta</b>: elige una. Cuanto más tostada, más oscura la cerveza.', { pausa: 900 });
    await d.tocar('Tostada', { despues: 900 });
    await d.tocar('Siguiente', { despues: 1200 });
    // Sin esto, la pantalla del dato curioso salia con el subtitulo de la malta.
    await d.paso('Entre paso y paso sale un <b>dato curioso</b> sobre la cerveza. Pulsa <b>Seguir</b>.', { pausa: 2400 });
    await d.tocar('Seguir', { despues: 1400 });

    await d.paso('<b>2. Maceración</b>: toca <b>Calentar</b> para mantener la olla en la zona buena (63-68 °C).', { pausa: 600 });
    const calentar = await d.toquesRapidos(d.app.getByLabel(/^Calentar$/));
    const finMac = Date.now() + 40000;
    while (Date.now() < finMac) {
      const texto = await d.textoApp();
      if (/Maceración terminada/i.test(texto)) break;
      const t = await temperatura(d);
      if (t !== null && t < 65) await calentar();
      await d.esperar(t !== null && t < 62 ? 120 : 260);
    }
    await d.sinDedo();
    await d.esperar(1200);
    await d.tocar('Siguiente', { despues: 1500 });
    await d.tocar('Seguir', { despues: 1400 });

    await d.paso('<b>3. Lúpulo</b>: échalo en los dos momentos marcados. Pronto da amargor, al final aroma.', { pausa: 900 });
    await d.tocar(d.app.getByRole('button', { name: /Empezar el hervido/ }), { despues: 0, antes: 100 });
    const t0 = Date.now();
    const echar = await d.toquesRapidos(d.app.getByLabel(/Echar lúpulo/));
    await d.esperar(Math.max(0, 2000 - (Date.now() - t0)));
    await echar();
    await d.esperar(Math.max(0, 8000 - (Date.now() - t0)));
    await echar();
    await d.sinDedo();
    await hasta(d, /Hervido terminado/i);
    await d.esperar(1200);
    await d.tocar('Siguiente', { despues: 1500 });
    await d.tocar('Seguir', { despues: 1400 });

    await d.paso('<b>4. Enfriar y sembrar</b>: elige levadura. La <b>Ale</b> se echa entre 18 y 22 °C.', { pausa: 900 });
    await d.tocar(d.app.getByRole('button', { name: /^Ale/ }), { despues: 900 });
    await d.paso('Mantén el <b>grifo</b> para enfriar… y suelta antes: sigue enfriando un poco.', { pausa: 600 });
    const soltarGrifo = await d.apretar(d.app.getByLabel(/^Enfriar$/));
    await hasta(d, /¡Suelta!/);
    await soltarGrifo();
    const finFrio = Date.now() + 30000;
    while (Date.now() < finFrio) {
      const t = await temperatura(d);
      if (t !== null && t <= 21) break;
      await d.esperar(100);
    }
    await d.tocar(d.app.getByRole('button', { name: /Echar levadura/ }), { antes: 0, despues: 1500 });
    await d.tocar('Ver mi cerveza', { despues: 1600 });
    await d.tocar('Seguir', { despues: 2200 });
    await d.paso('¡Tu cerveza! Con su estilo y su nota. Se guarda con las de la ruta.', { pausa: 3600 });
    if (await d.seVe('Terminar')) await d.tocar('Terminar', { despues: 2000 });
    if (await d.seVe('Ver cervezas de la ruta')) {
      await d.tocar('Ver cervezas de la ruta', { despues: 2400 });
      await d.paso('Aquí están todas las cervezas que ha hecho la gente de tu ruta.', { pausa: 3200 });
    }
    await terminar(d, cierre('Juega cuando quieras: tu mejor nota es la que cuenta.', ''));
  },
};

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { svgAvatar } from '../avatares.mjs';
import { TRABAJO } from '../entorno.mjs';
import { GENTE, PROTA } from '../reparto.mjs';
import { cierre, empezar, entrarDeprisa, portada, terminar } from './comun.mjs';

const FOTO = join(TRABAJO, 'foto-nueva-marta.jpg');

export default {
  id: 'perfil',
  fichero: '03-mi-perfil',
  titulo: 'Mi perfil',
  async preparar(d, ctx) {
    // La foto "de la galeria": la misma Marta con gafas y otro fondo, para que se note el cambio.
    // ctx.rasterizar y no una pestana de ctx.contexto: esa deformaba la grabacion.
    const g = GENTE.find((x) => x.nombre === PROTA);
    writeFileSync(FOTO, await ctx.rasterizar(svgAvatar({ ...g.avatar, fondo: 5, gafas: true }), 512));
    await entrarDeprisa(d, ctx, PROTA);
  },
  async grabar(d) {
    await empezar(d, {
      seccion: 'Mi perfil',
      pasos: 10,
      tarjeta: portada('Mi perfil', 'Tu foto, tu nombre y tu cuenta', 'Todo lo tuyo está en un solo sitio.', [
        'Cambiar la foto y el nombre',
        'Ver tus datos y escribir a la organización',
        'Cerrar sesión o borrar la cuenta',
      ]),
    });
    await d.paso('Mi perfil se abre tocando <b>tu foto</b>, arriba a la derecha.', { pausa: 1200 });
    await d.tocar(d.app.getByLabel('Mi perfil', { exact: true }), { despues: 2000 });

    await d.paso('Para cambiar la foto, toca <b>Cambiar foto</b> y elige una de tu galería.', { pausa: 1200 });
    const elegir = d.pagina.waitForEvent('filechooser', { timeout: 20000 });
    await d.tocar('Cambiar foto', { despues: 300 });
    await (await elegir).setFiles(FOTO);
    await d.buscar(/revisi/i, 30000);
    await d.esperar(800);
    await d.paso('La foto nueva la <b>revisa la organización</b> antes de que la vea nadie. Mientras, sigue la anterior.', { pausa: 900 });
    await d.foco(d.app.getByText(/revisi/i), 3200);

    await d.paso('Tu <b>nombre de bartalla</b> es como te ven en la ruta. Cámbialo aquí.', { pausa: 900 });
    const campo = d.app.locator(`input[value="${PROTA}"]`);
    await d.tocar(campo, { despues: 300 });
    await d.pagina.keyboard.press('End');
    await d.pagina.keyboard.type('Cañera', { delay: 110 });
    await d.esperar(500);
    await d.tocar('Guardar nombre', { despues: 2200 });
    await d.paso('Sin espacios y que no lo tenga nadie más en la app.', { pausa: 2600 });

    await d.paso('En <b>Política de privacidad y datos</b> ves qué se guarda y puedes descargarlo.', { pausa: 1200 });
    await d.tocar('Política de privacidad y datos', { despues: 2200 });
    await d.deslizar(1400);
    await d.esperar(1200);
    await d.tocar(d.app.getByText('Volver', { exact: true }), { despues: 1800 }).catch(async () => {
      await d.app.evaluate(() => history.back());
      await d.esperar(1500);
    });

    await d.paso('¿Una duda o un problema? <b>Escribir a la organización</b>.', { pausa: 1200 });
    await d.tocar('Escribir a la organización', { despues: 2000 });
    await d.escribir(d.app.getByRole('textbox'), '¿A qué hora cierra el último bar?', { retraso: 55 });
    await d.tocar('Enviar', { despues: 2200 });
    await d.paso('Te responderán en tus avisos: verás un punto rojo en tu foto.', { pausa: 2600 });
    await d.app.evaluate(() => history.back());
    await d.esperar(1800);

    await d.deslizar(1600);
    await d.paso('Abajo del todo: <b>Cerrar sesión</b>…', { pausa: 900 });
    await d.foco('Cerrar sesion', 2200);
    await d.paso('…y <b>Borrar Cuenta</b>, que se lleva todos tus datos. Siempre te pide confirmar.', { pausa: 900 });
    await d.foco('Borrar Cuenta', 2800);
    await terminar(d, cierre('El punto rojo en tu foto avisa de novedades: entra a mirarlas.', 'Ruta y sellos'));
  },
};

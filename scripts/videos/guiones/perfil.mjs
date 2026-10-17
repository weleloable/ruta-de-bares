import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { svgAvatar } from '../avatares.mjs';
import { TRABAJO } from '../entorno.mjs';
import { GENTE, PROTA } from '../reparto.mjs';
import { cierre, empezar, entrarDeprisa, portada, quitarCasaNueva, terminar } from './comun.mjs';

const FOTO = join(TRABAJO, 'foto-nueva-marta.jpg');

/** Mi perfil en un minuto: foto (con su revision), casa y QR, nombre, cuenta, salir. */
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
    await quitarCasaNueva(d);
  },
  async grabar(d, ctx) {
    await empezar(d, {
      seccion: 'Mi perfil',
      pasos: 8,
      ms: 3200,
      tarjeta: portada('Mi perfil', 'Tu foto, tu casa y tu cuenta', 'Todo lo tuyo, en un solo sitio.', [
        'Foto y nombre',
        'Tu casa y tu QR',
        'Tus datos, avisos y cerrar sesión',
      ]),
    });

    await d.paso('Mi perfil se abre tocando <b>tu foto</b>, arriba a la derecha.', { pausa: 700 });
    await d.tocar(d.app.getByLabel('Mi perfil', { exact: true }), { despues: 1600 });

    // La foto: se manda, la revisa la organizacion y se ve la nueva.
    await d.paso('<b>Cambiar foto</b>: eliges una y la <b>revisa la organización</b> antes de que la vea nadie.', { pausa: 700 });
    const elegir = d.pagina.waitForEvent('filechooser', { timeout: 20000 });
    await d.tocar('Cambiar foto', { despues: 300 });
    await (await elegir).setFiles(FOTO);
    await d.buscar(/revisi/i, 30000);
    await d.esperar(1800);
    await d.sinDedo();
    await d.tarjeta({ logo: false, clase: 'oscura', sobre: 'Mi perfil', titulo: 'Un rato después, la aprueban…' });
    await ctx.mundo.aprobarFoto(PROTA);
    await d.recargar('Cambiar foto');
    await d.esperar(1500);
    await d.quitarTarjeta(700);
    await d.paso('…y ya es tu foto en toda la app.', { pausa: 2000 });

    // Casa y QR.
    await d.paso('Debajo, <b>tu casa</b> y tus <b>encuentros por QR</b> con gente de tu casa.', { pausa: 700 });
    await d.foco(d.app.getByText('Encuentros de casa', { exact: true }).locator('xpath=..'), 2000);
    await d.tocar('Mi QR', { despues: 2400 });
    await d.tocar(d.app.getByText('Cerrar', { exact: true }), { despues: 600 });

    // Nombre.
    await d.paso('Tu <b>nombre de bartalla</b>: escríbelo y <b>Guardar nombre</b>. Sin espacios.', { pausa: 500 });
    const campo = d.app.locator(`input[value="${PROTA}"]`);
    await d.tocar(campo, { despues: 200 });
    await d.pagina.keyboard.press('End');
    await d.pagina.keyboard.type('Cañera', { delay: 100 });
    await d.tocar('Guardar nombre', { despues: 1400 });

    // Avisos en el movil (0064).
    await d.paso('<b>Avisos en el móvil</b>: actívalos y te avisa antes de cada parada, del sorteo y de La Caña.', { pausa: 600 });
    await d.foco(d.app.getByText('Avisos en el móvil', { exact: true }).locator('xpath=..'), 3000);

    // Cuenta.
    await d.paso('En <b>Tu cuenta</b>: tus avisos, la privacidad y tus datos, y escribir a la organización.', { pausa: 600 });
    await d.foco(d.app.getByText('Tu cuenta', { exact: true }).locator('xpath=..'), 3000);

    await d.deslizar(1600);
    await d.paso('Abajo, <b>Cerrar sesión</b> y <b>Borrar Cuenta</b>. Los dos piden confirmación.', { pausa: 600 });
    await d.tocar('Cerrar sesion', { despues: 2200 });
    await d.tocar(d.app.getByText('Cancelar', { exact: true }), { despues: 600 });
    await d.foco('Borrar Cuenta', 2200);
    await terminar(d, cierre('El punto rojo en tu foto avisa de novedades: entra a mirarlas.', 'Ruta y sellos'), 3000);
  },
};

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { svgAvatar } from '../avatares.mjs';
import { TRABAJO } from '../entorno.mjs';
import { GENTE, PROTA } from '../reparto.mjs';
import { cierre, empezar, entrarDeprisa, portada, terminar } from './comun.mjs';

const FOTO = join(TRABAJO, 'foto-nueva-marta.jpg');

/** Vuelve a la pantalla anterior como el boton de atras del movil (sin dedo: no hay boton que senalar). */
async function atras(d, texto) {
  await d.sinDedo();
  await d.app.evaluate(() => history.back());
  if (texto) await d.buscar(texto, 20000);
  await d.esperar(1200);
}

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
  async grabar(d, ctx) {
    await empezar(d, {
      seccion: 'Mi perfil',
      pasos: 14,
      tarjeta: portada('Mi perfil', 'Tu foto, tu nombre y tu cuenta', 'Todo lo tuyo está en un solo sitio.', [
        'Cambiar la foto y el nombre',
        'Tus avisos, tus datos y escribir a la organización',
        'Cerrar sesión o borrar la cuenta',
      ]),
    });

    // 1. Entrar.
    await d.paso('Para abrir Mi perfil, toca <b>tu foto</b>, arriba a la derecha. Está en todas las pestañas.', { pausa: 1500 });
    await d.tocar(d.app.getByLabel('Mi perfil', { exact: true }), { despues: 2200 });
    await d.paso('Arriba ves tu foto, tu <b>nombre</b> y el <b>correo</b> con el que entras.', { pausa: 900 });
    await d.foco(d.app.getByText('marta@demo.test', { exact: true }).locator('xpath=../..'), 3000);

    // 2. La foto, de principio a fin: enviar, revision, aprobada.
    await d.paso('Para cambiar la foto, toca <b>Cambiar foto</b> y elige una de tu galería.', { pausa: 1500 });
    const elegir = d.pagina.waitForEvent('filechooser', { timeout: 20000 });
    await d.tocar('Cambiar foto', { despues: 300 });
    await (await elegir).setFiles(FOTO);
    await d.buscar(/revisi/i, 30000);
    await d.esperar(700);
    await d.paso('Antes de que la vea nadie, la <b>revisa la organización</b>. Mientras, se sigue viendo la anterior.', { pausa: 900 });
    await d.foco(d.app.getByText(/Tu foto nueva está en revisión/), 3600);
    await d.sinDedo();
    await d.tarjeta({ logo: false, clase: 'oscura', sobre: 'Mi perfil', titulo: 'Un rato después, la organización la aprueba…' });
    await ctx.mundo.aprobarFoto(PROTA);
    await d.recargar('Cambiar foto');
    await d.esperar(2500);
    await d.quitarTarjeta(900);
    await d.paso('…y ya es tu foto en toda la app. Si la rechazan, aquí verás el motivo.', { pausa: 3800 });

    // 3. El nombre.
    await d.paso('Tu <b>nombre de bartalla</b> es como te ve la gente de la ruta. Escribe el nuevo…', { pausa: 900 });
    const campo = d.app.locator(`input[value="${PROTA}"]`);
    await d.tocar(campo, { despues: 300 });
    await d.pagina.keyboard.press('End');
    await d.pagina.keyboard.type('Cañera', { delay: 120 });
    await d.esperar(600);
    await d.paso('…y pulsa <b>Guardar nombre</b>. Sin espacios, y que no lo tenga nadie más.', { pausa: 900 });
    await d.tocar('Guardar nombre', { despues: 1500 });
    await d.foco('Nombre actualizado.', 2600);

    // 4. Avisos.
    await d.paso('En <b>Decisiones sobre tu cuenta</b> verías si la organización ha tomado alguna medida, y por qué.', { pausa: 1200 });
    await d.tocar('Decisiones sobre tu cuenta', { despues: 2400 });
    await d.esperar(1600);
    await atras(d, 'Decisiones sobre tu cuenta');

    // 5. Privacidad y datos.
    await d.paso('En <b>Política de privacidad y datos</b> se explica qué se guarda, para qué y quién lo ve.', { pausa: 1200 });
    await d.tocar('Política de privacidad y datos', { despues: 2400 });
    await d.deslizar(700, { pasos: 14 });
    await d.esperar(1200);
    await d.paso('Al final, en <b>Ver lo que guardamos</b>, puedes ver y copiar todos tus datos.', { pausa: 600 });
    await (await d.buscar('Ver mis datos')).evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await d.esperar(1800);
    await d.tocar('Ver mis datos', { despues: 2600 });
    await d.foco('Copiar todo', 2600);
    await atras(d, 'Política de privacidad y datos');

    // 6. Contacto.
    await d.paso('¿Una duda o un problema? <b>Escribir a la organización</b>.', { pausa: 1200 });
    await d.tocar('Escribir a la organización', { despues: 2000 });
    await d.escribir(d.app.getByRole('textbox'), '¿A qué hora cierra el último bar?', { retraso: 60 });
    await d.tocar('Enviar', { despues: 1800 });
    await d.paso('Tu mensaje queda aquí. La respuesta te llega a tus avisos y verás un <b>punto rojo</b> en tu foto.', { pausa: 3800 });
    await atras(d, 'Escribir a la organización');

    // 7. Salir y borrar, ensenando el dialogo de cada uno (y cancelando).
    await d.deslizar(1600);
    await d.paso('Abajo del todo, <b>Cerrar sesión</b>. Siempre pide confirmación…', { pausa: 1000 });
    await d.tocar('Cerrar sesion', { despues: 2600 });
    await d.tocar(d.app.getByText('Cancelar', { exact: true }), { despues: 1200 });
    await d.paso('…y <b>Borrar Cuenta</b>, que se lleva todos tus datos. También pide confirmar.', { pausa: 1000 });
    await d.tocar('Borrar Cuenta', { despues: 3200 });
    await d.tocar(d.app.getByText('Cancelar', { exact: true }), { despues: 1200 });
    await terminar(d, cierre('El punto rojo en tu foto avisa de novedades: entra a mirarlas.', 'Ruta y sellos'));
  },
};

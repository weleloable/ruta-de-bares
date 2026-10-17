import { CLAVE_DEMO, NUEVA } from '../reparto.mjs';
import { abrir, cierre, empezar, portada, terminar } from './comun.mjs';

/**
 * Dos partes, en el orden en que le pasan a alguien nuevo:
 *  1. Crear la cuenta, con las dos formas que hay (correo o Google).
 *  2. Unirse a una ruta con el enlace de invitacion, ya con sesion.
 * Pablo no existe antes de grabar; el alta y el canje son reales contra el
 * Supabase local.
 */
export default {
  id: 'registro',
  fichero: '01-crear-cuenta-y-unirse',
  titulo: 'Crear cuenta y unirse a una ruta',
  async preparar(d, ctx) {
    await abrir(d, ctx, '/login', 'Entrar');
  },
  async grabar(d, ctx) {
    await empezar(d, {
      seccion: 'Cuenta y ruta',
      pasos: 12,
      tarjeta: portada('Crear cuenta', 'Crea tu cuenta y únete a una ruta', 'Dos pasos: primero la cuenta, después la invitación.', [
        'Crear la cuenta: con correo o con Google',
        'Unirte a una ruta con tu invitación',
        'Instalar la app en el móvil',
      ]),
    });

    // Parte 1: crear la cuenta.
    await d.tarjeta({ logo: false, sobre: 'Parte 1', titulo: 'Crear la cuenta', texto: 'Hay dos formas: con tu correo o con tu cuenta de Google.' }, 3400);
    await d.quitarTarjeta(700);
    await d.paso('Abre la app. En la portada, pulsa <b>Crear cuenta</b>.', { pausa: 1300 });
    await d.tocar(d.app.getByText('Crear cuenta', { exact: true }), { despues: 1800 });

    await d.paso('<b>Forma 1, con tu correo.</b> Pon el nombre con el que te verá la gente de la ruta.', { pausa: 1100 });
    await d.escribir(d.app.getByPlaceholder('Tu nombre'), NUEVA.nombre, { retraso: 110 });
    await d.paso('Tu <b>correo</b>…', { pausa: 700 });
    await d.escribir(d.app.getByPlaceholder('tu@correo.com'), NUEVA.correo);
    await d.paso('…y una <b>contraseña</b> de al menos 8 caracteres, dos veces.', { pausa: 900 });
    const claves = d.app.locator('input[type="password"]');
    await d.escribir({ loc: claves, n: 0 }, CLAVE_DEMO, { retraso: 55 });
    await d.escribir({ loc: claves, n: 1 }, CLAVE_DEMO, { retraso: 55 });

    await d.paso('<b>Forma 2, con Google.</b> Un toque aquí y entras con tu cuenta de Google, sin otra contraseña.', { pausa: 700 });
    await d.foco('Continuar con Google', 3200);

    await d.paso('Seguimos con el correo: pulsa <b>Crear cuenta</b>.', { pausa: 1000 });
    await d.tocar(d.app.getByText('Crear cuenta', { exact: true }).last(), { despues: 1200 });
    await d.buscar('Todavia no hay ruta', 30000);
    await d.esperar(800);
    await d.paso('¡Cuenta creada! Pero todavía no ves ninguna ruta: para eso hace falta una <b>invitación</b>.', { pausa: 900 });
    await d.foco(d.app.getByText('Todavia no hay ruta', { exact: true }).locator('xpath=..'), 3600);

    // Parte 2: unirse con el enlace.
    await d.tarjeta({
      logo: false,
      sobre: 'Parte 2',
      titulo: 'Unirse a una ruta',
      texto: 'Quien organiza te pasa un enlace por WhatsApp o Telegram:<br><b style="color:#9A5A11">weleloable.github.io/ruta-de-bares/invitacion?token=…</b>',
    });
    await d.esperar(2500);
    await abrir(d, ctx, `/invitacion?token=${ctx.token}`, 'Enlace reconocido. Confirma para entrar en la ruta.');
    await d.esperar(2000);
    await d.quitarTarjeta(700);
    await d.paso('Toca el enlace y se abre la app con la invitación ya puesta.', { pausa: 2800 });
    await d.paso('¿Te han pasado solo el código? Pégalo en esta misma casilla.', { pausa: 700 });
    await d.foco(d.app.locator('input'), 2800);
    await d.paso('Pulsa <b>Entrar en la ruta</b>.', { pausa: 1000 });
    await d.tocar(d.app.getByText('Entrar en la ruta', { exact: true }).last(), { despues: 1000 });
    await d.buscar('Ya estas dentro', 30000);
    await d.esperar(600);
    await d.paso('¡Ya estás dentro de la ruta!', { pausa: 2000 });
    await d.tocar('Ver mis sellos', { despues: 2000 });
    await d.paso('Estos son tus sellos: una chapa por bar, lista para sellar cuando llegues.', { pausa: 3400 });

    await d.sinDedo();
    await d.tarjeta({
      logo: false,
      sobre: 'Consejo',
      titulo: 'Instálala en el móvil',
      texto: 'Sin tienda ni descargas raras:',
      lista: [
        '<b>Android</b> (Chrome): menú ⋮ → <b>Instalar aplicación</b>',
        '<b>iPhone</b> (Safari): Compartir → <b>Añadir a pantalla de inicio</b>',
      ],
    }, 6500);
    await terminar(d, cierre('Si ya tenías cuenta, en la invitación pulsa «Ya tengo cuenta» y entra.', 'Iniciar sesión'));
  },
};

import { CLAVE_DEMO, NUEVA } from '../reparto.mjs';
import { abrir, cierre, empezar, portada, terminar } from './comun.mjs';

/**
 * Crear cuenta como pasa de verdad: llega el enlace de invitacion por el
 * grupo, se abre sin cuenta, se crea y la app te mete en la ruta sola.
 * Pablo no existe antes de grabar; el alta es real contra el Supabase local.
 */
export default {
  id: 'registro',
  fichero: '01-crear-cuenta',
  titulo: 'Crear cuenta',
  // Sin preparar: el movil empieza en blanco (papel) y la app se abre con el
  // enlace, detras de la tarjeta. Cargar antes el login hacia que se viera un
  // instante una pantalla que en este video no pinta nada.
  async grabar(d, ctx) {
    await empezar(d, {
      seccion: 'Crear cuenta',
      pasos: 9,
      tarjeta: portada('Crear cuenta', 'Entra en tu primera ruta', 'Solo se entra con invitación. Te la pasa quien organiza.', [
        'Abrir el enlace de invitación',
        'Crear tu cuenta',
        'Instalar la app en el móvil',
      ]),
    });
    await d.tarjeta({
      logo: false,
      sobre: 'Paso 1',
      titulo: 'Te llega un enlace',
      texto: 'Por WhatsApp o Telegram:<br><b style="color:#9A5A11">weleloable.github.io/ruta-de-bares/invitacion?token=…</b><br>Tócalo y se abre la app en el navegador.',
    }, 4600);
    await abrir(d, ctx, `/invitacion?token=${ctx.token}`, 'Te han invitado a una ruta');
    await d.quitarTarjeta(700);
    await d.paso('El enlace te lleva aquí. Si es tu primera vez, pulsa <b>Crear cuenta</b>.', { pausa: 1200 });
    await d.tocar('Crear cuenta', { despues: 1800 });

    await d.paso('Pon el <b>nombre</b> con el que te verá la gente de la ruta.', { pausa: 900 });
    await d.escribir(d.app.getByPlaceholder('Tu nombre'), NUEVA.nombre, { retraso: 110 });
    await d.paso('Tu <b>correo</b>…', { pausa: 700 });
    await d.escribir(d.app.getByPlaceholder('tu@correo.com'), NUEVA.correo);
    await d.paso('…y una <b>contraseña</b> de al menos 8 caracteres, dos veces.', { pausa: 900 });
    const claves = d.app.locator('input[type="password"]');
    await d.escribir(claves.nth(0), CLAVE_DEMO, { retraso: 55 });
    await d.escribir(claves.nth(1), CLAVE_DEMO, { retraso: 55 });
    await d.paso('¿Prefieres no recordar otra contraseña? <b>Continuar con Google</b> también vale.', { pausa: 600 });
    await d.foco('Continuar con Google', 2400);
    await d.paso('Pulsa <b>Crear cuenta</b>.', { pausa: 900 });
    await d.tocar(d.app.getByText('Crear cuenta', { exact: true }).last(), { despues: 1000 });

    await d.buscar('Enlace reconocido. Confirma para entrar en la ruta.', 30000);
    await d.esperar(600);
    await d.paso('La app recuerda tu invitación. Confirma con <b>Entrar en la ruta</b>.', { pausa: 1500 });
    await d.tocar(d.app.getByText('Entrar en la ruta', { exact: true }).last(), { despues: 1000 });
    await d.buscar('Ya estas dentro', 30000);
    await d.esperar(600);
    await d.paso('¡Ya estás dentro de la ruta!', { pausa: 2400 });
    if (await d.seVe('Ver mis sellos')) await d.tocar('Ver mis sellos', { despues: 2000 });
    await d.paso('Esta es tu credencial: un hueco por bar, lista para sellar.', { pausa: 3000 });

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
    await terminar(d, cierre('Si ya tenías cuenta, en la invitación pulsa «Ya tengo cuenta».', 'Iniciar sesión'));
  },
};

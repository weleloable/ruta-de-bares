import { CLAVE_DEMO, correo, PROTA } from '../reparto.mjs';
import { abrir, cierre, empezar, portada, terminar } from './comun.mjs';

export default {
  id: 'login',
  fichero: '02-iniciar-sesion',
  titulo: 'Iniciar sesión',
  async preparar(d, ctx) {
    await abrir(d, ctx, '/login', 'Entrar');
  },
  async grabar(d) {
    await empezar(d, {
      seccion: 'Iniciar sesión',
      pasos: 7,
      tarjeta: portada('Iniciar sesión', 'Entrar en tu cuenta', 'Si ya tienes cuenta, entrar son tres toques.', [
        'Con tu correo y contraseña',
        'O con tu cuenta de Google',
        'Y cómo cerrar la sesión',
      ]),
    });
    await d.paso('Abre la app. Sin sesión, empiezas en <b>esta pantalla</b>.');
    await d.paso('Escribe el <b>correo</b> con el que te registraste.', { pausa: 900 });
    await d.escribir(d.app.getByPlaceholder('tu@correo.com'), correo(PROTA));
    await d.paso('Después, tu <b>contraseña</b>.', { pausa: 900 });
    await d.escribir(d.app.getByPlaceholder('********'), CLAVE_DEMO, { retraso: 60 });
    await d.paso('¿Te registraste con Google? Entonces usa <b>Continuar con Google</b>.', { pausa: 600 });
    await d.foco('Continuar con Google', 2600);
    await d.paso('Si no, pulsa <b>Entrar</b>.', { pausa: 900 });
    await d.tocar('Entrar', { despues: 2200 });
    await d.paso('¡Dentro! La app te lleva a tu <b>credencial de sellos</b>.', { pausa: 3200 });
    await d.paso('Para salir: toca <b>tu foto</b> y, abajo del todo, <b>Cerrar sesión</b>.', { pausa: 900 });
    await d.tocar(d.app.getByLabel('Mi perfil', { exact: true }), { despues: 1800 });
    await d.deslizar(1600);
    await d.foco('Cerrar sesion', 2600);
    await terminar(d, cierre('La sesión se queda abierta: la próxima vez entras directo.', 'Mi perfil'));
  },
};

import { GENTE, PROTA } from '../reparto.mjs';
import { abrir, cierre, empezar, entrarDeprisa, portada, terminar } from './comun.mjs';

const MARTA = GENTE.find((g) => g.nombre === PROTA);

export default {
  id: 'cana',
  fichero: '05-la-cana',
  titulo: 'La Caña',
  async preparar(d, ctx) {
    await entrarDeprisa(d, ctx, PROTA);
    await abrir(d, ctx, '/cana', 'Soy mayor de edad');
  },
  async grabar(d, ctx) {
    await empezar(d, {
      seccion: 'La Caña',
      pasos: 19,
      tarjeta: portada('La Caña', 'Tómate una caña con alguien de la ruta', 'Conoce a la gente de tu ruta. Sin agobios: solo una pregunta.', [
        'Activarla y presentarte',
        'Dar Me gusta y hacer conexión',
        'Ofrecer (o aceptar) una caña',
      ]),
    });
    await d.paso('La Caña viene <b>apagada</b>: nadie te ve hasta que la activas. Se activa en cada ruta por separado.', { pausa: 3400 });
    await d.paso('Solo se puede activar <b>el día de la ruta</b> y estando a menos de <b>3 km del primer bar</b>.', { pausa: 900 });
    await d.foco(d.app.getByText(/Para activarla tienes que estar/), 3200);
    await d.paso('Para activarla, confirma que eres <b>mayor de edad</b> y pulsa <b>Presentarme</b>.', { pausa: 1200 });
    await d.tocar('Soy mayor de edad', { despues: 700 });
    await d.tocar('Presentarme', { despues: 2000 });

    await d.paso('Escribe una <b>frase</b> para presentarte (hasta 120 letras).', { pausa: 900 });
    await d.escribir(d.app.getByPlaceholder('Me apunto a la última ronda si alguien pide bravas.'), MARTA.cana.bio, { retraso: 38 });
    await d.paso('Elige hasta <b>5 etiquetas</b> que vayan contigo. Son opcionales.', { pausa: 900 });
    await d.tocar('Karaoke = planazo', { despues: 500 });
    await d.tocar('No dejo una caña a medias', { despues: 500 });
    await d.tocar('Mis plantas tienen nombre', { despues: 800 });
    await d.paso('Acepta las condiciones y pulsa <b>Activar y ver quién hay</b>.', { pausa: 900 });
    await d.tocar('He leído cómo funciona La Caña y acepto que se active', { despues: 600 });
    await d.tocar('Activar y ver quién hay', { despues: 2400 });

    // Mientras Marta se presentaba, Sergio ya la habia visto: le da Me gusta.
    await ctx.mundo.meGusta('Sergio', PROTA);
    await d.paso('Aquí sale la gente de tu ruta que también la tiene activada.', { pausa: 3000 });
    await d.paso('Cada tarjeta dice cómo estáis: le gustas, os habéis gustado o ya la has visto.', { pausa: 900 });
    await d.foco(d.app.getByText('Os habéis gustado', { exact: true }).locator('xpath=../..'), 3000);

    await d.paso('Toca a alguien para ver su ficha. Por ejemplo, a <b>Sergio</b>.', { pausa: 900 });
    await d.tocar('Sergio', { despues: 2200 });
    await d.paso('Si te apetece conocerle, dale a <b>Me gusta</b>. Nadie más ve a quién se lo das.', { pausa: 1200 });
    await d.tocar('Me gusta', { despues: 2400 });
    await d.paso('¡Él también te lo había dado! Ya sois <b>conexión</b>.', { pausa: 900 });
    await d.foco(d.app.getByText(/os habéis dado me gusta! Ya sois una conexión/), 2800);

    await d.paso('Con una conexión se abre el chat. Pulsa <b>Abrir chat</b>.', { pausa: 900 });
    await d.tocar('Abrir chat', { despues: 2000 });
    await d.paso('Solo hay una pregunta: <b>¿Te tomas una cerveza conmigo?</b> Hazla con <b>¿Una caña?</b>', { pausa: 1500 });
    await d.tocar('¿Una caña?', { despues: 2200 });
    await d.paso('Ahora le toca a él responder: <b>Sí</b>, <b>No</b> o <b>Pregúntamelo dentro de un rato</b>.', { pausa: 2600 });
    await ctx.mundo.responderCerveza('Sergio', PROTA, 'yes');
    await d.buscar(/ha dicho que sí a la cerveza/, 30000);
    await d.esperar(1200);
    await d.paso('¡Ha dicho que sí! Ahora cada uno puede mandar <b>un solo mensaje</b>: úsalo para quedar.', { pausa: 1200 });
    await d.escribir(d.app.getByPlaceholder('Estoy en la barra del fondo, camiseta roja'), 'Estoy en la barra del Astures, chaqueta roja', { retraso: 45 });
    await d.tocar(d.app.getByLabel(/Enviar/), { despues: 1400 });
    await d.paso('Como es el único, la app te pide confirmarlo. Pulsa <b>Enviar</b>.', { pausa: 1500 });
    await d.tocar(d.app.getByText('Enviar', { exact: true }), { despues: 2000 });
    await ctx.mundo.escribir('Sergio', PROTA, '¡Voy para allá! Te pido una de la casa.');
    await d.buscar('¡Voy para allá! Te pido una de la casa.', 30000);
    await d.paso('Y llega su respuesta. ¡A por esa caña!', { pausa: 3200 });

    await d.paso('Si alguien te molesta, <b>Bloquear</b> o <b>Denunciar</b> están siempre a mano.', { pausa: 900 });
    await d.foco(d.app.getByText('Denunciar', { exact: true }).locator('xpath=../..'), 2600);
    // Chat -> ficha -> lista: "Volver" hasta ver la cabecera de la pestana.
    for (let i = 0; i < 3 && !(await d.seVe('Desactivar')); i++) {
      await d.tocar(d.app.getByLabel('Volver', { exact: true }), { despues: 1300 });
    }
    await d.paso('Y puedes <b>desactivarla</b> cuando quieras: desapareces de la lista hasta que vuelvas.', { pausa: 900 });
    await d.foco('Desactivar', 2600);
    await terminar(d, cierre('Si alguien dice que no, no pasa nada: la conexión se cierra y punto.', ''));
  },
};

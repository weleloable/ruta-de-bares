/**
 * El texto de la politica de privacidad, en UN solo sitio.
 *
 * Lo pintan dos cosas: la pantalla de la app (`app/privacidad.tsx`) y la pagina
 * HTML estatica que se genera al publicar la web
 * (`scripts/generar-privacidad.ts`). La estatica existe porque Google, para
 * verificar el "Continuar con Google", exige la politica en el cuerpo de una
 * pagina HTML que responda 200, y la web es una app de una sola pagina: en
 * GitHub Pages `/privacidad` respondia 404 (lo sirve `404.html`) y el HTML no
 * llevaba ni una linea de la politica, que la pinta JavaScript. Si cada una
 * tuviera su copia del texto, acabarian diciendo cosas distintas.
 *
 * Sin imports a proposito: el script de publicacion lo carga con Node, que
 * exige la extension `.ts` en cada import, y la app no la admite.
 *
 * Lo que pide Google (support.google.com/cloud/answer/13806988) y donde esta:
 * que datos de Google se leen, para que, con quien se comparten, como se
 * protegen, cuanto se guardan y como se borran, que usos quedan prohibidos
 * (Uso Limitado) y que se avisa si cambia. Nombrar la app y a quien responde.
 */

export const NOMBRE_APP = 'Ruta de Bares';

export type Bloque = { subtitulo?: string; puntos: string[] };
export type Seccion = { titulo: string; bloques: Bloque[] };

export type DatosPolitica = {
  responsable: string;
  correo: string;
  diasConservacion: number;
};

export type Politica = {
  presentacion: string;
  secciones: Seccion[];
  /** El recuadro de descarga: en la app va con su boton; en la web, sin el. */
  verLoQueGuardamos: { titulo: string; parrafos: string[] };
};

export const URL_POLITICA_DATOS_GOOGLE = 'https://developers.google.com/terms/api-services-user-data-policy';
export const URL_CONEXIONES_GOOGLE = 'https://myaccount.google.com/connections';

export function politica({ responsable, correo, diasConservacion }: DatosPolitica): Politica {
  return {
    presentacion:
      `Esta es la política de privacidad de ${NOMBRE_APP}, la app para seguir una ruta de bares sellando ` +
      'tu compostelana en cada parada y, si quieres, conocer a otra gente de la ruta con La Caña.',

    secciones: [
      {
        titulo: 'Quién responde de tus datos',
        bloques: [
          {
            puntos: [
              `${responsable}, que desarrolla y lleva ${NOMBRE_APP}.`,
              `Para cualquier cosa sobre tus datos: ${correo}.`,
              'Si tienes cuenta, es más rápido desde Mi perfil > Escribir a la organización, porque queda ' +
                'registrado junto a tu cuenta.',
            ],
          },
        ],
      },

      {
        titulo: 'Qué se recoge, para qué y quién puede verlo',
        bloques: [
          {
            puntos: [
              'Tu correo y tu contraseña: para que puedas entrar. La contraseña no la vemos, se guarda cifrada.',
              'Si entras con Google, en lugar de contraseña: Google nos da tu correo, tu nombre, la foto de tu ' +
                'cuenta de Google y un identificador de esa cuenta. Los usamos solo para saber que eres tú cuando ' +
                'entras. Se quedan en el sistema de acceso: no los mostramos a nadie ni los usamos como tu nombre ' +
                'visible ni como tu foto. No le pedimos a Google nada más: ni tus contactos, ni tus correos, ni tus ' +
                'archivos. Nunca vemos tu contraseña de Google.',
              'Tu nombre visible y tu foto: para que la gente de tus rutas te reconozca. Las ven ellas, nadie más.',
              'Dónde estabas al sellar un bar (coordenadas y hora): es lo que permite comprobar que estabas allí ' +
                'de verdad. Sin eso, sellar no significa nada. Lo ven solo tú y quien organiza la ruta.',
              'A qué rutas perteneces y qué bares has sellado: lo ve quien organiza esa ruta.',
              'No se vende ni se cede a terceros. Los únicos que tocan los datos por encargo nuestro son Supabase ' +
                '(base de datos, almacenamiento y el sistema de acceso, también lo que nos da Google) y GitHub ' +
                'Pages (la web).',
            ],
          },
          {
            subtitulo: 'Además, si activas La Caña',
            puntos: [
              'Tu frase de presentación, tu foto y tus etiquetas las ve la gente de tu ruta que también tenga ' +
                'La Caña activada.',
              'A quién le das Me gusta y de quién abres la ficha es privado: no lo ve nadie, ni la otra persona ' +
                'ni quien organiza la ruta. Se guarda solo para que el emparejamiento funcione — si los dos os dais ' +
                'Me gusta, ahí sí se abre la conexión.',
              'Con quién conectas y cuándo lo sabéis los dos, nadie más.',
              'La pregunta de la cerveza, su respuesta y el mensaje que escribas después solo los ve la otra ' +
                'persona del chat. Quien organiza la ruta no puede leerlo.',
              'Cuándo abres cada chat se guarda para enseñarte a ti lo que tienes sin leer; no se le enseña a nadie.',
              'Si denuncias a alguien, lo que esa persona te escribió viaja con la denuncia para que quien ' +
                'organiza la ruta pueda revisarlo.',
              'Puedes desactivarla cuando quieras sin borrar tu cuenta: se guarda todo tal cual para cuando vuelvas.',
            ],
          },
          {
            subtitulo: 'Además, si juegas a los minijuegos',
            puntos: [
              'Tu mejor nota en La Caña Perfecta y las cervezas que hagas en Maestro Cervecero (con el nombre ' +
                'que les pongas) las ve la gente de esa misma ruta, con tu nombre visible. No cruzan de una ruta ' +
                'a otra.',
              'Del ranking se guarda solo tu mejor nota, no cada partida. Puedes borrar tus cervezas cuando ' +
                'quieras, y se borran con tu cuenta y con la ruta.',
            ],
          },
        ],
      },

      {
        titulo: 'Lo que nunca hacemos con tus datos, tampoco con los de Google',
        bloques: [
          {
            puntos: [
              'No los usamos para publicidad de ningún tipo, ni personalizada ni de la otra.',
              'No los vendemos, ni a intermediarios de datos ni a nadie.',
              'No los usamos para decidir si eres solvente ni para dar préstamos.',
              'No los usamos para entrenar modelos de inteligencia artificial.',
              'Lo que nos da Google se usa según la Política de Datos del Usuario de los Servicios de las APIs de ' +
                `Google, incluidos sus requisitos de Uso Limitado (${URL_POLITICA_DATOS_GOOGLE}).`,
              'Puedes quitarle a esta app el acceso a tu cuenta de Google cuando quieras, desde ' +
                `${URL_CONEXIONES_GOOGLE}. Eso no borra tu cuenta aquí: para eso, Mi perfil > Borrar Cuenta.`,
            ],
          },
        ],
      },

      {
        titulo: 'Cómo los protegemos',
        bloques: [
          {
            puntos: [
              'Todo viaja cifrado (HTTPS) entre tu móvil y el servidor.',
              'La base de datos y las fotos se guardan cifradas en los servidores de Supabase.',
              'Cada persona solo puede leer lo que le toca. Esa regla está en la propia base de datos, no solo ' +
                'en la app, así que no se salta llamando al servidor por otro lado.',
              'Las fotos no son públicas: se enseñan con enlaces que caducan, y solo a quien puede verlas.',
              'Las contraseñas se guardan de forma que ni nosotros podemos leerlas.',
            ],
          },
        ],
      },

      {
        titulo: 'Si te sancionamos, guardamos una huella de tu correo',
        bloques: [
          {
            puntos: [
              'Cuando se veta a alguien de una ruta, se le desactiva La Caña o se le suspende la cuenta, se guarda ' +
                'una huella cifrada de su correo. No es el correo: no se puede leer, no dice quién eres y no sirve ' +
                'para buscarte.',
              'Está solo por motivos legales, por si hay una denuncia, y para que una sanción no se salte ' +
                'borrándose la cuenta y volviendo a registrarse con el mismo correo. Es decir: para que el servicio ' +
                'sea seguro para el resto.',
              'Jamás se comparte con nadie, y se borra en cuanto se levanta la sanción o se purgan los datos del ' +
                'evento.',
              'También se guarda mientras haya una denuncia sin resolver sobre ti: si borras tu cuenta y vuelves ' +
                'con el mismo correo, la denuncia sigue contigo. Se borra en cuanto se resuelve.',
              'Sale en tu descarga de datos, aquí abajo en "Ver lo que guardamos", como todo lo demás.',
            ],
          },
        ],
      },

      {
        titulo: 'Cuánto tiempo',
        bloques: [
          {
            puntos: [
              `Un máximo de ${diasConservacion} días tras la celebración del evento. (Aunque, idealmente, lo ` +
                'borraremos todo a las 24h)',
              'Eso es lo del evento: sellos, rutas, minijuegos y La Caña. Tu cuenta (tu correo, tu nombre visible, tu foto ' +
                'y, si entraste con Google, lo que nos dio Google) se guarda mientras la tengas.',
              'Puedes borrar tu cuenta junto con todos tus datos en cualquier momento desde Mi perfil. Eso ' +
                'incluye lo que nos dio Google.',
              'Las fotos que dejas de usar (porque subes otra o porque no se aprueban) se borran en el momento.',
              'Si denuncian tu foto, o se te retira como sanción, se guarda como prueba del caso, también si ' +
                'borras tu cuenta, hasta que quien organiza la da por no necesaria o se borra la ruta. Mientras ' +
                'tanto no la ve nadie más que tú y quien organiza.',
              'El registro de moderación (denuncias y decisiones) se conserva aunque borres tu cuenta. Si ' +
                'desapareciera, una sanción se esquivaría borrándose la cuenta.',
            ],
          },
        ],
      },

      {
        titulo: 'Qué puedes hacer',
        bloques: [
          {
            puntos: [
              'Descargar todo lo tuyo: aquí abajo, en "Ver lo que guardamos".',
              'Borrar tu cuenta y todos tus datos: Mi perfil > Borrar Cuenta.',
              'Reclamar una decisión: dentro del aviso, en Mi perfil > Avisos. Tienes seis meses desde que se toma.',
              'Corregir algo que esté mal, oponerte a un tratamiento o pedir que se limite: escríbenos y te ' +
                'contestamos.',
              'Si no te convence nuestra respuesta, puedes reclamar ante la Agencia Española de Protección de ' +
                'Datos (aepd.es).',
            ],
          },
        ],
      },

      {
        titulo: 'Si cambia esta política',
        bloques: [
          {
            puntos: [
              'Cada versión lleva su fecha, arriba del todo.',
              'Si cambiamos qué datos recogemos o para qué los usamos, y en particular los que nos da Google, te ' +
                'lo avisaremos en la app antes de que el cambio se aplique.',
            ],
          },
        ],
      },

      {
        titulo: 'Lo que todavía no está cerrado',
        bloques: [
          {
            puntos: [
              'Que seas mayor de edad se comprueba con una casilla que marcas tú. No lo verificamos, y conviene ' +
                'que lo sepas.',
              `Si ves algo que no debería estar en la app y no tienes cuenta, escribe a ${correo}: no hace falta ` +
                'registrarse para avisarnos.',
            ],
          },
        ],
      },
    ],

    verLoQueGuardamos: {
      titulo: 'Ver lo que guardamos',
      parrafos: [
        'Todo: tu cuenta y tu correo, lo que nos dio Google si entraste con Google, las rutas en las que estás, ' +
          'tus sellos con la hora y el sitio, las fotos que enviaste a revisión, lo que se ha decidido sobre tu ' +
          'cuenta y por qué, lo de los minijuegos (tu mejor nota y tus cervezas) y lo de La Caña (perfil, Me gusta ' +
          'y Vistos, conexiones y los mensajes que escribiste tú).',
        'No salen los mensajes de la otra persona, que son suyos, ni el texto de una denuncia sobre ti que siga ' +
          'sin resolver: eso llevaría el nombre de quien la puso. Lo que se decidió sí sale, y es lo que necesitas ' +
          'para reclamar.',
        'Tu foto sale como un identificador, no como la imagen. Si quieres una copia de la imagen, pídela desde ' +
          'Mi perfil > Escribir a la organización.',
      ],
    },
  };
}

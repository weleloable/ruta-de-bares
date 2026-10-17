/**
 * El guion de La Penul: SOLO datos. Lo recorre motor.ts; lo vigilan
 * guion.test.ts y motor.test.ts (todo nodo alcanzable, sin callejones, todo
 * camino termina, ninguna opcion 'presiona' lleva a un final bueno...).
 *
 * Contenido para adultos (en la ruta solo hay mayores de edad). Picante y
 * descarado, pero con una regla que no se toca: el final bueno exige que la otra
 * persona QUIERA, y que se note. La propuesta de irse sale siempre de ella o de
 * el, nunca de que insistas. Insistir, agobiar, mentir o intentar emborrachar a
 * alguien lleva la etiqueta 'presiona' y acaba en calabazas.
 *
 * Variantes de genero de quien juega: `{o|a}` (ver tipos.ts).
 *
 * ESCONDERLO NO LO PROTEGE: este texto va dentro de la web publicada aunque el
 * juego no salga en el menu (ver la 0072).
 *
 * Sin importaciones en tiempo de ejecucion: los tests lo cargan tal cual.
 */
import type { Imagen, Nodo, PersonaId } from './tipos';

export const ID_LA_PENUL = 'la-penul';
export const TITULO_LA_PENUL = 'La Penul';

/** Rondas antes de que cierre el bar. Es lo que garantiza que toda partida termina. */
export const RONDAS = 3;

export const INICIO = 'inicio';
export const BARRA = 'barra';
export const CIERRE = 'cierre';

export const PERSONAS: Record<PersonaId, { nombre: string; imagen: Imagen; donde: string }> = {
  vane: { nombre: 'Vane', imagen: 'peep-48', donde: 'En la pista, con gafas de sol' },
  carmela: { nombre: 'Carmela', imagen: 'peep-96', donde: 'En un sillón, recién salida del curro' },
  lola: { nombre: 'Lola', imagen: 'peep-61', donde: 'Peleándose con la máquina de discos' },
  bruno: { nombre: 'Bruno', imagen: 'peep-17', donde: 'En la esquina de la barra, con sombrero' },
  inigo: { nombre: 'Íñigo', imagen: 'peep-94', donde: 'En el sillón del fondo, dibujando' },
  toni: { nombre: 'Toni', imagen: 'peep-91', donde: 'Riéndose en la barra, con pipas' },
};

export const PACO = { nombre: 'Paco', imagen: 'peep-10' as const };
export const ROBER = { nombre: 'Rober', imagen: 'peep-47' as const };

const volver = (texto = 'Volver a la barra') => ({ texto, va: BARRA, ronda: true as const });

export const NODOS: Nodo[] = [
  // ---------------------------------------------------------------------------
  // Entrada
  // ---------------------------------------------------------------------------
  {
    id: INICIO,
    fondo: 'bar',
    imagen: null,
    paginas: [
      '{La barra ha hablado: esta noche eres un hombre. Barba opcional, descaro obligatorio.|La barra ha hablado: esta noche eres una mujer. Tacones opcionales, criterio obligatorio.}',
    ],
    opciones: [
      { texto: 'Entrar al bar', va: 'puerta' },
      {
        texto: 'Entrar al bar como si fuera tuyo',
        va: 'puerta',
        replica: 'Te colocas el cuello de la chaqueta, respiras hondo y empujas la puerta. Que sea lo que la barra quiera.',
      },
    ],
  },
  {
    id: 'puerta',
    fondo: 'bar',
    imagen: 'peep-47',
    paginas: [
      'En la puerta, Rober, el portero, te mira de arriba abajo con los brazos cruzados.',
      { habla: 'Rober', texto: '¿Vienes a beber o a ligar?' },
    ],
    opciones: [
      { texto: 'A beber. Lo otro, si surge.', va: BARRA, replica: { habla: 'Rober', texto: 'Respuesta correcta. Pasa.' } },
      {
        texto: 'A ligar. Lo de beber es para disimular.',
        va: BARRA,
        replica: { habla: 'Rober', texto: 'Por lo menos eres sincer{o|a}. Pasa, anda.' },
      },
    ],
  },
  {
    id: BARRA,
    fondo: 'bar',
    imagen: null,
    barra: true,
    paginas: ['El bar está lleno, la música alta y la noche, de tu parte. ¿Con quién hablas?'],
    opciones: [
      { texto: 'Vane', va: 'vane-1', persona: 'vane' },
      { texto: 'Carmela', va: 'carmela-1', persona: 'carmela' },
      { texto: 'Lola', va: 'lola-1', persona: 'lola' },
      { texto: 'Bruno', va: 'bruno-1', persona: 'bruno' },
      { texto: 'Íñigo', va: 'inigo-1', persona: 'inigo' },
      { texto: 'Toni', va: 'toni-1', persona: 'toni' },
      { texto: 'Pedirle otra a Paco', va: 'paco' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Paco, el camarero: pistas a cambio de una ronda
  // ---------------------------------------------------------------------------
  {
    id: 'paco',
    fondo: 'bar',
    imagen: 'peep-10',
    paginas: [{ habla: 'Paco', texto: '¿Qué te pongo? Y no me digas «lo de siempre», que es la primera vez que te veo.' }],
    opciones: [
      { texto: 'Una caña. Y cuéntame algo de ellas.', va: 'paco-ellas' },
      { texto: 'Una caña. Y cuéntame algo de ellos.', va: 'paco-ellos' },
      { ...volver('Solo la caña, gracias.'), replica: { habla: 'Paco', texto: 'Caña y discreción. Me gusta tu estilo.' } },
    ],
  },
  {
    id: 'paco-ellas',
    fondo: 'bar',
    imagen: 'peep-10',
    paginas: [
      'Paco baja la voz mientras tira la caña.',
      {
        habla: 'Paco',
        texto: 'A Vane no le vengas con frases de manual: rétala. Carmela viene de currar, así que ni le hables de trabajo ni le vendas humo.',
      },
      { habla: 'Paco', texto: 'Y a Lola dile la verdad aunque quedes fatal. Lo que no aguanta es a los que van de entendidos.' },
    ],
    opciones: [volver('Gracias, Paco'), { ...volver('¿Y tú, Paco? ¿Nadie te tira la caña?'), replica: { habla: 'Paco', texto: 'Yo estoy trabajando. Pregúntamelo al cierre.' } }],
  },
  {
    id: 'paco-ellos',
    fondo: 'bar',
    imagen: 'peep-10',
    paginas: [
      'Paco baja la voz mientras tira la caña.',
      {
        habla: 'Paco',
        texto: 'Bruno va de sobrado, pero lo que le gusta es que le lleves la contraria. Íñigo es buena gente: despacio y sin gritar, que se agobia.',
      },
      { habla: 'Paco', texto: 'Y a Toni ríele los chistes. Pero ríete con él, no de él.' },
    ],
    opciones: [volver('Gracias, Paco'), { ...volver('¿Y tú, Paco? ¿Nadie te tira la caña?'), replica: { habla: 'Paco', texto: 'Yo estoy trabajando. Pregúntamelo al cierre.' } }],
  },

  // ---------------------------------------------------------------------------
  // Vane (peep-48): manda en la pista
  // ---------------------------------------------------------------------------
  {
    id: 'vane-1',
    fondo: 'bar',
    imagen: 'peep-48',
    paginas: [
      'Vane baila sola en mitad de la pista, con gafas de sol a las dos de la mañana y la seguridad de quien se ha pagado el local.',
      { habla: 'Vane', texto: '¿Vienes a bailar o a mirar? Porque mirar ya lo hace todo el bar.' },
    ],
    opciones: [
      { texto: 'A bailar. Te aviso: bailo fatal, pero con muchísima confianza.', va: 'vane-2' },
      { texto: '¿Gafas de sol de noche? ¿Te deslumbra mi presencia?', va: 'vane-2b' },
      { texto: 'Sonríe, guapa, que estás más guapa sonriendo.', va: 'vane-fuera' },
    ],
  },
  {
    id: 'vane-2',
    fondo: 'bar',
    imagen: 'peep-48',
    paginas: [
      'Vane te mira bailar y se le escapa una carcajada que no se molesta en disimular.',
      { habla: 'Vane', texto: 'Madre mía. Eso que haces con los brazos es ilegal en tres comunidades autónomas. Sígueme.' },
    ],
    opciones: [
      { texto: 'Seguirla. Fallar en todos los pasos y no dejar de sonreír.', va: 'vane-3' },
      {
        texto: 'Enséñame, que aprendo rápido. Sobre todo con buena profesora.',
        va: 'vane-3',
        replica: { habla: 'Vane', texto: 'Uy, qué peligro tienes. A ver si es verdad.' },
      },
      { texto: 'Agarrarla de la cintura sin preguntar y pegarla a ti.', va: 'vane-calabazas', etiquetas: ['presiona'] },
    ],
  },
  {
    id: 'vane-2b',
    fondo: 'bar',
    imagen: 'peep-48',
    paginas: [
      'Vane se baja las gafas un dedo.',
      { habla: 'Vane', texto: 'Me deslumbra que alguien siga usando esa frase a estas alturas. Te doy otra oportunidad. Una.' },
    ],
    opciones: [
      {
        texto: 'Vale, frase de manual. Te reto: si te gano bailando, me invitas tú.',
        va: 'vane-3',
        replica: { habla: 'Vane', texto: '¿Un reto? Ahora sí que hablamos el mismo idioma.' },
      },
      { texto: 'Pues tengo más. ¿Quieres la del ángel que se ha caído del cielo?', va: 'vane-fuera' },
    ],
  },
  {
    id: 'vane-3',
    fondo: 'bar',
    imagen: 'peep-48',
    paginas: [
      'La música cambia a una lenta. Media pista huye a la barra.',
      { habla: 'Vane', texto: 'Canción lenta. Aquí es donde la gente se pone nerviosa. ¿Tú te pones nervios{o|a}?' },
    ],
    opciones: [
      { texto: 'Un poco. Pero se me pasa si me sigues mirando así.', va: 'vane-4' },
      {
        texto: 'Yo no. Pero tú sí, que se te han empañado las gafas.',
        va: 'vane-4',
        replica: { habla: 'Vane', texto: 'Serán los focos. Serán.' },
      },
      {
        texto: 'Te voy a poner nerviosa a base de chupitos, uno detrás de otro, hasta que me digas que sí.',
        va: 'vane-calabazas',
        etiquetas: ['presiona'],
      },
    ],
  },
  {
    id: 'vane-4',
    fondo: 'bar',
    imagen: 'peep-48',
    paginas: [
      'Vane se quita las gafas por primera vez en toda la noche. Tiene la mirada de quien ya ha decidido.',
      { habla: 'Vane', texto: 'Esta pista se me ha quedado pequeña. En mi casa hay altavoz, espejo y nada de público. ¿Te apuntas o te lo tengo que bailar?' },
    ],
    opciones: [
      { texto: 'Me apunto. Pero el último baile lo elijo yo.', va: 'vane-bueno' },
      { texto: 'Bailámelo. Por el camino.', va: 'vane-bueno' },
      { ...volver('Hoy no puedo, mañana tengo boda.'), replica: { habla: 'Vane', texto: 'Pues que te bailen los novios.' } },
    ],
  },
  {
    id: 'vane-fuera',
    fondo: 'bar',
    imagen: 'peep-48',
    paginas: ['Vane se recoloca las gafas y sigue bailando. La pista es suya. Tú, por lo visto, no.'],
    opciones: [volver('Volver a la barra con lo que te queda de dignidad'), { texto: '«Venga, una oportunidad más, que tú y yo bailamos mejor junt{os|as}.» Y no te mueves de su lado.', va: 'vane-calabazas', etiquetas: ['presiona'] }],
  },
  {
    id: 'vane-bueno',
    fondo: 'portal',
    imagen: 'peep-48',
    paginas: [
      'Salís a la calle bailando todavía, con la música del bar pegada a la espalda. En el portal, Vane te empuja contra la pared y te besa como si llevara toda la noche ensayándolo.',
      'Sus manos marcan el ritmo por tu cintura, y luego más abajo. Las gafas de sol acaban en tu bolsillo. Tu ropa, a medio desabrochar, ya no sabe a quién obedece.',
      'Vane busca las llaves en el bolso sin dejar de besarte. Saca un pintalabios. Un mechero. Un ticket del súper.',
      { habla: 'Vane', texto: 'Están aquí, te lo juro.' },
      'No tienes ninguna prisa. Mientes fatal.',
    ],
    final: {
      tipo: 'bueno',
      con: 'vane',
      titular: 'VANE: «LA PISTA SE ME QUEDÓ PEQUEÑA»',
      remate: 'Las llaves aparecieron. El altavoz sonó hasta las seis. Los vecinos han pedido la canción.',
    },
  },
  {
    id: 'vane-calabazas',
    fondo: 'bar',
    imagen: 'peep-48',
    paginas: [
      'Vane se baja las gafas y te dedica la mirada más larga de la noche: la de «ni en tus sueños». Luego se aparta de ti como quien se sacude una pelusa.',
      'Se da la vuelta y sigue bailando. Tú también sigues. Sol{o|a}. En mitad de la pista. Con todo el bar mirando.',
    ],
    final: {
      tipo: 'calabazas',
      con: 'vane',
      titular: 'VANE TE DEJA BAILANDO SOL{O|A}',
      remate: 'Hay quien liga en la pista. Tú has estrenado la coreografía de la vergüenza.',
    },
  },

  // ---------------------------------------------------------------------------
  // Carmela (peep-96): viene del afterwork
  // ---------------------------------------------------------------------------
  {
    id: 'carmela-1',
    fondo: 'bar',
    imagen: 'peep-96',
    paginas: [
      'Carmela está en un sillón con la americana todavía puesta, un gin-tonic a medias y cara de haber sobrevivido a cuatro reuniones que podían haber sido un correo.',
      { habla: 'Carmela', texto: 'Si me preguntas a qué me dedico, me levanto y me voy. Te lo digo con cariño.' },
    ],
    opciones: [
      { texto: 'No me lo digas. ¿Domadora de reuniones que podían ser un correo?', va: 'carmela-2' },
      { texto: 'Yo invierto en criptos, por cierto. Te lo cuento por si te interesa el futuro.', va: 'carmela-fuera-criptos' },
      {
        texto: 'Soy director{|a} de una multinacional, ¿sabes? Tengo un barco. Bueno, lo tendré.',
        va: 'carmela-calabazas',
        etiquetas: ['presiona'],
      },
    ],
  },
  {
    id: 'carmela-2',
    fondo: 'bar',
    imagen: 'peep-96',
    paginas: [
      'Carmela se ríe sin querer y se odia un poco por ello.',
      { habla: 'Carmela', texto: 'Casi. Hoy he dicho «sinergia» once veces. Necesito que alguien me diga algo que no se pueda poner en un PowerPoint.' },
    ],
    opciones: [
      { texto: 'Tienes la sonrisa más peligrosa del bar. Eso no cabe en ninguna diapositiva.', va: 'carmela-3' },
      {
        texto: 'Te propongo una reunión: tú, yo y ningún orden del día.',
        va: 'carmela-3',
        replica: { habla: 'Carmela', texto: '¿Sin acta? Qué escándalo. Sigue.' },
      },
      {
        texto: 'Lo que necesitas es otro gin-tonic. ¡Paco, cárgaselo, que esta hoy no se va a casa sobria!',
        va: 'carmela-calabazas',
        etiquetas: ['presiona'],
      },
    ],
  },
  {
    id: 'carmela-3',
    fondo: 'bar',
    imagen: 'peep-96',
    paginas: [
      'Carmela se quita la americana y la deja en el respaldo. Debajo, una camiseta de rayas y un hombro al aire que no estaba en el orden del día.',
      { habla: 'Carmela', texto: 'Te advierto que soy muy exigente. Si esto fuera una entrevista: ¿por qué debería quedarme contigo y no con mi sofá?' },
    ],
    opciones: [
      { texto: 'Porque tu sofá no te hace reír. Y yo pienso hacerte reír… y otras cosas que tu sofá no sabe.', va: 'carmela-4' },
      {
        texto: 'Porque me adapto a cualquier puesto. A cualquiera.',
        va: 'carmela-4',
        replica: { habla: 'Carmela', texto: 'Esa respuesta no viene en ningún manual de recursos humanos. Me encanta.' },
      },
      { texto: 'Porque no me voy a ir hasta que me digas que sí. Tengo toda la noche.', va: 'carmela-calabazas', etiquetas: ['presiona'] },
    ],
  },
  {
    id: 'carmela-4',
    fondo: 'bar',
    imagen: 'peep-96',
    paginas: [
      { habla: 'Carmela', texto: 'Contratad{o|a}. Periodo de prueba: esta noche.' },
      'Apura el gin-tonic de un trago y se levanta. Se le nota en la cara que ya ha firmado.',
      { habla: 'Carmela', texto: 'Vivo aquí al lado. Tengo un sofá comodísimo, pero te aviso de que no lo vamos a usar para sentarnos.' },
    ],
    opciones: [
      { texto: '¿Firmamos el contrato en el ascensor?', va: 'carmela-bueno' },
      { texto: 'Coge la americana. Yo llevo las ganas.', va: 'carmela-bueno' },
      { ...volver('Mejor otro día, y lo hablamos con calma.'), replica: { habla: 'Carmela', texto: 'Con calma tengo las reuniones.' } },
    ],
  },
  {
    id: 'carmela-fuera-criptos',
    fondo: 'bar',
    imagen: 'peep-96',
    paginas: ['Carmela deja el vaso en la mesa con muchísima calma, se pone los cascos y cierra los ojos. Los cascos no están conectados a nada.'],
    opciones: [volver(), { texto: 'Quitarle un casco y seguir explicándole lo de las criptos, que no lo ha entendido bien.', va: 'carmela-calabazas', etiquetas: ['presiona'] }],
  },
  {
    id: 'carmela-bueno',
    fondo: 'portal',
    imagen: 'peep-96',
    paginas: [
      'En el portal, Carmela te agarra de la camiseta y te mete en el hueco de la puerta, donde no llega la farola. Te besa despacio, como quien revisa un contrato que piensa firmar entero.',
      'Le desabrochas un botón. Luego otro. Ella se ríe contra tu cuello.',
      { habla: 'Carmela', texto: 'Mira qué eficiencia.' },
      'Sus manos, mucho menos ejecutivas, ya van por tu cinturón. La llave entra a la tercera. La americana se queda en el suelo del portal y Carmela ni la mira.',
      { habla: 'Carmela', texto: 'Mañana la recojo. Y si no, que me despidan.' },
    ],
    final: {
      tipo: 'bueno',
      con: 'carmela',
      titular: 'CARMELA CIERRA EL TRIMESTRE CON BENEFICIOS',
      remate: 'El lunes, en la reunión, alguien le preguntará por qué sonríe. Dirá «sinergia».',
    },
  },
  {
    id: 'carmela-calabazas',
    fondo: 'bar',
    imagen: 'peep-96',
    paginas: [
      'Carmela se levanta, se pone la americana y te mira con la misma cara que pone a los becarios que responden a todos.',
      { habla: 'Carmela', texto: 'Esto no es para mí. Ni para nadie, la verdad.' },
      'Paga su gin-tonic al salir. El tuyo, no.',
    ],
    final: {
      tipo: 'calabazas',
      con: 'carmela',
      titular: 'CARMELA TE DESPIDE SIN INDEMNIZACIÓN',
      remate: 'Has conseguido algo histórico: que una consultora prefiera volver a la oficina.',
    },
  },

  // ---------------------------------------------------------------------------
  // Lola (peep-61): rockera. La conversacion que valido el usuario.
  // ---------------------------------------------------------------------------
  {
    id: 'lola-1',
    fondo: 'bar',
    imagen: 'peep-61',
    paginas: [
      'Lola está apoyada en la barra con un botellín, mirando la máquina de discos como si le debiera dinero.',
      { habla: 'Lola', texto: 'Si vienes a preguntarme si estudio o trabajo, te aviso: a estas horas, ninguna de las dos.' },
    ],
    opciones: [
      { texto: 'Vengo a preguntarte qué te ha hecho esa máquina, que la miras como a un ex.', va: 'lola-2' },
      { texto: 'De rock no tengo ni idea, pero esa camiseta te queda de escándalo.', va: 'lola-2b' },
      { texto: '¡Paco, dos chupitos dobles para la del rayo, a ver si se nos suelta!', va: 'lola-calabazas', etiquetas: ['presiona'] },
    ],
  },
  {
    id: 'lola-2',
    fondo: 'bar',
    imagen: 'peep-61',
    paginas: [{ habla: 'Lola', texto: 'Lleva tres veces la misma balada de anuncio de colonia. Tres. Esto es sabotaje.' }],
    opciones: [
      { texto: 'Dame una moneda y la cambio. A cambio, eliges tú la siguiente… y con quién la escuchas.', va: 'lola-3' },
      {
        texto: 'Pues a mí esa balada me gusta, ¿eh?',
        va: 'lola-3',
        replica: { habla: 'Lola', texto: 'Mira, por lo menos eres sincer{o|a}. Eso no se ve mucho por aquí.' },
      },
      volver('Voy un momento a la barra.'),
    ],
  },
  {
    id: 'lola-2b',
    fondo: 'bar',
    imagen: 'peep-61',
    paginas: [{ habla: 'Lola', texto: '¿Ni idea? A ver, examen sorpresa: ¿cuál es el último disco que te compraste?' }],
    opciones: [
      {
        texto: 'Uno de reguetón. Hace diez años. Y me lo sé entero. Me acerqué por la camiseta… y por lo que hay dentro.',
        va: 'lola-3',
        replica: { habla: 'Lola', texto: 'Ja. Mal disco, buena respuesta.' },
      },
      {
        texto: 'Mentirle: «Uno de AC/DC. El rojo. El del rayo. Mi favorito de toda la vida.»',
        va: 'lola-calabazas',
        etiquetas: ['presiona'],
      },
      volver('Mejor me voy antes de suspender.'),
    ],
  },
  {
    id: 'lola-3',
    fondo: 'bar',
    imagen: 'peep-61',
    paginas: [
      'Lola mete la moneda. Suenan guitarras. Por fin.',
      { habla: 'Lola', texto: 'Si no mueves la cabeza en el estribillo, te quedas sin la segunda parte de la noche.' },
    ],
    opciones: [
      { texto: 'Mover la cabeza como si tuvieras quince años y un póster en el cuarto.', va: 'lola-4' },
      {
        texto: 'Yo no bailo. Pero miro muy bien.',
        va: 'lola-4',
        replica: { habla: 'Lola', texto: 'Pues mira bien, que esto no lo repito. (Y baila pegada a ti, de espaldas, sin prisa.)' },
      },
      { texto: 'Venga, no te hagas la dura, que se te nota que quieres.', va: 'lola-calabazas', etiquetas: ['presiona'] },
    ],
  },
  {
    id: 'lola-4',
    fondo: 'bar',
    imagen: 'peep-61',
    paginas: [
      'El estribillo termina con su boca a dos dedos de tu oreja.',
      { habla: 'Lola', texto: 'Hueles a cerveza y a malas decisiones. Me gusta. Vivo a dos calles. Tengo cervezas en la nevera y un vinilo que no te voy a dejar escuchar entero.' },
    ],
    opciones: [
      { texto: '¿Y qué me vas a dejar hacer entero?', va: 'lola-bueno' },
      { texto: 'Voy a por las chaquetas.', va: 'lola-bueno' },
      { ...volver('Uf, mañana madrugo…'), replica: { habla: 'Lola', texto: 'Tú te lo pierdes.' } },
    ],
  },
  {
    id: 'lola-bueno',
    fondo: 'portal',
    imagen: 'peep-61',
    paginas: [
      'Salís a la calle y el frío no aguanta ni lo que tardáis en llegar al portal. Lola te empuja contra la pared, justo debajo de la luz, y te besa como si el estribillo siguiera sonando.',
      'Sus manos encuentran el camino por debajo de tu camiseta mucho antes que ella sus llaves. La chaqueta sobra. Lo de debajo de la chaqueta lleva el mismo camino.',
      'Pelea con la cerradura sin dejar de besarte. Falla una vez. Falla dos.',
      { habla: 'Lola', texto: '¿Quieres hacerlo tú?' },
      'Si lo haces tú, no entráis nunca. La puerta cede. Vosotr{os|as} también.',
    ],
    final: {
      tipo: 'bueno',
      con: 'lola',
      titular: 'LOLA Y EL ESTRIBILLO QUE NO TERMINÓ',
      remate: 'Los vecinos del segundo no pegaron ojo. El vinilo, tampoco.',
    },
  },
  {
    id: 'lola-calabazas',
    fondo: 'bar',
    imagen: 'peep-61',
    paginas: [
      'Lola te mira de arriba abajo, apura el botellín y se va a la otra punta de la barra.',
      'Al pasar, le da un golpe a la máquina: vuelve a sonar la balada de anuncio de colonia. Por ti. Entera.',
    ],
    final: {
      tipo: 'calabazas',
      con: 'lola',
      titular: 'CALABAZAS CON DISTORSIÓN',
      remate: 'Lola ya tiene canción para esta noche. Es la tuya, y es la balada.',
    },
  },

  // ---------------------------------------------------------------------------
  // Bruno (peep-17): el hipster de la barra
  // ---------------------------------------------------------------------------
  {
    id: 'bruno-1',
    fondo: 'bar',
    imagen: 'peep-17',
    paginas: [
      'Bruno ocupa la esquina de la barra con un sombrero que no necesita, un vermut con su aceituna y cara de tener opiniones sobre el lúpulo.',
      { habla: 'Bruno', texto: 'Esa cerveza que llevas es industrial. No te juzgo. Bueno, un poco.' },
    ],
    opciones: [
      { texto: 'Y ese sombrero es de interior. Yo tampoco te juzgo. Bueno, un poco.', va: 'bruno-2' },
      {
        texto: 'Pues explícame qué tiene de malo. Pero en menos de un minuto.',
        va: 'bruno-2',
        replica: { habla: 'Bruno', texto: '¿En un minuto? Nadie me había puesto límite de tiempo. Qué emoción.' },
      },
      { texto: '¡Uy, perdona! Tienes toda la razón, es malísima. Lo que tú digas.', va: 'bruno-fuera' },
    ],
  },
  {
    id: 'bruno-2',
    fondo: 'bar',
    imagen: 'peep-17',
    paginas: [
      'Bruno se ríe y se quita el sombrero. Tiene más pelo del que esperabas y menos ego del que aparentaba.',
      { habla: 'Bruno', texto: 'Touché. Te propongo un trato: pruebas mi vermut y, si no te gusta, me quito también la americana.' },
    ],
    opciones: [
      { texto: 'Probarlo. «Está buenísimo. Qué pena: me apetecía verte sin americana.»', va: 'bruno-3' },
      {
        texto: 'Trato. Y si me gusta, el siguiente me lo pagas tú.',
        va: 'bruno-3',
        replica: { habla: 'Bruno', texto: 'Así no se negocia. Acepto.' },
      },
      { texto: 'Quitarle tú la americana de un tirón, que se le ve con ganas.', va: 'bruno-calabazas', etiquetas: ['presiona'] },
    ],
  },
  {
    id: 'bruno-3',
    fondo: 'bar',
    imagen: 'peep-17',
    paginas: [
      { habla: 'Bruno', texto: 'Llevo toda la noche explicándole el lúpulo a gente que asiente. Eres la primera persona que me lleva la contraria. Es rarísimo. Me gusta.' },
    ],
    opciones: [
      { texto: 'Pues prepárate, que tengo más opiniones. Por ejemplo: tienes una boca muy bonita para usarla solo hablando.', va: 'bruno-4' },
      { texto: 'Llevarte la contraria lo hago gratis. Lo demás te lo cobro en besos.', va: 'bruno-4' },
      {
        ...volver('Es que no te escuchaba, la verdad. ¿Qué decías del lúpulo?'),
        replica: 'Bruno se pone el sombrero, muy digno, y se gira hacia otra persona que asiente.',
      },
    ],
  },
  {
    id: 'bruno-4',
    fondo: 'bar',
    imagen: 'peep-17',
    paginas: [
      'Bruno deja un billete en la barra, coge el sombrero y te lo pone a ti.',
      { habla: 'Bruno', texto: 'Tengo en casa una cerveza de abadía que guardo para una ocasión especial. Creo que acaba de llegar. ¿Te vienes a abrirla?' },
    ],
    opciones: [
      { texto: 'Si la abrimos, nos la bebemos entera.', va: 'bruno-bueno' },
      { texto: 'Me quedo el sombrero como garantía.', va: 'bruno-bueno' },
      { ...volver('Mejor otro día. Tanta cerveza especial me da pereza.'), replica: { habla: 'Bruno', texto: 'Pereza. Me has roto el corazón y el maridaje.' } },
    ],
  },
  {
    id: 'bruno-fuera',
    fondo: 'bar',
    imagen: 'peep-17',
    paginas: ['Bruno asiente, satisfecho, y te habla de fermentación durante doce minutos seguidos. Al terminar no sabe ni cómo te llamas. Tú tampoco te acuerdas.'],
    opciones: [volver(), { texto: '«Oye, que no he terminado contigo.» Y le sigues hasta la otra punta de la barra.', va: 'bruno-calabazas', etiquetas: ['presiona'] }],
  },
  {
    id: 'bruno-bueno',
    fondo: 'portal',
    imagen: 'peep-17',
    paginas: [
      'En el portal, Bruno intenta besarte con elegancia y el sombrero se interpone. Lo tiráis al suelo a la vez. El segundo beso ya no tiene nada de elegante.',
      'Le quitas, por fin, la famosa americana. Debajo hay una camiseta de rayas y mucho más que opiniones. Se le escapa un «uf» que no sale en ninguna guía de catas.',
      'Busca la llave con una mano; con la otra no te suelta. Falla. Se ríe. Vuelve a fallar.',
      { habla: 'Bruno', texto: 'Es que la cerradura es artesanal.' },
      'Claro. Como todo lo suyo.',
    ],
    final: {
      tipo: 'bueno',
      con: 'bruno',
      titular: 'BRUNO ABRE POR FIN SU CERVEZA ESPECIAL',
      remate: 'Nadie la probó. Sigue en la nevera. El sombrero apareció tres días después en el portal.',
    },
  },
  {
    id: 'bruno-calabazas',
    fondo: 'bar',
    imagen: 'peep-17',
    paginas: [
      'Bruno se aparta, se recoloca la solapa con dos dedos y te mira como a una cerveza sin alcohol.',
      { habla: 'Bruno', texto: 'Mira, con mi americana y con mi espacio tengo una relación muy seria. Y no estás invitad{o|a}.' },
      'Se pone el sombrero, pide la cuenta y se lleva el vermut. Hasta la aceituna.',
    ],
    final: {
      tipo: 'calabazas',
      con: 'bruno',
      titular: 'BRUNO: «NO, GRACIAS, YO SOY DE AUTOR»',
      remate: 'Nota de cata: aroma a prisas, cuerpo flojo y un final amargo.',
    },
  },

  // ---------------------------------------------------------------------------
  // Iñigo (peep-94): barbudo tranquilo, carpintero
  // ---------------------------------------------------------------------------
  {
    id: 'inigo-1',
    fondo: 'bar',
    imagen: 'peep-94',
    paginas: [
      'Íñigo está en el sillón más apartado, con una caña que le dura desde las once y un cuaderno en el que dibuja la lámpara del bar. Te ve acercarte y no dice nada. Espera.',
      { habla: 'Íñigo', texto: 'Hola. Se está bien aquí, lejos del altavoz.' },
    ],
    opciones: [
      { texto: 'Se está bien. ¿Puedo sentarme? Prometo no hablar a gritos.', va: 'inigo-2' },
      { texto: '¿QUÉ? ¡NO TE OIGO! ¡VENTE A LA PISTA, QUE ESTO ESTÁ MUERTO!', va: 'inigo-fuera' },
      {
        texto: 'Sentarte pegad{o|a} a él, quitarle el cuaderno y ponerte a pasar páginas sin preguntar.',
        va: 'inigo-calabazas',
        etiquetas: ['presiona'],
      },
    ],
  },
  {
    id: 'inigo-2',
    fondo: 'bar',
    imagen: 'peep-94',
    paginas: [
      'Íñigo te hace sitio y te enseña el dibujo: la lámpara, la barra… y, en una esquina, alguien que se parece sospechosamente a ti.',
      { habla: 'Íñigo', texto: 'Perdona. Llevabas un rato en la barra y tenías buena luz.' },
    ],
    opciones: [
      { texto: '¿Me has dibujado? Pues ahora me debes una caña. O un retrato de cuerpo entero.', va: 'inigo-3' },
      {
        texto: 'No decir nada. Mirar el dibujo un buen rato y luego mirarle a él.',
        va: 'inigo-3',
        replica: 'Íñigo se pone colorado hasta la barba. Es la primera vez en toda la noche que alguien se queda callado a su lado y no es incómodo.',
      },
      { ...volver('¿Y vives de esto? ¿Tienes Instagram? ¿Cuántos seguidores? ¿Cuánto cobras?'), replica: 'Íñigo cierra el cuaderno muy despacio. Se le ha acabado la batería social, y a ti la oportunidad.' },
    ],
  },
  {
    id: 'inigo-3',
    fondo: 'bar',
    imagen: 'peep-94',
    paginas: [
      { habla: 'Íñigo', texto: 'Soy carpintero. Hago muebles que tardan meses. Ahora todo el mundo tiene prisa para todo.' },
      'Te mira un rato. Sin prisa.',
      { habla: 'Íñigo', texto: 'Tú no pareces tener prisa.' },
    ],
    opciones: [
      { texto: 'Para algunas cosas, ninguna. Me gusta hacerlas despacio y bien.', va: 'inigo-4' },
      { texto: 'Depende de quién me la quite. (Y te acercas un poco.)', va: 'inigo-4' },
      {
        texto: '¿Prisa? Ya te digo yo que sí. Nos vamos a tu casa ya, que se hace de día. (Y le tiras del brazo.)',
        va: 'inigo-calabazas',
        etiquetas: ['presiona'],
      },
    ],
  },
  {
    id: 'inigo-4',
    fondo: 'bar',
    imagen: 'peep-94',
    paginas: [
      'Íñigo cierra el cuaderno. Se acerca hasta que la barba te roza la mejilla y, muy bajito, para que no lo oiga nadie más:',
      { habla: 'Íñigo', texto: 'Mi taller está encima de mi casa. Huele a madera. Hay una cama que hice yo. Me gustaría mucho enseñártela… si te apetece.' },
    ],
    opciones: [
      { texto: 'Me apetece. Mucho.', va: 'inigo-bueno' },
      { texto: 'Enséñamela despacio.', va: 'inigo-bueno' },
      { ...volver('Otro día, ¿vale? Hoy vengo a lo que surja en la pista.'), replica: 'Íñigo sonríe y vuelve a abrir el cuaderno. Sin drama. Te dibuja yéndote.' },
    ],
  },
  {
    id: 'inigo-fuera',
    fondo: 'bar',
    imagen: 'peep-94',
    paginas: ['Íñigo da un respingo que casi le tira la caña. Sonríe con educación y se pone a dibujar muy concentrado. Una lámpara. Otra lámpara. Lámparas sin fin.'],
    opciones: [volver(), { texto: 'Sentarte a su lado igualmente y seguir hablándole, aunque no conteste.', va: 'inigo-calabazas', etiquetas: ['presiona'] }],
  },
  {
    id: 'inigo-bueno',
    fondo: 'portal',
    imagen: 'peep-94',
    paginas: [
      'En el portal es Íñigo el que se para. Te aparta el pelo de la cara con una mano que huele a serrín y te besa como trabaja: sin prisa y sin dejarse nada.',
      'Contra la pared, sus manos aprenden tu cuerpo como una pieza de madera: despacio, a conciencia, sin saltarse una veta. A ti la paciencia se te acaba en el segundo botón.',
      'Le pides la llave. Él dice «ahora» y no la busca.',
      'Al final la encuentras tú, en su bolsillo de atrás, que es donde tenías la mano de todas formas.',
    ],
    final: {
      tipo: 'bueno',
      con: 'inigo',
      titular: 'ÍÑIGO: «LAS COSAS BIEN HECHAS LLEVAN SU TIEMPO»',
      remate: 'La cama aguantó. Es de roble macizo. Íñigo lo comentó con orgullo a la mañana siguiente.',
    },
  },
  {
    id: 'inigo-calabazas',
    fondo: 'bar',
    imagen: 'peep-94',
    paginas: [
      'Íñigo recoge el cuaderno con cuidado, deja la caña a medias y se levanta.',
      { habla: 'Íñigo', texto: 'Perdona. Me agobio.' },
      'Y se va. Sin un portazo y sin una mala palabra. En la mesa queda el dibujo de la lámpara. Tú ya no sales en él.',
    ],
    final: {
      tipo: 'calabazas',
      con: 'inigo',
      titular: 'ÍÑIGO SE VA SIN HACER RUIDO',
      remate: 'Enhorabuena: has hecho salir por patas a un carpintero.',
    },
  },

  // ---------------------------------------------------------------------------
  // Toni (peep-91): el majete del bigote
  // ---------------------------------------------------------------------------
  {
    id: 'toni-1',
    fondo: 'bar',
    imagen: 'peep-91',
    paginas: [
      'Toni se ríe en la barra. Tan fuerte que la gente de la otra punta se ríe sin saber de qué. Lleva bigote, camiseta blanca y una bolsa de pipas colada de extranjis.',
      { habla: 'Toni', texto: '¿Quieres pipas? Son de mi pueblo. Bueno, del súper de mi pueblo.' },
    ],
    opciones: [
      { texto: 'Si me das pipas, te cuento un chiste malísimo.', va: 'toni-2' },
      { texto: '¿Pipas en un bar? Qué rural todo, ¿no?', va: 'toni-fuera' },
      { texto: 'No, gracias. Yo solo como cosas con nombre en francés.', va: 'toni-fuera' },
    ],
  },
  {
    id: 'toni-2',
    fondo: 'bar',
    imagen: 'peep-91',
    paginas: [{ habla: 'Toni', texto: '¡Venga! Si me haces reír, te doy la bolsa entera.' }],
    opciones: [
      {
        texto: '¿Qué le dice una cerveza a otra? «Nos vemos en el bar».',
        va: 'toni-3',
        replica: { habla: 'Toni', texto: '¡Qué malo! ¡Qué malo! (Se le cae una pipa en el vaso de la risa.)' },
      },
      {
        texto: '¿Por qué el bigote nunca sale solo? Porque siempre va con su ceja… con su pareja… No, espera, que lo he contado mal.',
        va: 'toni-3',
        replica: { habla: 'Toni', texto: 'Lo has contado fatal y me ha encantado.' },
      },
    ],
  },
  {
    id: 'toni-3',
    fondo: 'bar',
    imagen: 'peep-91',
    paginas: [{ habla: 'Toni', texto: 'Me caes bien. Tan bien que te voy a presentar a mi bigote. Bigote, aquí una persona estupenda. Persona estupenda, el bigote.' }],
    opciones: [
      { texto: 'Encantad{o|a}. ¿Y el bigote besa bien o solo hace cosquillas?', va: 'toni-4' },
      { texto: 'Hola, bigote. ¿A tu dueño también le gusta acercarse tanto?', va: 'toni-4' },
      { texto: '¡Paco, tres chupitos de orujo para este, que con el tercero se deja!', va: 'toni-calabazas', etiquetas: ['presiona'] },
    ],
  },
  {
    id: 'toni-4',
    fondo: 'bar',
    imagen: 'peep-91',
    paginas: [
      'Toni se pone muy serio, cosa que le dura dos segundos.',
      { habla: 'Toni', texto: 'Hace cosquillas. Te lo puedo demostrar, pero aquí no, que aquí me conoce hasta la del pueblo de al lado. Vivo encima del bar de abajo. ¿Bajamos?' },
    ],
    opciones: [
      { texto: 'Bajamos. Trae las pipas.', va: 'toni-bueno' },
      { texto: 'Demuéstramelo despacito.', va: 'toni-bueno' },
      { ...volver('Uy, me voy ya, que mañana hay misa.'), replica: { habla: 'Toni', texto: '¡Pues reza por mí, que me quedo sin plan!' } },
    ],
  },
  {
    id: 'toni-fuera',
    fondo: 'bar',
    imagen: 'peep-91',
    paginas: ['A Toni se le apaga la sonrisa medio segundo. Luego se gira hacia sus amigos y se ríe con ellos. Se ríe muy fuerte. No es contigo.'],
    opciones: [volver(), { texto: '«¡Que era broma, hombre! Venga, dame pipas.» Y le quitas la bolsa.', va: 'toni-calabazas', etiquetas: ['presiona'] }],
  },
  {
    id: 'toni-bueno',
    fondo: 'portal',
    imagen: 'peep-91',
    paginas: [
      'En el portal, Toni te demuestra lo de las cosquillas. En el cuello, en la oreja y en un sitio que no te esperabas. Te ríes. Él se ríe. Luego ya nadie se ríe, porque estáis muy ocupados.',
      'Te sube contra la pared con una facilidad que no le conocías, y sus manos, grandes y calientes, se cuelan por debajo de tu ropa como si llevaran toda la noche esperando turno.',
      { habla: 'Toni', texto: 'Las llaves están en el bolsillo de las pipas.' },
      'Metes la mano. Sacas pipas. La vuelves a meter. Más pipas. ¿Cuántas pipas lleva este hombre?',
    ],
    final: {
      tipo: 'bueno',
      con: 'toni',
      titular: 'TONI DEMUESTRA LO DEL BIGOTE',
      remate: 'Las cosquillas eran verdad. Las pipas aparecieron hasta en la cama. Ya tenéis plan para las fiestas del pueblo.',
    },
  },
  {
    id: 'toni-calabazas',
    fondo: 'bar',
    imagen: 'peep-91',
    paginas: [
      'A Toni se le borra la sonrisa por primera vez en toda la noche.',
      { habla: 'Toni', texto: 'Eso en mi pueblo no se hace. Y aquí tampoco.' },
      'Le regala la bolsa de pipas a Rober y se va a la pista con un grupo de jubilados que le recibe como a un héroe.',
    ],
    final: {
      tipo: 'calabazas',
      con: 'toni',
      titular: 'TONI TE DEJA SIN PIPAS',
      remate: 'Sin ligue, sin pipas y sin el respeto de la tercera edad. Pleno.',
    },
  },

  // ---------------------------------------------------------------------------
  // Cierre: la tercera ronda sin final
  // ---------------------------------------------------------------------------
  {
    id: CIERRE,
    fondo: 'bar',
    imagen: 'peep-10',
    paginas: [
      'Se encienden las luces. Todo el mundo tiene peor cara de la que creía.',
      { habla: 'Paco', texto: '¡Cerramos, señores! ¡Y esta no es la penúltima: es la última de verdad!' },
    ],
    opciones: [
      { texto: 'Ayudar a Paco a recoger.', va: 'camarero' },
      { texto: 'Esperar a que Rober acabe el turno.', va: 'final-portero' },
      { texto: 'Irte a casa con la cabeza bien alta.', va: 'final-solo' },
    ],
  },
  {
    id: 'camarero',
    fondo: 'bar',
    imagen: 'peep-10',
    paginas: [
      'Pasas la fregona mientras Paco cuenta la caja. A las cuatro y media, entre vasos y olor a lejía, Paco te mira por encima de las gafas.',
      { habla: 'Paco', texto: 'Tienes buena mano con la fregona. ¿Te gustan los sitios tranquilos? Conozco uno donde no hay que fregar. Se llama mi sofá. Si te apetece, claro.' },
    ],
    opciones: [
      { texto: '¿Tu sofá tiene manta? Pues apaga las luces.', va: 'final-camarero' },
      {
        texto: 'Gracias, Paco, pero hoy me voy a casa.',
        va: 'final-solo',
        replica: { habla: 'Paco', texto: 'Pues nada. Llévate un chicle, que lo vas a necesitar.' },
      },
    ],
  },
  {
    id: 'final-camarero',
    fondo: 'bar',
    imagen: 'peep-10',
    paginas: [
      'Paco apaga las luces, cuelga el delantal y te da la chaqueta como un caballero de los de antes. Te pones colorad{o|a}. Él también.',
      'Por el camino te cuenta su vida, la de su ex y la de la máquina de discos. En el portal te besa con mucho más arte del que tiraba las cañas.',
    ],
    final: {
      tipo: 'cierre',
      titular: 'LIGAS… CON EL QUE FREGABA',
      remate: 'No era el plan. Pero el sofá es comodísimo y Paco hace unas tostadas de quitar el hipo.',
    },
  },
  {
    id: 'final-portero',
    fondo: 'bar',
    imagen: 'peep-47',
    paginas: [
      'Rober baja la persiana y descruza los brazos por primera vez en toda la noche.',
      { habla: 'Rober', texto: '¿Una caña en el de enfrente? Invito yo, que hoy he aguantado a cuarenta como tú.' },
      'En el de enfrente, Rober te enseña fotos de su perro, te cuenta su vida y te explica las tres reglas del buen portero. A las seis sois íntimos.',
    ],
    final: {
      tipo: 'cierre',
      titular: 'DE CAÑAS CON EL PORTERO',
      remate: 'No has ligado. Pero ahora tienes un amigo que te cuela en todos los bares de la ciudad.',
    },
  },
  {
    id: 'final-solo',
    fondo: 'portal',
    imagen: null,
    paginas: [
      'Sales sol{o|a} a la calle. El frío te recuerda que no llevas chaqueta y la farola, que tampoco llevas compañía.',
      'En el portal de enfrente, una pareja no atina con la llave. Suspiras. Te compras un kebab.',
    ],
    final: {
      tipo: 'cierre',
      titular: 'SOL{O|A}, PERO CON KEBAB',
      remate: 'Mañana dirás que fue una noche tranquila. El kebab sabe la verdad.',
    },
  },
];

/** Los creditos de las imagenes, tal cual los pide assets/ultima-ronda/CREDITOS.md. */
export const CREDITOS = [
  'Fondos: «Visual Novel Backgrounds» de ani mosity (queenofzan.itch.io/visual-novel-backgrounds), licencia CC BY 3.0 (creativecommons.org/licenses/by/3.0). Recortados y reescalados.',
  'Personajes: Open Peeps de Pablo Stanley (openpeeps.com), CC0.',
  'Historia y personajes inventados. Cualquier parecido con tu última noche es pura casualidad.',
];

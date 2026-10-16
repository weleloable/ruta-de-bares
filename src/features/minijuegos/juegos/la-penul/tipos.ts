/**
 * Tipos del guion de La Penul. El guion es DATOS (guion.ts); quien lo recorre
 * es el motor (motor.ts). Sin importaciones: los tests lo cargan tal cual.
 */

/** Genero de quien juega: hombre o mujer. Se asigna al azar al empezar. */
export type Genero = 'h' | 'm';

/**
 * Texto con variantes de genero: `{o|a}` se lee "o" si juegas de hombre y "a"
 * si de mujer ("cansad{o|a}"). Vale para frases enteras: `{Eres un hombre.|Eres
 * una mujer.}`. Un lado puede ir vacio ("un{|a}"). Sin llaves ni barras sueltas.
 */
export type Texto = string;

/** Una pagina: narracion (sin `habla`) o lo que dice alguien. */
export type Pagina = Texto | { habla: string; texto: Texto };

/** Lo que una opcion puede llevar marcado. 'presiona': insistir, agobiar, mentir o intentar emborrachar. */
export type Etiqueta = 'presiona';

export type Opcion = {
  texto: Texto;
  /** Nodo al que lleva. */
  va: string;
  /** Lo que contesta alguien ANTES de las paginas del nodo de destino. */
  replica?: Pagina;
  etiquetas?: Etiqueta[];
  /** Pasa una ronda: se vuelve a la barra a por otra. */
  ronda?: true;
  /** Desde la barra: con quien se va a hablar (luego sale tachado). */
  persona?: PersonaId;
};

export type PersonaId = 'vane' | 'carmela' | 'lola' | 'bruno' | 'inigo' | 'toni';
export type SecundarioId = 'paco' | 'rober';

/** Imagenes que se pintan (las genera scripts/generar-la-penul.py en assets/la-penul/). */
export type Fondo = 'bar' | 'portal';
export type Imagen = 'peep-10' | 'peep-17' | 'peep-47' | 'peep-48' | 'peep-61' | 'peep-91' | 'peep-94' | 'peep-96';

export type Final = {
  tipo: 'bueno' | 'calabazas' | 'cierre';
  /** Titular de portada de revista. */
  titular: Texto;
  /** La ultima frase, con gracia. */
  remate: Texto;
  /** Con quien es el final (solo buenos y calabazas). */
  con?: PersonaId;
};

export type Nodo = {
  id: string;
  fondo: Fondo;
  /** Quien sale en pantalla (null: nadie, solo el fondo). */
  imagen: Imagen | null;
  paginas: Pagina[];
  opciones?: Opcion[];
  final?: Final;
  /** La barra: se pinta como una cuadricula de caras y no como botones de texto. */
  barra?: true;
};

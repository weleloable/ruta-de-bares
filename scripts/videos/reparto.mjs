/**
 * El reparto y el escenario de los videos: quien hay en la ruta, que bares
 * tiene y en que punto de la noche esta cada cual. Todo inventado; los bares
 * son los del catalogo real (`catalog_bars`, sembrado por la 0036).
 *
 * Las cuentas son de PRUEBA y solo existen en el Supabase local que levanta
 * `grabar.mjs` (dominio .test, que no resuelve en internet).
 */

export const CLAVE_DEMO = 'demo-ruta-2026';
export const correo = (nombre) => `${nombre.toLowerCase()}@demo.test`;

export const ADMIN = { nombre: 'LaOrganizacion' };

/** Protagonista de las demos de Perfil, Ruta/Sellos, La Caña y Juegos. */
export const PROTA = 'Marta';

/** Quien se da de alta EN el video de Crear cuenta: no existe antes de grabar. */
export const NUEVA = { nombre: 'Pablo', correo: 'pablo@demo.test' };

/**
 * Gente de la ruta. `cana`: frase y etiquetas (ids de match_tags, 0030).
 * `leGustaProta`: ya le ha dado Me gusta a Marta (al devolverselo en la demo
 * sale la conexion). Las relaciones con Marta se montan en semilla.mjs.
 */
export const GENTE = [
  {
    nombre: 'Marta',
    avatar: { piel: 1, pelo: 'largo', colorPelo: 'castano', fondo: 0, camiseta: '#B5502C', pendientes: true },
    cana: { bio: 'Vengo por los sellos y me quedo por las bravas. Si cantas en el Karaoke, te invito.', tags: ['etiqueta-8', 'etiqueta-5', 'etiqueta-22'] },
  },
  {
    nombre: 'Dani',
    avatar: { piel: 2, pelo: 'corto', colorPelo: 'negro', fondo: 3, camiseta: '#3D5A80', barba: true },
    cana: { bio: 'Primera ruta y ya tengo la libreta llena de notas de cata. Pregúntame por las IPA.', tags: ['etiqueta-9', 'etiqueta-20', 'etiqueta-16'] },
  },
  {
    nombre: 'Lucia',
    avatar: { piel: 3, pelo: 'rizado', colorPelo: 'negro', fondo: 6, camiseta: '#F2C14E' },
    cana: { bio: 'Experta en encontrar mesa libre en bares llenos. Tengo un sexto sentido.', tags: ['etiqueta-15', 'etiqueta-18', 'etiqueta-10'] },
  },
  {
    nombre: 'Sergio',
    avatar: { piel: 0, pelo: 'flequillo', colorPelo: 'castano', fondo: 2, camiseta: '#6B4226', gafas: true },
    cana: { bio: 'Llevo el récord de La Caña Perfecta. Acepto retos.', tags: ['etiqueta-26', 'etiqueta-30', 'etiqueta-21'] },
  },
  {
    nombre: 'Paula',
    avatar: { piel: 1, pelo: 'mono', colorPelo: 'pelirrojo', fondo: 7, camiseta: '#2F6B5E', pendientes: true },
    cana: { bio: 'Clara con limón y sin pedir perdón. Hoy vengo a por la medalla.', tags: ['etiqueta-28', 'etiqueta-27', 'etiqueta-14'] },
  },
  {
    nombre: 'Javi',
    avatar: { piel: 4, pelo: 'calvo', colorPelo: 'negro', fondo: 1, camiseta: '#22181A', barba: true },
    cana: { bio: 'Si hay bocadillo, me apunto. Si no hay, también.', tags: ['etiqueta-3', 'etiqueta-4', 'etiqueta-11'] },
  },
  {
    nombre: 'Irene',
    avatar: { piel: 0, pelo: 'coleta', colorPelo: 'rubio', fondo: 5, camiseta: '#D96C5F' },
    cana: { bio: 'Corro por las mañanas para poder tomarme todas las cañas de la noche.', tags: ['etiqueta-23', 'etiqueta-29', 'etiqueta-24'] },
  },
  {
    nombre: 'Carlos',
    avatar: { piel: 2, pelo: 'corto', colorPelo: 'castano', fondo: 4, camiseta: '#E9D8A6' },
    cana: { bio: 'Vengo con mi grupo pero hago amigos en cada barra.', tags: ['etiqueta-10', 'etiqueta-9', 'etiqueta-13'] },
  },
  {
    nombre: 'Nerea',
    avatar: { piel: 1, pelo: 'largo', colorPelo: 'rubio', fondo: 2, camiseta: '#7C9CBF' },
    cana: { bio: 'Otaku, swiftie y fan de las rutas con medalla al final.', tags: ['etiqueta-17', 'etiqueta-18', 'etiqueta-19'] },
  },
  {
    nombre: 'Alex',
    avatar: { piel: 3, pelo: 'rizado', colorPelo: 'castano', fondo: 0, camiseta: '#5A3825', gafas: true },
    cana: { bio: 'Tengo un podcast de cerveza artesana. Sí, lo escucha mi madre.', tags: ['etiqueta-21', 'etiqueta-16', 'etiqueta-2'] },
  },
];

/** Nombres del catalogo, en el orden de la ruta. */
export const PARADAS = ['Quinto Tapon', 'El Hidalgo', 'Astures', 'La Oveja Negra', 'Lola', "Wheelan's", 'Green Factory', 'Karaoke'];

export const RUTA = {
  nombre: 'Ruta Compostelana Alcalá',
  descripcion: 'Ocho bares, una credencial y una medalla para quien la complete.',
};

/**
 * Ventanas de cada parada, en minutos desde AHORA (la hora de grabar). Las
 * tres primeras ya estan selladas por Marta; la cuarta esta abierta (se sella
 * en el video); las siguientes abren mas tarde ("abre en..."). Relativas a la
 * hora de grabar porque claim_stamp mira el now() de Postgres.
 */
export const VENTANAS = [
  [-180, -100],
  [-110, -40],
  [-60, 45],
  [-20, 100],
  [70, 150],
  [130, 210],
  [190, 270],
  [250, 360],
];
export const SELLADAS_POR_PROTA = 3;
export const PARADA_EN_VIVO = 3;

/**
 * Parada de FOTO (0060): sale en el mapa con su horario pero no se sella. Va
 * entre el 6.º y el 7.º bar. Los indices de arriba (VENTANAS, PARADA_EN_VIVO...)
 * son de los BARES; esta no cuenta en ellos, igual que en la app.
 */
export const PARADA_FOTO = {
  nombre: 'Banco del Quijote',
  // Calle Mayor, frente a la casa natal de Cervantes: el banco con don Quijote y
  // Sancho. Posicion aproximada; en el recorrido cae entre Wheelan's y Green Factory.
  lat: 40.48268,
  lng: -3.36725,
  despuesDelBar: 5,
  ventana: [200, 230],
};

/** Sorteo de la ruta (0061): entra quien sella todos los bares. */
export const SORTEO = { premio: 'Camiseta de la ruta' };

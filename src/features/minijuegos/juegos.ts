import { enviarCerveza, enviarNota } from './api';
import { CanaPerfecta } from './juegos/cana/CanaPerfecta';
import { ConducesTu } from './juegos/conduces/ConducesTu';
import { RankingConduces } from './juegos/conduces/RankingConduces';
import { CongaCervecera } from './juegos/conga/CongaCervecera';
import { DetalleConga } from './juegos/conga/DetalleConga';
import { MaestroCervecero } from './juegos/maestro/MaestroCervecero';
import { recetaDesdeResultado } from './juegos/maestro/publicar';
import { BarmanExpress } from './juegos/barman/BarmanExpress';
import { DetalleBarman } from './juegos/barman/DetalleBarman';
import { ID_BARMAN } from './juegos/barman/modelo';
import { ID_LA_PENUL, TITULO_LA_PENUL } from './juegos/la-penul/guion';
import { LaPenul } from './juegos/la-penul/LaPenul';
import { DetalleParejas } from './juegos/parejas/DetalleParejas';
import { ID_PAREJAS, notaValida, TIEMPO_MAXIMO } from './juegos/parejas/modelo';
import { ParejasDeBarra } from './juegos/parejas/ParejasDeBarra';
import { DetalleQuijote } from './juegos/quijote/DetalleQuijote';
import { ID_QUIJOTE } from './juegos/quijote/modelo';
import { QuijoteCervecero } from './juegos/quijote/QuijoteCervecero';
import { DetalleTapon } from './juegos/tapon/DetalleTapon';
import { ID_TAPON, TaponAlVuelo } from './juegos/tapon/TaponAlVuelo';
import { DetalleQuiz, QuienQuiereSerCervecero } from '../quiz/QuienQuiereSerCervecero';
import { ID_JUEGO as ID_QUIZ } from '../quiz/config';
import type { JuegoDef } from './tipos';

/**
 * Los juegos de siempre, en el orden en que se ven. Anadir uno es crear su
 * componente en `juegos/<id>/` y sumarlo AL FINAL DE ESTA LISTA: nada mas de la
 * app se entera. La Penul no va aqui: va aparte, abajo, y siempre la ultima.
 */
const JUEGOS_DE_SIEMPRE: readonly JuegoDef[] = [
  {
    id: 'cana-perfecta',
    titulo: 'La Caña Perfecta',
    descripcion: 'Tira la caña hasta arriba, con dos dedos de espuma.',
    icono: 'beer',
    Componente: CanaPerfecta,
    ranking: true,
    enviar: async (rutaId, r) => {
      await enviarNota(rutaId, r.juego, r.puntuacion);
    },
  },
  {
    id: 'maestro-cervecero',
    titulo: 'Maestro Cervecero',
    descripcion: 'Fabrica tu propia cerveza en cuatro pasos.',
    icono: 'flask',
    Componente: MaestroCervecero,
    cervezas: true,
    enviar: async (rutaId, r) => {
      const receta = recetaDesdeResultado(r);
      if (!receta) throw new Error('No se pudo leer la receta de esta cerveza.');
      await enviarCerveza(rutaId, receta);
    },
  },
  {
    id: 'conga-cervecera',
    titulo: 'La Conga Cervecera',
    descripcion: 'Guía la conga por Alcalá y recluta amigos con cada jarra.',
    icono: 'musical-notes',
    Componente: CongaCervecera,
    Detalle: DetalleConga,
    // Ranking por ruta desde la 0039 (tope de 15000 puntos, ver PUNTUACION_MAXIMA).
    ranking: true,
    enviar: async (rutaId, r) => {
      await enviarNota(rutaId, r.juego, r.puntuacion);
    },
  },
  {
    id: 'conduces-tu',
    titulo: '¿Conduces tú?',
    descripcion: 'Elige cuántas cañas llevas e intenta llegar lejos. Spoiler: no.',
    icono: 'car',
    Componente: ConducesTu,
    pantallaCompleta: true,
    // Su ranking es por NIVEL de cañas (0041): lo guarda y lo ensena el propio juego,
    // y desde el menu se ve con su propio componente.
    resultadoPropio: true,
    RankingPropio: RankingConduces,
  },
  {
    // Preguntas de cerveza al estilo concurso (logica pura en features/quiz/). Ranking por
    // ruta desde la 0055; desde la 0061, un punto por acierto (0 a 5) y desempata el tiempo.
    id: ID_QUIZ,
    titulo: '¿Quién quiere ser cervecero?',
    descripcion: 'Cinco preguntas de cerveza, cada una más difícil. Con comodines.',
    icono: 'help-circle',
    Componente: QuienQuiereSerCervecero,
    Detalle: DetalleQuiz,
    ranking: true,
    enviar: async (rutaId, r) => {
      await enviarNota(rutaId, r.juego, r.puntuacion, typeof r.detalles?.ms === 'number' ? r.detalles.ms : 0);
    },
  },
  {
    // Tirachinas de chapas (logica pura en juegos/tapon/modelo.ts). Ranking por ruta desde
    // la 0056 (tope de 1250 puntos, ver PUNTUACION_MAXIMA).
    id: ID_TAPON,
    titulo: 'Tapón al Vuelo',
    descripcion: 'Abre botellines y cuela la chapa. Diez tiros, con viento.',
    icono: 'locate',
    Componente: TaponAlVuelo,
    // En horizontal y a pantalla completa (con el movil en vertical se pinta tumbado).
    pantallaCompleta: true,
    Detalle: DetalleTapon,
    ranking: true,
    enviar: async (rutaId, r) => {
      await enviarNota(rutaId, r.juego, r.puntuacion);
    },
  },
  {
    // Memoria de 4 x 4 (logica pura en juegos/parejas/modelo.ts). La nota es el TIEMPO y
    // MENOS es mejor: el primero asi (JUEGOS_MENOS_ES_MEJOR en nota.ts, 0070 en SQL).
    id: ID_PAREJAS,
    titulo: 'Parejas de Barra',
    descripcion: 'Encuentra las 8 parejas lo más rápido que puedas.',
    icono: 'timer',
    Componente: ParejasDeBarra,
    Detalle: DetalleParejas,
    ranking: true,
    enviar: async (rutaId, r) => {
      // El servidor lo rechazaria igual (0070), pero con un mensaje que nadie entiende.
      if (!notaValida(r.puntuacion)) {
        throw new Error(
          r.puntuacion > TIEMPO_MAXIMO
            ? `más de ${TIEMPO_MAXIMO / 60} minutos no cuenta para la ruta.`
            : 'ese tiempo no es posible en una partida de verdad.',
        );
      }
      await enviarNota(rutaId, r.juego, r.puntuacion);
    },
  },
  {
    // Endless runner en 3D, en vertical (logica pura en juegos/quijote/modelo.ts). Ranking
    // por ruta desde la 0071: metros + jarras + gigantes derribados. Abierto a todo el mundo
    // (antes `enPruebas`, solo admins; ese mecanismo sigue en visibilidad.ts para otros juegos).
    id: ID_QUIJOTE,
    titulo: 'Don Quijote Cervecero',
    descripcion: 'Galopa por La Mancha, esquiva y embiste a los gigantes.',
    icono: 'flag',
    Componente: QuijoteCervecero,
    pantallaCompleta: true,
    Detalle: DetalleQuijote,
    ranking: true,
    enviar: async (rutaId, r) => {
      await enviarNota(rutaId, r.juego, r.puntuacion);
    },
  },
  {
    // Eres el camarero (logica pura en juegos/barman/modelo.ts): 20 pedidos, la carta crece con
    // la noche. Ranking por ruta y podio de casas desde la 0073 (tope PUNTUACION_MAXIMA, entero,
    // mas es mejor). Vertical y a pantalla completa: dentro del menu no cabia.
    id: ID_BARMAN,
    titulo: 'Barman Express',
    descripcion: 'Eres el camarero: sirve 20 pedidos antes de que se les acabe la paciencia.',
    icono: 'wine',
    Componente: BarmanExpress,
    pantallaCompleta: true,
    Detalle: DetalleBarman,
    ranking: true,
    enviar: async (rutaId, r) => {
      await enviarNota(rutaId, r.juego, r.puntuacion);
    },
  },
];

/**
 * La Penul, la historia para adultos (0072). Va APARTE y SIEMPRE LA ULTIMA: un
 * juego nuevo se suma al final de JUEGOS_DE_SIEMPRE y queda penultimo. Aunque
 * alguien la meta en medio de la lista, juegosDelMenu (visibilidad.ts) la manda
 * al final igual; tests/la-penul-cableado.test.ts y visibilidad.test.ts lo vigilan.
 */
const JUEGO_LA_PENUL: JuegoDef = {
  // Historia interactiva para adultos (guion en juegos/la-penul/guion.ts). Sin nota, sin
  // ranking y sin puntos de casa: se encarga de su propio final. La ven los admins siempre y
  // el resto solo si la ruta la enciende (0072). Va SIEMPRE la ultima (visibilidad.ts).
  id: ID_LA_PENUL,
  titulo: TITULO_LA_PENUL,
  descripcion: 'Una noche, tres rondas y muchas ganas. Para mayores de edad.',
  icono: 'flame',
  Componente: LaPenul,
  pantallaCompleta: true,
  resultadoPropio: true,
  visibilidad: 'la-penul',
};

/** Lo que pinta el menu: los de siempre y, la ultima, La Penul (si se puede ver: visibilidad.ts). */
export const JUEGOS: readonly JuegoDef[] = [...JUEGOS_DE_SIEMPRE, JUEGO_LA_PENUL];

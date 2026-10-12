import { enviarCerveza, enviarNota } from './api';
import { CanaPerfecta } from './juegos/cana/CanaPerfecta';
import { ConducesTu } from './juegos/conduces/ConducesTu';
import { RankingConduces } from './juegos/conduces/RankingConduces';
import { CongaCervecera } from './juegos/conga/CongaCervecera';
import { DetalleConga } from './juegos/conga/DetalleConga';
import { MaestroCervecero } from './juegos/maestro/MaestroCervecero';
import { recetaDesdeResultado } from './juegos/maestro/publicar';
import { DetalleTapon } from './juegos/tapon/DetalleTapon';
import { ID_TAPON, TaponAlVuelo } from './juegos/tapon/TaponAlVuelo';
import { DetalleQuiz, QuienQuiereSerCervecero } from '../quiz/QuienQuiereSerCervecero';
import { ID_JUEGO as ID_QUIZ } from '../quiz/config';
import type { JuegoDef } from './tipos';

/**
 * Lista de juegos del menu, en el orden en que se ven. Anadir uno es crear su
 * componente en `juegos/<id>/` y sumarlo aqui: nada mas de la app se entera.
 */
export const JUEGOS: readonly JuegoDef[] = [
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
];

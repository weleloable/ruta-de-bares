import { enviarCerveza, enviarNota } from './api';
import { CanaPerfecta } from './juegos/cana/CanaPerfecta';
import { ConducesTu } from './juegos/conduces/ConducesTu';
import { RankingConduces } from './juegos/conduces/RankingConduces';
import { CongaCervecera } from './juegos/conga/CongaCervecera';
import { DetalleConga } from './juegos/conga/DetalleConga';
import { MaestroCervecero } from './juegos/maestro/MaestroCervecero';
import { recetaDesdeResultado } from './juegos/maestro/publicar';
import { DetalleOcupado } from './juegos/ocupado/DetalleOcupado';
import { Ocupado } from './juegos/ocupado/Ocupado';
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
    // Juego de Godot con su propio repo y su propia web (github.com/weleloable/ocupado):
    // la app lo carga en un iframe (web) o lo abre en el navegador (nativo). Ver juegos/ocupado/.
    // Solo record local: un ranking por ruta pediria una migracion (minigame_scores solo acepta
    // los juegos que lista).
    id: 'ocupado',
    titulo: 'Ocupado',
    descripcion: 'Escápate del baño del bar antes de que se caliente tu cerveza.',
    icono: 'key',
    Componente: Ocupado,
    Detalle: DetalleOcupado,
  },
];

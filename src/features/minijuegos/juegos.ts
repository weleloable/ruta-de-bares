import { enviarCerveza, enviarNota } from './api';
import { CanaPerfecta } from './juegos/cana/CanaPerfecta';
import { MaestroCervecero } from './juegos/maestro/MaestroCervecero';
import { recetaDesdeResultado } from './juegos/maestro/publicar';
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
];

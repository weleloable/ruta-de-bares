import { CanaPerfecta } from './juegos/cana/CanaPerfecta';
import type { JuegoDef } from './tipos';

/**
 * Lista de juegos del menu, en el orden en que se ven. Anadir uno es crear su
 * componente en `juegos/<id>/` y sumarlo aqui: nada mas de la app se entera.
 */
export const JUEGOS: readonly JuegoDef[] = [
  {
    id: 'cana-perfecta',
    titulo: 'La Caña Perfecta',
    descripcion: 'Tira la caña hasta la línea, con dos dedos de espuma.',
    icono: 'beer',
    Componente: CanaPerfecta,
  },
];

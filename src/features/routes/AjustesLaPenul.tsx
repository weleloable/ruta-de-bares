import { Text } from 'react-native';

import { Card } from '../../components/ui';
import { typography } from '../../lib/theme';
import type { RouteRow } from '../../types/database';
import { Casilla } from '../match/piezas';

/**
 * El interruptor de La Penul en el editor de la ruta (0071). Apagado, solo la
 * ven los admins (con la etiqueta "Solo admins"); encendido, todo el mundo de
 * la ruta, y la primera de la lista. Se guarda al tocar, como La Caña.
 *
 * Es una sorpresa, no un secreto: el texto del juego va en la web publicada.
 */
export function AjustesLaPenul({
  ruta,
  ocupado,
  onCambiar,
}: {
  ruta: RouteRow;
  ocupado: boolean;
  onCambiar(cambio: Pick<RouteRow, 'la_penul_visible'>): void;
}) {
  return (
    <Card>
      <Text style={typography.sectionTitle}>La Penul</Text>
      <Text style={typography.muted}>
        La historia picante del bar, para mayores de edad. Apagado, solo la veis los administradores. Encendido, sale la
        primera en Juegos para toda la gente de esta ruta.
      </Text>
      <Casilla
        marcada={ruta.la_penul_visible === true}
        desactivada={ocupado}
        texto="La Penul visible para todos"
        onCambiar={(marcada) => onCambiar({ la_penul_visible: marcada })}
      />
    </Card>
  );
}

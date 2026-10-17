import { StyleSheet, Text, View } from 'react-native';

import { colors, space, typography } from '../../../../lib/theme';
import type { PropsDetalle } from '../../tipos';
import { mensajeFinal } from './recorrido';

/**
 * Lo que Don Quijote Cervecero anade a la tarjeta final: el mensaje con gracia
 * y de donde salen los puntos (la puntuacion son los metros, mas las jarras y
 * lo derribado). El record y el "¡Nuevo récord!" los pone el menu.
 */
export function DetalleQuijote({ resultado }: PropsDetalle) {
  const metros = Number(resultado.detalles?.metros ?? 0);
  const jarras = Number(resultado.detalles?.jarras ?? 0);
  const molinos = Number(resultado.detalles?.molinos ?? 0);
  return (
    <View style={styles.raiz}>
      <Text style={styles.mensaje}>{mensajeFinal({ metros, jarras, molinos })}</Text>
      <Text style={typography.muted}>
        {metros.toLocaleString('es-ES')} m · {jarras} {jarras === 1 ? 'jarra' : 'jarras'} · {molinos}{' '}
        {molinos === 1 ? 'gigante derribado' : 'gigantes derribados'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', gap: space.xs },
  mensaje: { fontSize: 17, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
});

import { StyleSheet, Text, View } from 'react-native';

import { colors, space, typography } from '../../../../lib/theme';
import type { PropsDetalle } from '../../tipos';
import { mensajeFinal, textoAmigos } from './modelo';

/** Lo que La Conga Cervecera anade a la tarjeta final del menu: amigos, tiempo y un mensaje. */
export function DetalleConga({ resultado }: PropsDetalle) {
  const amigos = Number(resultado.detalles?.amigos ?? 0);
  const segundos = Number(resultado.detalles?.segundos ?? 0);
  return (
    <View style={styles.raiz}>
      <Text style={styles.mensaje}>{mensajeFinal(amigos)}</Text>
      <Text style={typography.muted}>
        {textoAmigos(amigos)} en la conga · {segundos} s
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', gap: space.xs },
  mensaje: { fontSize: 17, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
});

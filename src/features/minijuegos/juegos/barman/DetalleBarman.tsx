import { StyleSheet, Text, View } from 'react-native';

import { colors, space, typography } from '../../../../lib/theme';
import type { PropsDetalle } from '../../tipos';
import { mensajeFinal, PEDIDOS } from './modelo';

/** La tarjeta de fin de Barman Express: servidos, mejor racha, tiradas y la bebida que mas se resistio. */
export function DetalleBarman({ resultado }: PropsDetalle) {
  const servidos = Number(resultado.detalles?.servidos ?? 0);
  const racha = Number(resultado.detalles?.mejorRacha ?? 0);
  const tiradas = Number(resultado.detalles?.tiradas ?? 0);
  const resistida = String(resultado.detalles?.resistida ?? '');
  return (
    <View style={styles.raiz}>
      <Text style={styles.mensaje}>{mensajeFinal(servidos)}</Text>
      <Text style={typography.muted}>
        {servidos} de {PEDIDOS} pedidos servidos · mejor racha {racha}
      </Text>
      <Text style={typography.muted}>
        {tiradas === 0 ? 'Ninguna bebida a la basura' : `${tiradas} ${tiradas === 1 ? 'bebida' : 'bebidas'} a la basura`}
        {resistida ? ` · la que más se te resistió: ${resistida.toLowerCase()}` : ''}
      </Text>
      <Text style={styles.creditos}>Clientes: Open Peeps de Pablo Stanley (openpeeps.com), CC0.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', gap: space.xs },
  mensaje: { fontSize: 17, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
  creditos: { fontSize: 11, color: colors.inkFaint, textAlign: 'center' },
});

import { StyleSheet, Text, View } from 'react-native';

import { colors, space, typography } from '../../../../lib/theme';
import type { PropsDetalle } from '../../tipos';
import { formatoTiempo, NOMBRE_FINAL, type FinalOcupado } from './mensaje';

/** Lo que Ocupado anade a la tarjeta final del menu: el final, la cerveza, el tiempo y las pistas. */
export function DetalleOcupado({ resultado }: PropsDetalle) {
  const d = resultado.detalles ?? {};
  const final = (d.final === 'flood' ? 'flood' : 'door') as FinalOcupado;
  const temperatura = Number(d.temperatura ?? 0);
  const pistas = Number(d.pistas ?? 0);
  return (
    <View style={styles.raiz}>
      <Text style={styles.final}>{NOMBRE_FINAL[final]}</Text>
      <Text style={typography.muted}>
        Cerveza a {String(temperatura).replace('.', ',')} °C · {formatoTiempo(Number(d.segundos ?? 0))} ·{' '}
        {pistas === 1 ? '1 pista' : `${pistas} pistas`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', gap: space.xs },
  final: { fontSize: 17, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
});

import { StyleSheet, Text, View } from 'react-native';

import { colors, space, typography } from '../../../../lib/theme';
import type { PropsDetalle } from '../../tipos';
import { DIANAS, mensajeFinal, TIROS } from './modelo';

/** Lo que Tapon al Vuelo anade a la tarjeta final: aciertos, mejor racha y diana favorita. */
export function DetalleTapon({ resultado }: PropsDetalle) {
  const aciertos = Number(resultado.detalles?.aciertos ?? 0);
  const racha = Number(resultado.detalles?.mejorRacha ?? 0);
  const fav = DIANAS.find((d) => d.id === resultado.detalles?.favorita);
  return (
    <View style={styles.raiz}>
      <Text style={styles.mensaje}>{mensajeFinal(aciertos)}</Text>
      <Text style={typography.muted}>
        {aciertos} de {TIROS} dentro · mejor racha {racha}
      </Text>
      <Text style={typography.muted}>{fav ? `Diana favorita: ${fav.nombre.toLowerCase()}` : 'Ninguna diana favorita (aún)'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', gap: space.xs },
  mensaje: { fontSize: 17, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
});

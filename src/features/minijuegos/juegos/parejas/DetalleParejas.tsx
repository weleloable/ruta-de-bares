import { StyleSheet, Text, View } from 'react-native';

import { colors, space, typography } from '../../../../lib/theme';
import type { PropsDetalle } from '../../tipos';
import { mensajeFinal, notaValida, TIEMPO_MAXIMO } from './modelo';

/** Lo que Parejas de Barra anade a la tarjeta final: intentos y fallos (el tiempo ya es la nota). */
export function DetalleParejas({ resultado }: PropsDetalle) {
  const intentos = Number(resultado.detalles?.intentos ?? 0);
  const fallos = Number(resultado.detalles?.fallos ?? 0);
  return (
    <View style={styles.raiz}>
      <Text style={styles.mensaje}>{mensajeFinal(fallos)}</Text>
      <Text style={typography.muted}>
        {intentos} {intentos === 1 ? 'intento' : 'intentos'} · {fallos} {fallos === 1 ? 'fallo' : 'fallos'}
      </Text>
      {notaValida(resultado.puntuacion) ? null : (
        <Text style={typography.muted}>Más de {TIEMPO_MAXIMO / 60} minutos: esta partida no cuenta para la ruta.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', gap: space.xs },
  mensaje: { fontSize: 17, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
});

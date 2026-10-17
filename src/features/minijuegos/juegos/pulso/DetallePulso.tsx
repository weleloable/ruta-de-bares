import { StyleSheet, Text, View } from 'react-native';

import { colors, space, typography } from '../../../../lib/theme';
import type { PropsDetalle } from '../../tipos';

/**
 * La tarjeta de fin de Pulso de Camarero: el liquido salvado en cada ronda, la
 * bebida que mas se te resistio y cuantas has tirado. Los numeros salen de
 * `detalles` (los pone PulsoDeCamarero.tsx al terminar), en porcentaje con un
 * decimal: la NOTA es la de arriba, esto es solo para contarlo.
 */
export function DetallePulso({ resultado }: PropsDetalle) {
  const d = resultado.detalles ?? {};
  const pct = (clave: string) => `${Number(d[clave] ?? 0).toFixed(1).replace('.', ',')} %`;
  const tiradas = Number(d.tiradas ?? 0);
  const dificil = String(d.dificil ?? '');
  return (
    <View style={styles.raiz}>
      <Text style={styles.rondas}>
        Líquido salvado: {pct('ronda1')} · {pct('ronda2')} · {pct('ronda3')}
      </Text>
      <Text style={typography.muted}>
        {tiradas === 0 ? 'No has tirado ninguna bebida' : `Has tirado ${tiradas} ${tiradas === 1 ? 'bebida' : 'bebidas'}`}
        {dificil ? ` · la que más se te resistió: ${dificil}` : ''}
      </Text>
      <Text style={styles.creditos}>Clientes: Open Peeps de Pablo Stanley (openpeeps.com), CC0.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { alignItems: 'center', gap: space.xs },
  rondas: { fontSize: 15, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
  creditos: { fontSize: 11, color: colors.inkFaint, textAlign: 'center' },
});

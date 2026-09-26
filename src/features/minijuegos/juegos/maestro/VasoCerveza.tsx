import { StyleSheet, View } from 'react-native';

import { colors, radius } from '../../../../lib/theme';

/** Vaso de tubo con cerveza y corona de espuma. `color` es el del liquido (el de la malta). */
export function VasoCerveza({ color, alto = 130, ancho = 80 }: { color: string; alto?: number; ancho?: number }) {
  const espuma = alto * 0.16;
  return (
    <View style={[styles.vaso, { width: ancho, height: alto }]} accessibilityElementsHidden importantForAccessibility="no">
      <View style={[styles.liquido, { backgroundColor: color, top: espuma }]} />
      <View style={[styles.espuma, { height: espuma }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  vaso: {
    borderWidth: 3,
    borderTopWidth: 0,
    borderColor: colors.inkSoft,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    backgroundColor: colors.paperDeep,
    overflow: 'hidden',
  },
  liquido: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  espuma: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderBottomWidth: 2,
    borderBottomColor: colors.beerSoft,
  },
});

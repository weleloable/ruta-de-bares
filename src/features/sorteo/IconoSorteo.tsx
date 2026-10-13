import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { iconoDePremio } from './sorteo';

/**
 * El icono del sorteo, como un sello de la credencial: circulo de cerveza
 * clara con borde punteado de tinta y, dentro, el icono del PREMIO (camiseta,
 * cerveza, iman...; ver `iconoDePremio`, un regalo si no se reconoce). Si has
 * ganado, el sello va en rojo con un trofeo.
 */
export function IconoSorteo({
  tamano = 22,
  ganaste = false,
  premio = '',
}: {
  tamano?: number;
  ganaste?: boolean;
  premio?: string;
}) {
  const nombre = (ganaste ? 'trophy' : iconoDePremio(premio)) as keyof typeof Ionicons.glyphMap;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.sello,
        {
          width: tamano,
          height: tamano,
          borderRadius: tamano / 2,
          borderWidth: Math.max(1, Math.round(tamano / 18)),
        },
        ganaste ? styles.selloGanaste : null,
      ]}
    >
      <Ionicons name={nombre} size={Math.round(tamano * 0.56)} color={ganaste ? colors.white : colors.beerDark} />
    </View>
  );
}

const styles = StyleSheet.create({
  sello: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.beerSoft,
    borderColor: colors.beerDark,
    borderStyle: 'dashed',
  },
  selloGanaste: { backgroundColor: colors.stamp, borderColor: colors.white },
});

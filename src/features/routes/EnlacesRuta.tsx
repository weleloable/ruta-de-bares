import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { abrirEnlaceExterno } from '../../lib/abrirEnlace';
import { INSTAGRAM_URL, TELEGRAM_URL } from '../../lib/enlacesExternos';
import { colors, radius, space } from '../../lib/theme';

/**
 * Los dos enlaces de la ruta (Instagram y el grupo social), apilados en la
 * cabecera de Ruta, a la derecha del nombre. Antes estaban al pie de Sellos.
 * Rectangulos de esquinas redondeadas de 36 px de alto, marron (colors.inkSoft)
 * en el texto y en el icono; flexShrink 0 en la columna: si el nombre de la ruta
 * es largo se recorta el nombre, nunca los botones.
 */
function BotonEnlace({ titulo, icono, url }: { titulo: string; icono: 'logo-instagram' | 'paper-plane-outline'; url: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      onPress={() => abrirEnlaceExterno(url)}
      style={({ pressed }) => [styles.boton, pressed && styles.botonPulsado]}
    >
      <Ionicons name={icono} size={16} color={colors.inkSoft} />
      <Text style={styles.texto} numberOfLines={1}>
        {titulo}
      </Text>
    </Pressable>
  );
}

export function EnlacesRuta() {
  return (
    <View style={styles.columna}>
      <BotonEnlace titulo="@rutadebaresoficial" icono="logo-instagram" url={INSTAGRAM_URL} />
      <BotonEnlace titulo="Social" icono="paper-plane-outline" url={TELEGRAM_URL} />
    </View>
  );
}

const styles = StyleSheet.create({
  columna: { gap: 6, flexShrink: 0, alignItems: 'stretch' },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    height: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  botonPulsado: { backgroundColor: colors.paperDeep },
  texto: { fontSize: 12.5, fontWeight: '700', color: colors.inkSoft },
});

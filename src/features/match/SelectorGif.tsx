import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { colors, radius, space, typography } from '../../lib/theme';
import { GIFS } from './gifs';

/** Hoja inferior con el catalogo de GIFs. Tocar uno lo envia. */
export function SelectorGif({
  visible,
  onElegir,
  onCerrar,
}: {
  visible: boolean;
  onElegir(gifId: string): void;
  onCerrar(): void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar} accessibilityLabel="Cerrar" />
      <View style={styles.hoja}>
        <View style={styles.asa} />
        <ScrollView contentContainerStyle={styles.contenido}>
          <Text style={typography.sectionTitle}>Manda un GIF</Text>
          <View style={styles.rejilla}>
            {GIFS.map((gif) => (
              <View key={gif.id} style={styles.celda}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Enviar GIF ${gif.etiqueta}`}
                  onPress={() => onElegir(gif.id)}
                  style={({ pressed }) => [styles.opcion, pressed && styles.pulsada]}
                >
                  <Image source={gif.fuente} style={styles.gif} contentFit="cover" />
                  <Text style={styles.etiqueta} numberOfLines={1}>
                    {gif.etiqueta}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
          <Button title="Cerrar" variant="ghost" onPress={onCerrar} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(36, 26, 18, 0.45)' },
  hoja: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '75%',
    paddingBottom: space.lg,
  },
  asa: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginVertical: space.md,
  },
  contenido: { paddingHorizontal: space.lg, gap: space.md },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs },
  celda: { width: '50%', padding: space.xs },
  opcion: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  pulsada: { opacity: 0.75 },
  gif: { width: '100%', aspectRatio: 4 / 3 },
  etiqueta: { fontSize: 12, fontWeight: '700', color: colors.ink, padding: space.sm },
});

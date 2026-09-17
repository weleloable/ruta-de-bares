import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space, typography } from '../../lib/theme';
import { initials } from '../profile/initials';

/** Casilla de verificacion. No existe en ui.tsx y la app no la necesitaba hasta ahora. */
export function Casilla({
  marcada,
  onCambiar,
  texto,
  desactivada = false,
}: {
  marcada: boolean;
  onCambiar(marcada: boolean): void;
  texto: string;
  desactivada?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      // Sin etiqueta explicita, el icono de la marca (un caracter de la
      // fuente) se colaria en lo que lee el lector de pantalla.
      accessibilityLabel={texto}
      accessibilityState={{ checked: marcada, disabled: desactivada }}
      disabled={desactivada}
      onPress={() => onCambiar(!marcada)}
      style={styles.casilla}
    >
      <View style={[styles.caja, marcada && styles.cajaMarcada]}>
        {marcada ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
      </View>
      <Text style={typography.body}>{texto}</Text>
    </Pressable>
  );
}

export function ChipEtiqueta({
  texto,
  marcada = false,
  onPress,
  desactivada = false,
}: {
  texto: string;
  marcada?: boolean;
  onPress?: () => void;
  desactivada?: boolean;
}) {
  const contenido = <Text style={[styles.chipTexto, marcada && styles.chipTextoMarcado]}>{texto}</Text>;
  if (!onPress) return <View style={styles.chip}>{contenido}</View>;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcada, disabled: desactivada }}
      disabled={desactivada}
      onPress={onPress}
      style={[styles.chip, marcada && styles.chipMarcado, desactivada && styles.chipDesactivado]}
    >
      {contenido}
    </Pressable>
  );
}

/**
 * Foto de perfil o, sin foto, sus iniciales sobre un tono de la paleta (D9).
 * El tono sale del nombre y no es aleatorio: la misma persona tiene siempre el
 * mismo color en la grilla, en su ficha y en el chat.
 */
export function AvatarCana({
  nombre,
  foto,
  tamano,
  tamanoIniciales,
  redondo = true,
  style,
}: {
  nombre: string;
  foto: string | null;
  /** Lado en px. Sin el, el tamano lo pone `style` (p. ej. ancho 100% y aspectRatio). */
  tamano?: number;
  /** Solo hace falta sin `tamano`: con el, las iniciales se escalan solas. */
  tamanoIniciales?: number;
  redondo?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const medidas = tamano ? { width: tamano, height: tamano } : null;
  const forma = redondo ? { borderRadius: radius.pill } : null;
  if (foto) {
    return (
      <View style={[styles.avatar, medidas, forma, style]}>
        <Image source={{ uri: foto }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      </View>
    );
  }
  return (
    <View style={[styles.avatar, medidas, forma, { backgroundColor: tonoDe(nombre) }, style]}>
      <Text
        style={[
          styles.iniciales,
          { fontSize: tamano ? Math.max(11, tamano * 0.34) : (tamanoIniciales ?? styles.iniciales.fontSize) },
        ]}
      >
        {initials(nombre, '')}
      </Text>
    </View>
  );
}

// Solo tonos de la paleta cervecera con contraste suficiente para las iniciales en blanco.
const TONOS = [colors.beerDark, colors.inkSoft, colors.beer, colors.ink];

function tonoDe(nombre: string): string {
  let suma = 0;
  for (const letra of nombre) suma = (suma * 31 + (letra.codePointAt(0) ?? 0)) >>> 0;
  return TONOS[suma % TONOS.length];
}

const styles = StyleSheet.create({
  casilla: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  caja: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cajaMarcada: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipMarcado: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  chipDesactivado: { opacity: 0.45 },
  chipTexto: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  chipTextoMarcado: { color: colors.white },
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paperDeep,
  },
  iniciales: { color: 'rgba(255, 255, 255, 0.95)', fontWeight: '800', fontSize: 18 },
});

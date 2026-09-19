import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../features/auth/AuthProvider';
import { initials } from '../features/profile/initials';
import { colors, fonts, radius, space } from '../lib/theme';

export const ALTO_BARRA = 56;
const LADO_AVATAR = 34;
const LADO_LOGO = 38;
// En icono-web.png (1024 px) el aro rojo exterior mide ~696 px y esta centrado.
// La imagen se amplia para que el recorte redondo caiga justo dentro del aro,
// sin el fondo papel ni el margen del icono. 680 y no 696 para no dejar un
// hilo claro en el borde por el antialiasing.
const LADO_IMAGEN_LOGO = Math.round((LADO_LOGO * 1024) / 680);
const LOGO = require('../../assets/icono-web.png');

/**
 * Cabecera comun de las pestanas: el nombre de la pestana en la que estas,
 * campanita y acceso a Perfil. El titulo dice donde estas y no el nombre de la
 * app, que ya va en el icono.
 *
 * El margen del notch lo pone esta barra y no cada pantalla: React Navigation
 * NO descuenta ese margen a las pantallas que llevan cabecera, asi que las que
 * usan SafeAreaView no deben pedir el borde 'top' (saldria un hueco doble).
 */
export function BarraSuperior({ titulo }: { titulo: string }) {
  const { session, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const email = session?.user.email ?? '';

  return (
    <View style={[styles.barra, { paddingTop: insets.top }]}>
      <View style={styles.fila}>
        {/* Lados de igual ancho (flex: 1) para que el titulo quede centrado de
            verdad y no desplazado por los iconos de la derecha. */}
        <View style={styles.lado}>
          <View style={styles.logo} accessibilityRole="image" accessibilityLabel="Ruta de Bares">
            <Image source={LOGO} style={styles.imagenLogo} contentFit="cover" />
          </View>
        </View>

        <Text style={styles.titulo} numberOfLines={1} accessibilityRole="header">
          {titulo}
        </Text>

        <View style={[styles.lado, styles.ladoDerecho]}>
          {/* Sin onPress a proposito: queda preparada para las notificaciones. */}
          <Pressable
            style={styles.icono}
            accessibilityRole="button"
            accessibilityLabel="Notificaciones"
            hitSlop={6}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.ink} />
          </Pressable>

          <Pressable
            // navigate y no push: cambia a la pestana Perfil en vez de apilar
            // otra copia encima, y el boton atras no se llena de perfiles.
            onPress={() => router.navigate('/perfil')}
            accessibilityRole="button"
            accessibilityLabel="Mi perfil"
            hitSlop={6}
          >
            {profile?.avatar_thumb_url ?? profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_thumb_url ?? profile.avatar_url ?? '' }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarVacio]}>
                <Text style={styles.iniciales}>{initials(profile?.display_name ?? '', email)}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    backgroundColor: colors.paperDeep,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fila: {
    height: ALTO_BARRA,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  lado: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  ladoDerecho: { justifyContent: 'flex-end', gap: space.md },
  titulo: {
    fontFamily: fonts.title,
    fontSize: 19,
    color: colors.ink,
    // Encoge el hueco del titulo y no el de los iconos si el texto no cabe.
    flexShrink: 1,
  },
  logo: {
    width: LADO_LOGO,
    height: LADO_LOGO,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagenLogo: { width: LADO_IMAGEN_LOGO, height: LADO_IMAGEN_LOGO },
  icono: { padding: 2 },
  avatar: {
    width: LADO_AVATAR,
    height: LADO_AVATAR,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  avatarVacio: { alignItems: 'center', justifyContent: 'center' },
  iniciales: { fontSize: 12, fontWeight: '800', color: colors.inkSoft },
});

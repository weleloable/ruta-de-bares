import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '../../lib/theme';
import type { MatchGridRow } from '../../types/database';
import { AvatarCana } from './piezas';
import { estadoTarjeta, type EstadoTarjeta } from './reglas';

type Aspecto = {
  borde: string;
  fondo: string;
  icono: ComponentProps<typeof Ionicons>['name'] | null;
  /** Para lectores de pantalla y para la etiqueta de la ficha. */
  texto: string;
};

/**
 * Color, icono y texto de cada estado. El icono va siempre con el color: rojo
 * y verde es la confusion mas comun en el daltonismo.
 */
export const ASPECTO: Record<EstadoTarjeta, Aspecto> = {
  nuevo: { borde: colors.border, fondo: colors.paperDeep, icono: null, texto: 'Sin votar' },
  'me-gusta': { borde: colors.green, fondo: colors.greenSoft, icono: 'checkmark', texto: 'Te gusta' },
  'no-me-gusta': { borde: colors.stamp, fondo: colors.stampSoft, icono: 'close', texto: 'No te gusta' },
  conexion: { borde: colors.teal, fondo: colors.tealSoft, icono: 'checkmark-done', texto: 'Os habéis dado me gusta' },
};

/** Una celda de la grilla: foto y nombre. Todo lo demas, en la ficha. */
export function TarjetaPersona({ persona, onPress }: { persona: MatchGridRow; onPress(): void }) {
  const aspecto = ASPECTO[estadoTarjeta(persona)];
  const noLeidos = persona.unread_count;

  return (
    <View style={styles.celda}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${persona.display_name}, ${aspecto.texto}${noLeidos > 0 ? `, ${noLeidos} sin leer` : ''}`}
        onPress={onPress}
        style={({ pressed }) => [styles.tarjeta, { borderColor: aspecto.borde }, pressed && styles.pulsada]}
      >
        <AvatarCana
          nombre={persona.display_name}
          foto={persona.avatar_url}
          redondo={false}
          tamanoIniciales={24}
          style={styles.foto}
        />
        <Text numberOfLines={1} style={styles.nombre}>
          {persona.display_name}
        </Text>
        {aspecto.icono ? (
          <View style={[styles.marca, { backgroundColor: aspecto.borde }]}>
            <Ionicons name={aspecto.icono} size={13} color={colors.white} />
          </View>
        ) : null}
        {noLeidos > 0 ? (
          <View style={styles.noLeidos}>
            <Ionicons name="chatbubble" size={10} color={colors.teal} />
            <Text style={styles.noLeidosTexto}>{noLeidos}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Tres columnas con ancho en porcentaje y el aire por dentro de la celda,
  // como la rejilla de Sellos: con `gap` la tercera se cae en moviles estrechos.
  celda: { width: '33.33%', padding: space.xs },
  tarjeta: {
    borderWidth: 3,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  pulsada: { opacity: 0.8 },
  foto: { width: '100%', aspectRatio: 1 },
  nombre: { fontSize: 12, fontWeight: '700', color: colors.ink, paddingHorizontal: 6, paddingVertical: 4 },
  marca: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  noLeidos: {
    position: 'absolute',
    top: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.teal,
  },
  noLeidosTexto: { fontSize: 11, fontWeight: '800', color: colors.teal },
});

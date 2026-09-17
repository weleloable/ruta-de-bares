import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '../../lib/theme';
import type { MatchGridRow } from '../../types/database';
import { AvatarCana } from './piezas';
import { estadoTarjeta, type EstadoTarjeta } from './reglas';
import { VasoCana, type NivelVaso } from './VasoCana';

type Aspecto = {
  borde: string;
  grosor: number;
  discontinuo: boolean;
  /** Segundo aro por fuera: solo la conexion, lo mas importante de la grilla. */
  anillo: string | null;
  /** Foto apagada y en blanco y negro: lo ya visto se queda atras y no compite con lo nuevo. */
  apagada: boolean;
  /** Nombre sobre el color del borde en vez de sobre blanco. */
  nombreSobreColor: boolean;
  vaso: { nivel: NivelVaso; fondo: string; trazo: string } | null;
  /** Para lectores de pantalla y para la pastilla de la ficha. */
  texto: string;
};

/**
 * "La cana se llena" (opcion B de la propuesta de diseno): solo colores de la
 * paleta cervecera, y cada estado con su propia forma ademas del color, para
 * que se distinga tambien en gris o con daltonismo.
 *   sin votar   borde crema fino, sin vaso
 *   me gusta    borde cerveza y media cana
 *   conexion    borde tostado con doble aro, nombre sobre tostado y cana llena
 *   visto       borde discontinuo, foto en blanco y negro y vaso vacio
 */
export const ASPECTO: Record<EstadoTarjeta, Aspecto> = {
  nuevo: {
    borde: colors.border,
    grosor: 2,
    discontinuo: false,
    anillo: null,
    apagada: false,
    nombreSobreColor: false,
    vaso: null,
    texto: 'Sin votar',
  },
  'me-gusta': {
    borde: colors.beer,
    grosor: 3,
    discontinuo: false,
    anillo: null,
    apagada: false,
    nombreSobreColor: false,
    vaso: { nivel: 'media', fondo: colors.card, trazo: colors.beerDark },
    texto: 'Te gusta',
  },
  conexion: {
    borde: colors.beerDark,
    grosor: 3,
    discontinuo: false,
    anillo: colors.beer,
    apagada: false,
    nombreSobreColor: true,
    vaso: { nivel: 'llena', fondo: colors.beerDark, trazo: colors.card },
    texto: 'Os habéis dado me gusta',
  },
  visto: {
    borde: colors.borderStrong,
    grosor: 2,
    discontinuo: true,
    anillo: null,
    apagada: true,
    nombreSobreColor: false,
    vaso: { nivel: 'vacio', fondo: colors.card, trazo: colors.inkSoft },
    texto: 'Visto',
  },
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
        // Todas las tarjetas llevan el hueco del aro, aunque solo la conexion lo
        // pinte: asi la grilla no se descuadra al cambiar de estado.
        style={({ pressed }) => [
          styles.anillo,
          aspecto.anillo ? { borderColor: aspecto.anillo } : null,
          pressed && styles.pulsada,
        ]}
      >
        <View
          style={[
            styles.tarjeta,
            {
              borderColor: aspecto.borde,
              borderWidth: aspecto.grosor,
              borderStyle: aspecto.discontinuo ? 'dashed' : 'solid',
            },
          ]}
        >
          <View style={aspecto.apagada ? styles.apagada : null}>
            <AvatarCana
              nombre={persona.display_name}
              foto={persona.avatar_url}
              redondo={false}
              tamanoIniciales={24}
              style={styles.foto}
            />
          </View>
          <Text
            numberOfLines={1}
            style={[
              styles.nombre,
              aspecto.nombreSobreColor ? { backgroundColor: aspecto.borde, color: colors.card } : null,
              aspecto.apagada ? styles.nombreApagado : null,
            ]}
          >
            {persona.display_name}
          </Text>
        </View>

        {aspecto.vaso ? (
          <View style={[styles.marca, { backgroundColor: aspecto.vaso.fondo }]}>
            <VasoCana nivel={aspecto.vaso.nivel} tamano={20} trazo={aspecto.vaso.trazo} />
          </View>
        ) : null}
        {noLeidos > 0 ? (
          <View style={styles.noLeidos}>
            <Ionicons name="chatbubble" size={10} color={colors.beerDark} />
            <Text style={styles.noLeidosTexto}>{noLeidos}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** Una linea sobre la grilla que explica los vasos: la metafora no es obvia la primera vez. */
export function LeyendaVasos() {
  return (
    <View style={styles.leyenda} accessibilityRole="text">
      <ElementoLeyenda nivel="media" texto="Te gusta" />
      <ElementoLeyenda nivel="llena" texto="Os habéis gustado" />
      <ElementoLeyenda nivel="vacio" texto="Visto" trazo={colors.inkSoft} />
    </View>
  );
}

function ElementoLeyenda({ nivel, texto, trazo }: { nivel: NivelVaso; texto: string; trazo?: string }) {
  return (
    <View style={styles.elementoLeyenda}>
      <VasoCana nivel={nivel} tamano={16} trazo={trazo} />
      <Text style={styles.leyendaTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Tres columnas con ancho en porcentaje y el aire por dentro de la celda,
  // como la rejilla de Sellos: con `gap` la tercera se cae en moviles estrechos.
  celda: { width: '33.33%', padding: 2 },
  anillo: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: radius.md + 4,
    padding: 2,
  },
  pulsada: { opacity: 0.8 },
  tarjeta: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.card },
  // La opacidad funciona en todas las plataformas; el gris, donde se soporta.
  apagada: { opacity: 0.45, filter: 'grayscale(1)' },
  foto: { width: '100%', aspectRatio: 1 },
  nombre: { fontSize: 12, fontWeight: '700', color: colors.ink, paddingHorizontal: 6, paddingVertical: 4 },
  nombreApagado: { color: colors.inkFaint },
  marca: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  noLeidos: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.beerDark,
  },
  noLeidosTexto: { fontSize: 11, fontWeight: '800', color: colors.beerDark },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  elementoLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leyendaTexto: { fontSize: 12, color: colors.inkSoft },
});

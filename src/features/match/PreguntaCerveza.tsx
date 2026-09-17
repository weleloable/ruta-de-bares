import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, typography } from '../../lib/theme';
import { formatDuration } from '../stamps/rules';
import { TEXTOS_POR_PERSONA, type EstadoPregunta } from './reglas';

type Tono = 'neutro' | 'cerveza' | 'aceptada';

function franja(estado: EstadoPregunta, nombre: string): { texto: string; tono: Tono } {
  switch (estado.tipo) {
    case 'disponible':
      return estado.tuvoAplazamiento
        ? { texto: 'Ya se puede volver a preguntar por la cerveza', tono: 'cerveza' }
        : { texto: 'Aún no os habéis preguntado por una cerveza', tono: 'neutro' };
    case 'esperando-respuesta':
      return { texto: `Esperando la respuesta de ${nombre}`, tono: 'cerveza' };
    case 'te-toca-responder':
      return { texto: `${nombre} te ha preguntado por una cerveza`, tono: 'cerveza' };
    case 'aplazada':
      return {
        texto: `${estado.teLoAplazaron ? `${nombre} te ha dicho que luego` : 'Le has dicho que luego'}. Se podrá volver a preguntar en ${formatDuration(estado.disponibleEnMs)}`,
        tono: 'neutro',
      };
    case 'sin-mas-preguntas':
      return { texto: 'Ya no se puede volver a preguntar en esta conexión', tono: 'neutro' };
    case 'aceptada':
      return { texto: '¡Cerveza aceptada! Ya podéis escribiros', tono: 'aceptada' };
    case 'rechazada':
      return { texto: 'La cerveza ya tuvo respuesta', tono: 'neutro' };
  }
}

/** Estado de la pregunta, fijo bajo la cabecera del chat. */
export function FranjaCerveza({ estado, nombre }: { estado: EstadoPregunta; nombre: string }) {
  const { texto, tono } = franja(estado, nombre);
  return (
    <View style={[styles.franja, styles[`franja_${tono}`]]} accessibilityRole="summary">
      <Ionicons name="beer" size={16} color={tono === 'neutro' ? colors.inkSoft : colors.white} />
      <Text style={[styles.franjaTexto, tono === 'neutro' && styles.franjaTextoNeutro]}>{texto}</Text>
    </View>
  );
}

/** La pregunta recibida, con sus tres respuestas, encima de la barra del chat. */
export function ResponderCerveza({
  nombre,
  ultimoAplazamiento,
  ocupado,
  onResponder,
}: {
  nombre: string;
  ultimoAplazamiento: boolean;
  ocupado: boolean;
  onResponder(respuesta: 'yes' | 'no' | 'later'): void;
}) {
  return (
    <View style={styles.tarjeta}>
      <Text style={typography.overline}>{nombre} pregunta</Text>
      <Text style={styles.pregunta}>¿Te tomas una cerveza conmigo?</Text>
      <View style={styles.fila}>
        <Opcion texto="Sí" principal ocupado={ocupado} onPress={() => onResponder('yes')} />
        <Opcion texto="No" ocupado={ocupado} onPress={() => onResponder('no')} />
      </View>
      <Opcion texto="Pregúntamelo dentro de un rato" ocupado={ocupado} onPress={() => onResponder('later')} />
      {ultimoAplazamiento ? (
        <Text style={typography.muted}>Si lo aplazas otra vez, ya no se podrá volver a preguntar.</Text>
      ) : (
        <Text style={typography.muted}>Si dices que no, se cierra la conexión y se borra el chat.</Text>
      )}
    </View>
  );
}

function Opcion({
  texto,
  principal = false,
  ocupado,
  onPress,
}: {
  texto: string;
  principal?: boolean;
  ocupado: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: ocupado }}
      disabled={ocupado}
      onPress={onPress}
      style={({ pressed }) => [
        styles.opcion,
        principal && styles.opcionPrincipal,
        (pressed || ocupado) && styles.opcionPulsada,
      ]}
    >
      <Text style={[styles.opcionTexto, principal && styles.opcionTextoPrincipal]}>{texto}</Text>
    </Pressable>
  );
}

/** Lo que queda por escribir tras el Si. */
export function textoRestante(restantes: number): string {
  if (restantes === 0) return `Ya has enviado tus ${TEXTOS_POR_PERSONA} mensajes.`;
  return restantes === 1 ? 'Te queda 1 mensaje' : `Te quedan ${restantes} mensajes`;
}

const styles = StyleSheet.create({
  franja: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 7 },
  franja_neutro: { backgroundColor: colors.paperDeep },
  franja_cerveza: { backgroundColor: colors.beer },
  franja_aceptada: { backgroundColor: colors.beerDark },
  franjaTexto: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.white },
  franjaTextoNeutro: { color: colors.inkSoft, fontWeight: '600' },
  tarjeta: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.beer,
    backgroundColor: colors.card,
  },
  pregunta: { fontFamily: typography.sectionTitle.fontFamily, fontSize: 19, color: colors.ink },
  fila: { flexDirection: 'row', gap: space.sm },
  opcion: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  opcionPrincipal: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  opcionPulsada: { opacity: 0.7 },
  opcionTexto: { fontSize: 15, fontWeight: '700', color: colors.ink },
  opcionTextoPrincipal: { color: colors.white },
});

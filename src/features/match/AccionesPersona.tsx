import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button } from '../../components/ui';
import { colors, radius, space, typography } from '../../lib/theme';
import type { MatchReportReason } from '../../types/database';
import { blockMatch, reportMatch } from './api';
import { DialogoConfirmar } from '../profile/DialogoConfirmar';
import { DETALLE_MAX, MOTIVOS_DENUNCIA, validarDenuncia, type MotivoDenuncia } from './reglas';

/**
 * Bloquear y denunciar, iguales en la ficha y en el chat.
 *
 * Las dos acciones acaban en lo mismo: esa persona deja de verte y tu a ella,
 * la conexion se cierra y el chat se borra. La diferencia es que denunciar
 * ademas avisa a quien organiza la ruta, y que el servidor copia en la
 * denuncia los mensajes de esa persona ANTES de borrarlos (por eso hace falta
 * pasarle `connectionId` cuando se denuncia desde un chat).
 */
export function AccionesPersona({
  routeId,
  userId,
  nombre,
  connectionId = null,
  onHecho,
}: {
  routeId: string;
  userId: string;
  nombre: string;
  /** Desde un chat: los mensajes de esa conexion viajan con la denuncia. */
  connectionId?: string | null;
  /** Se llama cuando la persona deja de estar disponible (bloqueada o denunciada). */
  onHecho(que: 'bloqueada' | 'denunciada'): void;
}) {
  const [confirmandoBloqueo, setConfirmandoBloqueo] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDenuncia | null>(null);
  const [detalle, setDetalle] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errores = validarDenuncia(motivo, detalle);

  async function bloquear() {
    setOcupado(true);
    setError(null);
    try {
      await blockMatch(userId);
      setConfirmandoBloqueo(false);
      onHecho('bloqueada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo bloquear.');
      setConfirmandoBloqueo(false);
    } finally {
      setOcupado(false);
    }
  }

  async function denunciar() {
    if (motivo === null || errores.length > 0) return;
    setOcupado(true);
    setError(null);
    try {
      await reportMatch({
        routeId,
        targetId: userId,
        motivo: motivo as MatchReportReason,
        detalle,
        connectionId,
        // Denunciar bloquea siempre: quien denuncia no quiere seguir viendo a
        // esa persona esa noche.
        bloquear: true,
      });
      cerrarDenuncia();
      onHecho('denunciada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la denuncia.');
      cerrarDenuncia();
    } finally {
      setOcupado(false);
    }
  }

  function cerrarDenuncia() {
    setDenunciando(false);
    setMotivo(null);
    setDetalle('');
  }

  return (
    <>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <View style={styles.fila}>
        <BotonDiscreto icono="hand-left-outline" texto="Bloquear" onPress={() => setConfirmandoBloqueo(true)} />
        <BotonDiscreto icono="flag-outline" texto="Denunciar" onPress={() => setDenunciando(true)} />
      </View>

      <DialogoConfirmar
        visible={confirmandoBloqueo}
        titulo={`Bloquear a ${nombre}`}
        mensaje={`Dejaréis de veros en la ruta, se cerrará vuestra conexión y se borrará el chat. Seguirá bloqueada en las rutas siguientes hasta que la desbloquees.`}
        textoConfirmar="Bloquear"
        destructivo
        ocupado={ocupado}
        onConfirmar={() => void bloquear()}
        onCancelar={() => setConfirmandoBloqueo(false)}
      />

      <Modal visible={denunciando} transparent animationType="fade" onRequestClose={cerrarDenuncia}>
        <View style={styles.centrador} accessibilityViewIsModal>
          <Pressable style={[StyleSheet.absoluteFill, styles.velo]} onPress={cerrarDenuncia} accessibilityLabel="Cancelar" />
          <View style={styles.hoja}>
            <Text style={[typography.sectionTitle, styles.centrado]}>Denunciar a {nombre}</Text>
            <Text style={[typography.muted, styles.centrado]}>
              Lo verá quien organiza la ruta. También la bloquearemos.
            </Text>

            <ScrollView style={styles.motivos} contentContainerStyle={styles.motivosCuerpo}>
              {MOTIVOS_DENUNCIA.map((opcion) => {
                const elegido = motivo === opcion.id;
                return (
                  <Pressable
                    key={opcion.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: elegido }}
                    accessibilityLabel={opcion.etiqueta}
                    onPress={() => setMotivo(opcion.id)}
                    style={({ pressed }) => [styles.motivo, elegido && styles.motivoElegido, pressed && styles.pulsado]}
                  >
                    <Ionicons
                      name={elegido ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={elegido ? colors.beerDark : colors.inkFaint}
                    />
                    <View style={styles.motivoTextos}>
                      <Text style={styles.motivoTitulo}>{opcion.etiqueta}</Text>
                      {opcion.ayuda ? <Text style={typography.muted}>{opcion.ayuda}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <TextInput
              value={detalle}
              onChangeText={setDetalle}
              maxLength={DETALLE_MAX}
              placeholder="Cuéntanos lo que ha pasado (opcional)"
              placeholderTextColor={colors.inkFaint}
              editable={!ocupado}
              multiline
              accessibilityLabel="Detalle de la denuncia"
              style={styles.detalle}
            />
            {connectionId ? (
              <Text style={typography.muted}>
                Enviaremos también lo que te ha escrito en este chat, para que se pueda revisar.
              </Text>
            ) : null}

            <View style={styles.acciones}>
              <Button
                title="Enviar denuncia"
                variant="danger"
                onPress={() => void denunciar()}
                disabled={errores.length > 0}
                loading={ocupado}
              />
              <Button title="Cancelar" variant="secondary" onPress={cerrarDenuncia} disabled={ocupado} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function BotonDiscreto({
  icono,
  texto,
  onPress,
}: {
  icono: React.ComponentProps<typeof Ionicons>['name'];
  texto: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      onPress={onPress}
      style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
    >
      <Ionicons name={icono} size={16} color={colors.inkSoft} />
      <Text style={styles.botonTexto}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  botonTexto: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  pulsado: { opacity: 0.7 },
  centrador: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  velo: { backgroundColor: 'rgba(36, 26, 18, 0.45)' },
  hoja: {
    width: '100%',
    maxWidth: 400,
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  centrado: { textAlign: 'center' },
  motivos: { maxHeight: 260 },
  motivosCuerpo: { gap: 4, paddingVertical: space.xs },
  motivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  motivoElegido: { borderColor: colors.beer, backgroundColor: colors.beerSoft },
  motivoTextos: { flex: 1 },
  motivoTitulo: { fontSize: 15, fontWeight: '600', color: colors.ink },
  detalle: {
    minHeight: 72,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  acciones: { gap: space.sm, marginTop: space.xs },
});

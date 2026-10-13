import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../../components/ui';
import { colors, space, typography } from '../../lib/theme';
import { textoGuia, type GuiaInstalar } from '../../lib/guiaInstalar';

/**
 * Las instrucciones para instalar la web como app cuando el navegador no da su
 * propio aviso (iPhone, navegador de WhatsApp, Firefox...; ver guiaInstalar.ts).
 * Mismo molde que DialogoConfirmar: velo + tarjeta, con el Modal de react-native
 * que funciona igual en web y en nativo. Tocar fuera cierra.
 */
export function GuiaInstalarModal({ guia, onCerrar }: { guia: GuiaInstalar | null; onCerrar: () => void }) {
  const texto = guia ? textoGuia(guia) : null;
  return (
    <Modal visible={texto !== null} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={styles.centrador} accessibilityViewIsModal>
        <Pressable style={[StyleSheet.absoluteFill, styles.velo]} onPress={onCerrar} accessibilityLabel="Cerrar" />
        {texto ? (
          <Card style={styles.tarjeta}>
            <Text style={[typography.sectionTitle, styles.centrado]}>{texto.titulo}</Text>
            <View style={styles.pasos}>
              {texto.pasos.map((paso, i) => (
                <View key={paso} style={styles.paso}>
                  <View style={styles.numero}>
                    <Text style={styles.numeroTexto}>{i + 1}</Text>
                  </View>
                  <Text style={[typography.body, styles.pasoTexto]}>{paso}</Text>
                </View>
              ))}
            </View>
            <Button title="Entendido" onPress={onCerrar} />
          </Card>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centrador: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  velo: { backgroundColor: 'rgba(36, 26, 18, 0.45)' },
  tarjeta: { width: '100%', maxWidth: 400, gap: space.md },
  centrado: { textAlign: 'center' },
  pasos: { gap: space.md },
  paso: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  numero: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.beerSoft,
    borderWidth: 1,
    borderColor: colors.beerDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeroTexto: { fontWeight: '800', fontSize: 13, color: colors.beerDark },
  pasoTexto: { flex: 1 },
});

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../../components/ui';
import { space, typography } from '../../lib/theme';

/**
 * Pop-up de confirmacion con el estilo de la app, centrado sobre un velo.
 *
 * Sustituye a Alert.alert, que en react-native-web es un no-op (`static
 * alert() {}`): no pinta nada y no llama a ningun callback, asi que en la PWA
 * el boton que dependia de el se quedaba mudo. Modal de react-native si
 * funciona en las dos plataformas, con un solo componente y sin variante .web.
 *
 * El velo usa la misma tinta al 45% que StampSheet: los dos modales de la app
 * tienen que oscurecer el fondo igual.
 */
export function DialogoConfirmar({
  visible,
  titulo,
  mensaje,
  textoConfirmar,
  textoCancelar = 'Cancelar',
  destructivo = false,
  ocupado = false,
  onConfirmar,
  onCancelar,
}: {
  visible: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  textoCancelar?: string;
  destructivo?: boolean;
  /** Mientras la accion corre: rueda en el boton y se bloquea la salida. */
  ocupado?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  // Tocar fuera equivale a Cancelar: la salida accidental tiene que ser la
  // inocua, nunca la destructiva. Con la accion en marcha no se cancela nada.
  const cancelar = ocupado ? undefined : onCancelar;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Sin esto el boton "atras" de Android no cierra el dialogo.
      onRequestClose={onCancelar}
    >
      <View style={styles.centrador} accessibilityViewIsModal>
        {/* Hermano del contenido y no padre, como en StampSheet: asi los toques
            sobre la tarjeta no llegan al velo y no la cierran sin querer. */}
        <Pressable
          style={[StyleSheet.absoluteFill, styles.velo]}
          onPress={cancelar}
          accessibilityLabel={textoCancelar}
        />
        <Card style={styles.tarjeta}>
          <Text style={typography.sectionTitle}>{titulo}</Text>
          <Text style={typography.body}>{mensaje}</Text>
          <View style={styles.acciones}>
            <Button
              title={textoConfirmar}
              variant={destructivo ? 'danger' : 'primary'}
              onPress={onConfirmar}
              loading={ocupado}
            />
            <Button
              title={textoCancelar}
              variant="secondary"
              onPress={onCancelar}
              disabled={ocupado}
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centrador: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  velo: { backgroundColor: 'rgba(36, 26, 18, 0.45)' },
  // Los botones son pildoras anchas: en vertical nunca parten el texto, y es
  // como apila la app sus acciones en todas las pantallas.
  tarjeta: { width: '100%', maxWidth: 400 },
  acciones: { gap: space.sm, marginTop: space.xs },
});

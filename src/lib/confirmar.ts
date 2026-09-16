import { Alert } from 'react-native';

export type Confirmacion = {
  titulo: string;
  mensaje: string;
  /** Texto del boton que confirma. Dice lo que pasa: "Borrar", no "Aceptar". */
  aceptar: string;
  /** Pinta el boton en rojo en iOS: la accion no se puede deshacer. */
  destructiva?: boolean;
};

/**
 * Pide confirmacion antes de algo irreversible y resuelve true si se acepta.
 *
 * Existe porque Alert.alert en react-native-web es una funcion vacia: en la web
 * (y en la PWA instalada) cerrar sesion, borrar una ruta o anular una
 * invitacion no hacian nada. La variante web es confirmar.web.ts; las pantallas
 * nunca llaman a Alert.alert directamente (lo vigila tests/confirmar.test.ts).
 */
export function confirmar({ titulo, mensaje, aceptar, destructiva = false }: Confirmacion): Promise<boolean> {
  return new Promise((resolver) => {
    Alert.alert(
      titulo,
      mensaje,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
        { text: aceptar, style: destructiva ? 'destructive' : 'default', onPress: () => resolver(true) },
      ],
      // Android: tocar fuera del dialogo lo cierra sin pulsar ningun boton.
      { cancelable: true, onDismiss: () => resolver(false) },
    );
  });
}

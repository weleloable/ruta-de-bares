import { Alert } from 'react-native';

export type OpcionesConfirmar = {
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  destructivo?: boolean;
};

/**
 * Confirmacion nativa (Android/iOS). En web, `Alert.alert` de react-native-web
 * es un no-op total (no hace nada, ni siquiera llama al callback): por eso
 * existe `confirmar.web.ts`, que usa `window.confirm` en su lugar.
 */
export function confirmar({
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  destructivo = false,
}: OpcionesConfirmar): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(titulo, mensaje, [
      { text: textoCancelar, style: 'cancel', onPress: () => resolve(false) },
      {
        text: textoConfirmar,
        style: destructivo ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

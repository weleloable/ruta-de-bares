import { Text } from 'react-native';

import { typography } from '../../lib/theme';

/**
 * En el movil nativo no hay escaner (la app se usa en web, y alli lee la
 * camara EscanerQr.web.tsx). Si algun dia se publica nativa, aqui va expo-camera.
 */
export function EscanerQr(_props: { onLeido: (texto: string) => void }) {
  return <Text style={typography.muted}>Para escanear, abre RutApp en el navegador del móvil.</Text>;
}

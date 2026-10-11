import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../../../../components/ui';
import { space, typography } from '../../../../lib/theme';
import type { PropsJuego } from '../../tipos';
import { urlOcupado } from './mensaje';

const URL_JUEGO = urlOcupado(process.env.EXPO_PUBLIC_OCUPADO_URL);

/**
 * Ocupado en la app NATIVA: se abre en el navegador del sistema, sin WebView
 * (meterlo dentro pediria un modulo nativo nuevo y otra build de EAS). Limite
 * conocido: desde el navegador el juego no puede avisar a la app nativa, asi que
 * aqui el record no se guarda. En la web/PWA si (Ocupado.web.tsx).
 */
export function Ocupado(_props: PropsJuego) {
  return (
    <View style={styles.raiz}>
      <Card style={styles.tarjeta}>
        <Text style={typography.cardTitle}>Ocupado</Text>
        <Text style={typography.muted}>
          Un escape room en el baño de un bar. Tu cerveza se calienta mientras buscas la salida.
        </Text>
        <Text style={typography.muted}>
          Se juega en horizontal, en el navegador. Desde aquí el récord no se guarda: para guardarlo, juega desde la web
          de la app.
        </Text>
        <Button title="Jugar en el navegador" icon="open-outline" onPress={() => WebBrowser.openBrowserAsync(URL_JUEGO)} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, justifyContent: 'center' },
  tarjeta: { gap: space.md },
});

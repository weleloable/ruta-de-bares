import { StyleSheet, View } from 'react-native';

import { Button, EmptyState } from '../../../../components/ui';
import { space } from '../../../../lib/theme';
import type { PropsJuego } from '../../tipos';

/**
 * "¿Conduces tú?" se dibuja en un canvas del navegador (ConducesTu.web.tsx) y
 * la app nativa no tiene libreria de dibujo: aqui solo se avisa. Se juega
 * desde la web o la app instalada desde el navegador, que es como se usa.
 */
export function ConducesTu({ onSalir }: PropsJuego) {
  return (
    <View style={styles.raiz}>
      <EmptyState title="Solo en la web" body="Este juego se juega desde la app instalada desde el navegador." />
      {onSalir ? <Button title="Volver" variant="secondary" onPress={onSalir} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, justifyContent: 'center', gap: space.md, padding: space.lg },
});

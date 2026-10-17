import { StyleSheet, View } from 'react-native';

import { Button, EmptyState } from '../../../../components/ui';
import { space } from '../../../../lib/theme';
import type { PropsJuego } from '../../tipos';

/**
 * Don Quijote Cervecero se pinta en 3D en un canvas del navegador
 * (QuijoteCervecero.web.tsx) y la app nativa no tiene con que: aqui solo se
 * avisa, igual que en ¿Conduces tu?.
 */
export function QuijoteCervecero({ onSalir }: PropsJuego) {
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

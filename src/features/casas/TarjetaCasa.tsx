import { StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { CASAS } from './casas';
import { Escudo } from './Escudo';
import { useMiCasa } from './MiCasa';

/** Tu casa en Mi perfil: escudo, nombre y lema, sobre su color. */
export function TarjetaCasa() {
  const { casa } = useMiCasa();
  if (!casa) {
    return (
      <Card>
        <Text style={typography.sectionTitle}>Tu casa</Text>
        <Text style={typography.muted}>Te tocará casa al entrar en tu primera ruta: Mahou, Cruzcampo, Estrella Galicia o Alhambra.</Text>
      </Card>
    );
  }
  const c = CASAS[casa];
  return (
    <View style={[styles.tarjeta, { backgroundColor: c.color, borderColor: c.oscuro }]} accessibilityLabel={`Tu casa: ${c.nombre}`}>
      <Escudo casa={casa} tamano={64} />
      <View style={styles.textos}>
        <Text style={[styles.antes, { color: c.detalle }]}>TU CASA</Text>
        <Text style={[styles.nombre, { color: c.texto }]}>{c.nombre}</Text>
        <Text style={[styles.lema, { color: c.texto }]}>«{c.lema}»</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  textos: { flex: 1, gap: 2 },
  antes: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  nombre: { fontSize: 24, fontWeight: '900' },
  lema: { fontSize: 14, fontStyle: 'italic', opacity: 0.9 },
});

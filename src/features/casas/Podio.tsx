import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '../../lib/theme';
import { CASAS, esCasa, type IdCasa } from './casas';
import { Escudo } from './Escudo';

export type PuestoCasa = { house: string; puntos: number; puesto: number };

const ALTURA: Record<number, number> = { 1: 96, 2: 68, 3: 48 };

/**
 * El podio de las casas: 2.º, 1.º y 3.º en escalones con su escudo, y la
 * cuarta debajo. Con empates, el escalon es el del puesto (dos primeras
 * comparten el alto).
 */
export function Podio({ resultado, tamano = 1 }: { resultado: readonly PuestoCasa[]; tamano?: number }) {
  const validas = resultado.filter((r): r is PuestoCasa & { house: IdCasa } => esCasa(r.house));
  const ordenadas = [...validas].sort((a, b) => a.puesto - b.puesto || b.puntos - a.puntos);
  const podio = ordenadas.slice(0, 3);
  const resto = ordenadas.slice(3);
  // Orden visual clasico: segundo, primero, tercero.
  const visual = podio.length === 3 ? [podio[1], podio[0], podio[2]] : podio;

  return (
    <View style={styles.raiz}>
      <View style={styles.escalones}>
        {visual.map((r) => {
          const c = CASAS[r.house];
          const alto = (ALTURA[Math.min(3, r.puesto)] ?? 40) * tamano;
          return (
            <View key={r.house} style={styles.columna}>
              <Escudo casa={r.house} tamano={(r.puesto === 1 ? 64 : 48) * tamano} />
              <Text style={styles.nombre} numberOfLines={1}>
                {c.nombre}
              </Text>
              <Text style={styles.puntos}>{r.puntos}</Text>
              <View style={[styles.escalon, { height: alto, backgroundColor: c.color, borderColor: c.oscuro }]}>
                <Text style={[styles.puesto, { color: c.texto }]}>{`${r.puesto}.º`}</Text>
              </View>
            </View>
          );
        })}
      </View>
      {resto.map((r) => (
        <View key={r.house} style={styles.resto}>
          <Text style={styles.restoPuesto}>{`${r.puesto}.º`}</Text>
          <Escudo casa={r.house} tamano={22} />
          <Text style={styles.restoNombre}>{CASAS[r.house].nombre}</Text>
          <Text style={styles.restoPuntos}>{r.puntos}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.sm, width: '100%' },
  escalones: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: space.xs },
  columna: { flex: 1, alignItems: 'center', gap: 2, maxWidth: 120 },
  nombre: { fontSize: 12, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  puntos: { fontSize: 16, fontWeight: '900', color: colors.ink },
  escalon: {
    width: '100%',
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderWidth: 2,
    borderBottomWidth: 0,
    alignItems: 'center',
    paddingTop: space.xs,
  },
  puesto: { fontSize: 20, fontWeight: '900' },
  resto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.paperDeep,
  },
  restoPuesto: { fontSize: 13, fontWeight: '800', color: colors.inkSoft, width: 26 },
  restoNombre: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink },
  restoPuntos: { fontSize: 14, fontWeight: '900', color: colors.ink },
});

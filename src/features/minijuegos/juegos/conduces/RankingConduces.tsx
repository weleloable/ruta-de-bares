import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, EmptyState, Loading } from '../../../../components/ui';
import { colors, radius, space, typography } from '../../../../lib/theme';
import type { ConducesRankingRow } from '../../../../types/database';
import { cargarRankingConduces } from '../../api';
import { nivelPorDefecto, useDatosRuta } from './compostelana';
import { metrosTexto, nombreNivel } from './mensajes';

/**
 * Rankings de "¿Conduces tú?" desde el menu, fuera del juego: uno por nivel de
 * cañas (0041), con pestañas, abierto en el nivel de tus sellos. Mismo aspecto
 * que el Ranking de los otros juegos.
 */
export function RankingConduces({ rutaId }: { rutaId: string }) {
  const datos = useDatosRuta();
  const [nivel, setNivel] = useState(() => nivelPorDefecto(datos));
  const [filas, setFilas] = useState<ConducesRankingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setFilas(await cargarRankingConduces(rutaId, nivel));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el ranking.');
    } finally {
      setCargando(false);
    }
  }, [rutaId, nivel]);

  useEffect(() => {
    setFilas(null);
    void cargar();
  }, [cargar]);

  return (
    <View style={styles.raiz}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pestanas}>
        {Array.from({ length: datos.numeroBares }, (_, k) => k + 1).map((n) => (
          <Pressable
            key={n}
            accessibilityRole="tab"
            accessibilityLabel={`Ranking con ${nombreNivel(n)}`}
            accessibilityState={{ selected: n === nivel }}
            onPress={() => setNivel(n)}
            style={[styles.pestana, n === nivel && styles.pestanaElegida]}
          >
            <Text style={[styles.pestanaTexto, n === nivel && styles.pestanaTextoElegida]}>{nombreNivel(n)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {filas === null && !error ? <Loading label="Cargando el ranking..." /> : null}
      {filas && filas.length === 0 ? (
        <EmptyState title={`Nadie con ${nombreNivel(nivel)}`} body="Aún no ha jugado nadie de la ruta con este nivel." />
      ) : null}

      {filas?.map((f, i) => (
        <Card key={f.user_id} style={[styles.fila, f.is_me && styles.yo]}>
          {i > 0 && f.pos > (filas[i - 1]?.pos ?? 0) + 1 ? <Text style={typography.muted}>…</Text> : null}
          <Text style={styles.pos}>{f.pos}</Text>
          <Text style={[typography.cardTitle, styles.nombre]} numberOfLines={1}>
            {f.display_name}
            {f.is_me ? ' (tú)' : ''}
          </Text>
          <Text style={styles.metros}>{metrosTexto(f.distance)}</Text>
        </Card>
      ))}

      <Button title="Actualizar" variant="secondary" onPress={() => void cargar()} loading={cargando} />
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.sm },
  pestanas: { gap: space.sm, paddingVertical: space.xs },
  pestana: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pestanaElegida: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  pestanaTexto: { fontSize: 14, fontWeight: '700', color: colors.inkSoft },
  pestanaTextoElegida: { color: colors.white },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  yo: { borderColor: colors.beer, backgroundColor: colors.beerSoft, borderWidth: 2, borderRadius: radius.lg },
  pos: { width: 32, fontSize: 18, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
  nombre: { flex: 1 },
  metros: { fontSize: 20, fontWeight: '800', color: colors.beerDark },
});

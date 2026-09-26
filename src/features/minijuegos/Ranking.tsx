import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, EmptyState, Loading } from '../../components/ui';
import { colors, radius, space, typography } from '../../lib/theme';
import type { MinigameRankingRow } from '../../types/database';
import { cargarRanking } from './api';

/**
 * Ranking de UN juego en UNA ruta: la mejor nota de cada persona. Tu fila sale
 * resaltada, y aunque no entres en el top el servidor la manda igualmente.
 */
export function Ranking({ rutaId, juego }: { rutaId: string; juego: string }) {
  const [filas, setFilas] = useState<MinigameRankingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setFilas(await cargarRanking(rutaId, juego));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el ranking.');
    } finally {
      setCargando(false);
    }
  }, [rutaId, juego]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (filas === null && !error) return <Loading label="Cargando el ranking..." />;

  return (
    <View style={styles.raiz}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      {filas && filas.length === 0 ? (
        <EmptyState title="Nadie ha jugado aún" body="Sé el primero en salir en el ranking de esta ruta." />
      ) : null}

      {filas?.map((f, i) => (
        <Card key={f.user_id} style={[styles.fila, f.is_me && styles.yo]}>
          {/* Un hueco en las posiciones (top + tu fila fuera del top) se ve con una linea. */}
          {i > 0 && f.pos > (filas[i - 1]?.pos ?? 0) + 1 ? <Text style={typography.muted}>…</Text> : null}
          <Text style={styles.pos}>{f.pos}</Text>
          <Text style={[typography.cardTitle, styles.nombre]} numberOfLines={1}>
            {f.display_name}
            {f.is_me ? ' (tú)' : ''}
          </Text>
          <Text style={styles.nota}>{f.score}</Text>
        </Card>
      ))}

      <Button title="Actualizar" variant="secondary" onPress={() => void cargar()} loading={cargando} />
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.sm },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  yo: { borderColor: colors.beer, backgroundColor: colors.beerSoft, borderWidth: 2, borderRadius: radius.lg },
  pos: { width: 32, fontSize: 18, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
  nombre: { flex: 1 },
  nota: { fontSize: 22, fontWeight: '800', color: colors.beerDark },
});

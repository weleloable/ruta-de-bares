import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Card, EmptyState } from '../../src/components/ui';
import { CASAS, esCasa } from '../../src/features/casas/casas';
import { Escudo } from '../../src/features/casas/Escudo';
import { titularGanadoras } from '../../src/features/casas/GanadoraRuta';
import { Chips } from '../../src/features/casas/panel/piezas';
import { Podio, type PuestoCasa } from '../../src/features/casas/Podio';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, space, typography } from '../../src/lib/theme';
import type { Database } from '../../src/types/database';

type Fila = Database['public']['Functions']['casas_historico']['Returns'][number];
type Ruta = Database['public']['Functions']['casas_palmares']['Returns'][number];
const TODAS = '__todas';

/**
 * Ranking historico de las casas (0049): victorias, podios y puntos de todas
 * las rutas cerradas, o de una temporada; y debajo, el palmares ruta a ruta.
 */
export default function Historico() {
  const [temporadas, setTemporadas] = useState<{ id: string; nombre: string }[]>([]);
  const [temporada, setTemporada] = useState<string>(TODAS);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [palmares, setPalmares] = useState<Ruta[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('temporadas')
      .select('id, nombre')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTemporadas(data ?? []));
  }, []);

  const cargar = useCallback(async () => {
    const t = temporada === TODAS ? null : temporada;
    const [h, p] = await Promise.all([
      supabase.rpc('casas_historico', { p_temporada_id: t }),
      supabase.rpc('casas_palmares', { p_temporada_id: t }),
    ]);
    if (h.error || p.error) {
      const m = (h.error ?? p.error)!.message;
      setError(/PGRST202|Could not find/i.test(m) ? 'Falta aplicar la migración 0049 en Supabase.' : m);
      return;
    }
    setError(null);
    setFilas([...(h.data ?? [])].sort((a, b) => b.victorias - a.victorias || b.puntos - a.puntos));
    setPalmares(p.data ?? []);
  }, [temporada]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.cuerpo}>
        {temporadas.length > 0 ? (
          <Chips
            opciones={[{ id: TODAS, texto: 'Siempre' }, ...temporadas.map((t) => ({ id: t.id, texto: t.nombre }))]}
            elegida={temporada}
            onElegir={setTemporada}
          />
        ) : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Card style={styles.tabla}>
          <Text style={typography.sectionTitle}>Clasificación</Text>
          <View style={styles.cabecera}>
            <Text style={[styles.col, styles.colCasa]} />
            <Text style={styles.col}>🏆</Text>
            <Text style={styles.col}>2.º</Text>
            <Text style={styles.col}>3.º</Text>
            <Text style={[styles.col, styles.colPuntos]}>Puntos</Text>
          </View>
          {filas.map((f, i) =>
            esCasa(f.house) ? (
              <View key={f.house} style={[styles.fila, { borderLeftColor: CASAS[f.house].color }]}>
                <View style={[styles.colCasa, styles.casa]}>
                  <Text style={styles.puesto}>{`${i + 1}`}</Text>
                  <Escudo casa={f.house} tamano={26} />
                  <Text style={styles.nombre} numberOfLines={1}>
                    {CASAS[f.house].nombre}
                  </Text>
                </View>
                <Text style={[styles.col, styles.victorias]}>{f.victorias}</Text>
                <Text style={styles.col}>{f.segundos}</Text>
                <Text style={styles.col}>{f.terceros}</Text>
                <Text style={[styles.col, styles.colPuntos]}>{f.puntos}</Text>
              </View>
            ) : null,
          )}
          <Text style={typography.muted}>
            {`${palmares.length} ${palmares.length === 1 ? 'ruta cerrada' : 'rutas cerradas'}. Ordenadas por victorias y, si empatan, por puntos.`}
          </Text>
        </Card>

        {palmares.length === 0 && !error ? (
          <EmptyState title="Aún no hay rutas cerradas" body="Cuando la organización cierre una ruta, su resultado quedará aquí para siempre." />
        ) : null}

        {palmares.map((r) => (
          <Card key={r.route_id} style={styles.ruta}>
            <Text style={styles.rutaNombre}>{r.ruta ?? 'Ruta'}</Text>
            <Text style={typography.muted}>
              {[r.fecha ? new Date(`${r.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null, r.temporada]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={styles.rutaGanadora}>{titularGanadoras(r.ganadoras)}</Text>
            <Podio resultado={r.resultado as PuestoCasa[]} tamano={0.7} />
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  tabla: { gap: space.sm },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderLeftWidth: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.paper,
  },
  col: { width: 40, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.ink },
  colCasa: { flex: 1 },
  colPuntos: { width: 64, textAlign: 'right' },
  casa: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  puesto: { width: 16, fontSize: 14, fontWeight: '900', color: colors.inkSoft },
  nombre: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.ink },
  victorias: { fontSize: 16, fontWeight: '900' },
  ruta: { gap: space.sm },
  rutaNombre: { fontSize: 16, fontWeight: '800', color: colors.ink },
  rutaGanadora: { fontSize: 15, fontWeight: '900', color: colors.beerDark },
});

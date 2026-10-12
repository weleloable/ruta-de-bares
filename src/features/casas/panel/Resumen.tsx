import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Card } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space, typography } from '../../../lib/theme';
import type { Database } from '../../../types/database';
import { describirErrorPanel, nombreAccion } from '../acciones';
import { useAuth } from '../../auth/AuthProvider';
import { AportesCasa } from '../AportesCasa';
import { CASAS, esCasa, type IdCasa } from '../casas';
import { Escudo } from '../Escudo';

type Fila = Database['public']['Functions']['casas_admin_estadisticas']['Returns'][number];

/** Las cuatro casas: puntos, miembros, de donde salen y quien aporta mas. */
export function Resumen({ rutaId }: { rutaId: string | null }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<IdCasa | null>(null);
  const { session } = useAuth();

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('casas_admin_estadisticas', { p_route_id: rutaId });
    if (e) return setError(describirErrorPanel(e.message));
    setError(null);
    setFilas([...(data ?? [])].sort((a, b) => b.puntos - a.puntos));
  }, [rutaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const maximo = Math.max(1, ...filas.map((f) => f.puntos));
  return (
    <View style={styles.raiz}>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Text style={typography.muted}>
        {rutaId
          ? 'Puntos de esta ruta, con los podios de los minijuegos calculados ahora mismo.'
          : 'Todas las rutas juntas (sin podios: esos se calculan dentro de cada ruta).'}
        {rutaId
          ? ' Toca una casa para ver quién pone sus puntos y, en cada persona, de dónde salen.'
          : ' Elige una ruta para ver quién pone los puntos de cada casa.'}
      </Text>
      {rutaId ? (
        <AportesCasa rutaId={rutaId} casa={abierta} miId={session?.user.id ?? null} onCerrar={() => setAbierta(null)} />
      ) : null}
      {filas.map((f, i) => {
        if (!esCasa(f.house)) return null;
        const c = CASAS[f.house];
        const desglose = Object.entries(f.por_accion).sort((a, b) => b[1] - a[1]);
        return (
          <Pressable
            key={f.house}
            accessibilityRole={rutaId ? 'button' : undefined}
            accessibilityLabel={rutaId ? `${c.nombre}: ver quién pone sus puntos` : undefined}
            disabled={!rutaId}
            onPress={() => setAbierta(f.house as IdCasa)}
            style={({ pressed }) => (pressed ? styles.pulsada : null)}
          >
          <Card style={styles.casa}>
            <View style={styles.cabecera}>
              <Text style={styles.puesto}>{`${i + 1}.º`}</Text>
              <Escudo casa={f.house} tamano={36} />
              <View style={styles.nombreCaja}>
                <Text style={styles.nombre}>{c.nombre}</Text>
                <Text style={typography.muted}>{`${f.miembros} ${f.miembros === 1 ? 'miembro' : 'miembros'}`}</Text>
              </View>
              <Text style={[styles.puntos, { color: c.oscuro }]}>{f.puntos}</Text>
            </View>
            <View style={styles.barra}>
              <View style={[styles.relleno, { width: `${(100 * Math.max(0, f.puntos)) / maximo}%`, backgroundColor: c.color }]} />
            </View>
            {desglose.length > 0 ? (
              <Text style={styles.desglose}>{desglose.map(([a, p]) => `${nombreAccion(a)} ${p}`).join(' · ')}</Text>
            ) : null}
            {f.mejor ? <Text style={styles.mejor}>{`Quien más aporta: ${f.mejor} (${f.mejor_puntos})`}</Text> : null}
          </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.md },
  casa: { gap: space.sm },
  pulsada: { opacity: 0.75 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  puesto: { fontSize: 16, fontWeight: '900', color: colors.inkSoft, width: 30 },
  nombreCaja: { flex: 1 },
  nombre: { fontSize: 16, fontWeight: '800', color: colors.ink },
  puntos: { fontSize: 24, fontWeight: '900' },
  barra: { height: 8, borderRadius: radius.pill, backgroundColor: colors.paperDeep, overflow: 'hidden' },
  relleno: { height: '100%' },
  desglose: { fontSize: 12, color: colors.inkSoft },
  mejor: { fontSize: 12, color: colors.ink, fontWeight: '600' },
});

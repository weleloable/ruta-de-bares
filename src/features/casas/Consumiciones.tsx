import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { Banner, Button } from '../../components/ui';
import { hora } from '../../lib/fechas';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, typography } from '../../lib/theme';
import { useNow } from '../../lib/useNow';
import type { RouteRow } from '../../types/database';
import { CASAS, esCasa } from './casas';
import { CATEGORIAS, categoria, describirErrorConsumicion, mmss, siguientePermitida, type IdCategoria } from './reglasConsumo';

const nativo = Platform.OS !== 'web';

type Mia = { id: string; route_bar_id: string; categoria: string; puntua: boolean; created_at: string };
type Premio = { puntos: number; casa: string; nueva: boolean };

/**
 * "Añadir consumicion" en la ficha de un bar ya sellado (0045). Solo en el
 * ultimo bar que has sellado, con su espera entre registros. El servidor
 * decide cuanto puntua; aqui se ensena y se celebra.
 */
export function Consumiciones({ barId, ruta, esUltimo }: { barId: string; ruta: RouteRow; esUltimo: boolean }) {
  const ahora = useNow(1000);
  const [mias, setMias] = useState<Mia[]>([]);
  const [eligiendo, setEligiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premio, setPremio] = useState<Premio | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('consumiciones')
      .select('id, route_bar_id, categoria, puntua, created_at')
      .eq('route_id', ruta.id)
      .order('created_at', { ascending: false });
    setMias(data ?? []);
  }, [ruta.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const aqui = mias.filter((c) => c.route_bar_id === barId);
  const espera = siguientePermitida(mias, ruta.consumo_minutos ?? 30, ahora);

  async function apuntar(cat: IdCategoria) {
    setEnviando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.rpc('registrar_consumicion', { p_route_bar_id: barId, p_categoria: cat });
      if (e) throw new Error(describirErrorConsumicion(e.message));
      setEligiendo(false);
      setPremio({ puntos: data.puntos, casa: data.casa, nueva: data.categoria_nueva });
      if (data.puntos > 0) {
        try {
          Vibration.vibrate(35);
        } catch {
          // Sin vibracion.
        }
      }
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo apuntar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.raiz}>
      <Text style={typography.overline}>Consumiciones aquí</Text>

      {aqui.length > 0 ? (
        <View style={styles.lista}>
          {aqui.map((c) => (
            <View key={c.id} style={styles.chip}>
              <Text style={styles.chipTexto}>
                {categoria(c.categoria)?.icono} {categoria(c.categoria)?.nombre} · {hora(new Date(c.created_at))}
                {c.puntua ? '' : ' · sin puntos'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {premio ? <Celebracion premio={premio} onFin={() => setPremio(null)} /> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {!esUltimo ? (
        <Text style={typography.muted}>Ya has sellado otro bar: aquí ya no se pueden añadir.</Text>
      ) : espera ? (
        <Banner tone="info">{`Podrás añadir otra en ${mmss(espera, ahora)}. Sin prisa: el tiempo entre consumiciones es el mismo para todos.`}</Banner>
      ) : eligiendo ? (
        <View style={styles.rejilla}>
          {CATEGORIAS.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={`Añadir ${c.nombre}`}
              disabled={enviando}
              onPress={() => void apuntar(c.id)}
              style={({ pressed }) => [styles.categoria, c.id === 'sin_alcohol' && styles.sinAlcohol, pressed && styles.pulsada]}
            >
              <Text style={styles.icono}>{c.icono}</Text>
              <Text style={styles.nombre}>{c.nombre}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Button title="Añadir consumición" variant="secondary" icon="add-circle-outline" onPress={() => setEligiendo(true)} />
      )}

      <Text style={styles.nota}>
        {`Puntúa${(ruta.consumo_por_bar ?? 1) === 1 ? ' una' : `n ${ruta.consumo_por_bar}`} por bar. Sin alcohol puntúa igual. Bebe con cabeza.`}
      </Text>
    </View>
  );
}

function Celebracion({ premio, onFin }: { premio: Premio; onFin: () => void }) {
  const v = useRef(new Animated.Value(0)).current;
  const casa = esCasa(premio.casa) ? CASAS[premio.casa] : null;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, { toValue: 1, friction: 5, useNativeDriver: nativo }),
      Animated.delay(2200),
      Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: nativo }),
    ]).start(() => onFin());
  }, [v, onFin]);
  const texto =
    premio.puntos > 0
      ? `+${premio.puntos} para ${casa?.nombre ?? 'tu casa'}${premio.nueva ? ' · ¡categoría nueva!' : ''}`
      : 'Apuntada (ya no puntúa más en este bar)';
  return (
    <Animated.View
      style={[
        styles.premio,
        { backgroundColor: premio.puntos > 0 ? (casa?.color ?? colors.beer) : colors.paperDeep },
        { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
      ]}
    >
      <Text style={[styles.premioTexto, { color: premio.puntos > 0 ? (casa?.texto ?? '#fff') : colors.ink }]}>{texto}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  lista: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.paperDeep },
  chipTexto: { fontSize: 12, color: colors.ink },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  categoria: {
    width: '31%',
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  sinAlcohol: { borderColor: colors.green, borderWidth: 2 },
  pulsada: { opacity: 0.7 },
  icono: { fontSize: 26 },
  nombre: { fontSize: 13, fontWeight: '700', color: colors.ink },
  nota: { fontSize: 11, color: colors.inkSoft },
  premio: { padding: space.md, borderRadius: radius.pill, alignItems: 'center' },
  premioTexto: { fontSize: 16, fontWeight: '900', textAlign: 'center' },
});

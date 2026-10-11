import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { Card } from '../../components/ui';
import { colors, radius, space, typography } from '../../lib/theme';
import { CASAS, type IdCasa } from './casas';
import { Escudo } from './Escudo';
import { useMiCasa } from './MiCasa';
import { lider, ordenarRanking, subidas, type FilaRanking, type FilaServidor } from './ranking';
import { useRankingCasas } from './useRankingCasas';

const nativo = Platform.OS !== 'web';

/**
 * La clasificacion de las cuatro casas en la ruta, en directo (0044). Va en
 * Sellos, bajo la credencial. Cuando una casa suma, sale un "+N" sobre su fila;
 * cuando cambia el lider, un aviso con la corona.
 */
export function RankingCasas({ rutaId }: { rutaId: string }) {
  const { filas } = useRankingCasas(rutaId);
  const { casa: miCasa } = useMiCasa();
  const router = useRouter();
  return <TablaCasas filas={filas} miCasa={miCasa} onHistorico={() => router.push('/casas/historico')} />;
}

/** La tabla en si, a partir de las filas del servidor (se puede ensenar sola). */
export function TablaCasas({
  filas,
  miCasa,
  onHistorico,
}: {
  filas: FilaServidor[] | null;
  miCasa: IdCasa | null;
  onHistorico?: () => void;
}) {
  const anteriores = useRef<FilaServidor[] | null>(null);
  const [ganado, setGanado] = useState<Partial<Record<IdCasa, number>>>({});
  const [nuevoLider, setNuevoLider] = useState<IdCasa | null>(null);

  const ordenadas = filas ? ordenarRanking(filas) : null;

  // Que ha cambiado desde la lectura anterior: subidas y cambio de lider.
  useEffect(() => {
    if (!filas) return;
    const previas = anteriores.current;
    anteriores.current = filas;
    if (!previas) return;
    const s = subidas(previas, filas);
    if (Object.keys(s).length > 0) setGanado(s);
    const antes = lider(ordenarRanking(previas));
    const ahora = lider(ordenarRanking(filas));
    if (ahora && ahora !== antes) {
      setNuevoLider(ahora);
      try {
        Vibration.vibrate([0, 40, 60, 40]);
      } catch {
        // Sin vibracion: solo se ve.
      }
    }
  }, [filas]);

  if (!ordenadas) return null;
  const hayPuntos = ordenadas.some((f) => f.puntos > 0);

  return (
    <Card style={styles.tarjeta}>
      <View style={styles.cabecera}>
        <Ionicons name="trophy" size={18} color={colors.beerDark} />
        <Text style={[typography.sectionTitle, styles.titulo]}>Casas en esta ruta</Text>
        <View style={styles.directo}>
          <View style={styles.punto} />
          <Text style={styles.directoTexto}>EN DIRECTO</Text>
        </View>
        {onHistorico ? (
          <Pressable accessibilityRole="link" onPress={onHistorico} hitSlop={8}>
            <Text style={styles.historico}>Histórico ›</Text>
          </Pressable>
        ) : null}
      </View>

      {nuevoLider ? <AvisoLider casa={nuevoLider} onFin={() => setNuevoLider(null)} /> : null}

      {ordenadas.map((f) => (
        <Fila key={f.house} fila={f} mia={f.house === miCasa} ganado={ganado[f.house]} onVisto={() => setGanado((g) => ({ ...g, [f.house]: undefined }))} />
      ))}

      {!hayPuntos ? (
        <Text style={typography.muted}>Aún no hay puntos: el primer sello abre el marcador.</Text>
      ) : null}
    </Card>
  );
}

function Fila({ fila, mia, ganado, onVisto }: { fila: FilaRanking; mia: boolean; ganado?: number; onVisto: () => void }) {
  const c = CASAS[fila.house];
  const barra = useRef(new Animated.Value(fila.progreso)).current;
  const globo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barra, { toValue: fila.progreso, duration: 600, useNativeDriver: false }).start();
  }, [fila.progreso, barra]);

  useEffect(() => {
    if (!ganado) return;
    globo.setValue(0);
    Animated.timing(globo, { toValue: 1, duration: 1400, useNativeDriver: nativo }).start(() => onVisto());
  }, [ganado, globo, onVisto]);

  return (
    <View style={[styles.fila, mia && { borderColor: c.color, backgroundColor: `${c.color}12` }]}>
      <Text style={[styles.puesto, fila.puesto === 1 && fila.puntos > 0 && { color: c.color }]}>{fila.puesto}</Text>
      <Escudo casa={fila.house} tamano={34} />
      <View style={styles.centro}>
        <View style={styles.nombreFila}>
          <Text style={styles.nombre} numberOfLines={1}>
            {c.nombre}
          </Text>
          {fila.lider ? <Ionicons name="star" size={14} color={c.color} /> : null}
          {mia ? <Text style={[styles.tuya, { color: c.color }]}>· tu casa</Text> : null}
        </View>
        <View style={styles.pista}>
          <Animated.View
            style={[
              styles.relleno,
              { backgroundColor: c.color, width: barra.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
            ]}
          />
        </View>
        <Text style={styles.diferencia}>
          {fila.lider
            ? `Lidera por ${fila.sobreSiguiente}`
            : fila.aLider > 0
              ? `A ${fila.aLider} del primer puesto`
              : fila.puntos > 0
                ? 'Empatada en cabeza'
                : `${fila.miembros} ${fila.miembros === 1 ? 'miembro' : 'miembros'} en la ruta`}
        </Text>
      </View>
      <View style={styles.puntosCaja}>
        <Text style={[styles.puntos, { color: c.color }]}>{fila.puntos}</Text>
        <Text style={styles.pts}>pts</Text>
        {ganado ? (
          <Animated.Text
            style={[
              styles.globo,
              { color: c.color },
              {
                opacity: globo.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: globo.interpolate({ inputRange: [0, 1], outputRange: [6, -26] }) }],
              },
            ]}
          >
            +{ganado}
          </Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

function AvisoLider({ casa, onFin }: { casa: IdCasa; onFin: () => void }) {
  const c = CASAS[casa];
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, { toValue: 1, friction: 5, useNativeDriver: nativo }),
      Animated.delay(2600),
      Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: nativo }),
    ]).start(() => onFin());
  }, [v, onFin]);
  return (
    <Animated.View
      style={[
        styles.aviso,
        { backgroundColor: c.color, opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] },
      ]}
    >
      <Ionicons name="trophy" size={20} color={c.detalle} />
      <Text style={[styles.avisoTexto, { color: c.texto }]}>¡{c.nombre} toma el liderato!</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { gap: space.sm },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  titulo: { flex: 1 },
  directo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  punto: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.stamp },
  directoTexto: { fontSize: 10, fontWeight: '800', color: colors.stamp, letterSpacing: 0.8 },
  historico: { fontSize: 12, fontWeight: '700', color: colors.beerDark, marginLeft: space.sm },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  puesto: { width: 18, fontSize: 18, fontWeight: '900', color: colors.inkSoft, textAlign: 'center' },
  centro: { flex: 1, gap: 3 },
  nombreFila: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nombre: { fontSize: 15, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  tuya: { fontSize: 12, fontWeight: '700' },
  pista: { height: 8, borderRadius: 4, backgroundColor: colors.paperDeep, overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 4 },
  diferencia: { fontSize: 11, color: colors.inkSoft },
  puntosCaja: { minWidth: 52, alignItems: 'flex-end' },
  puntos: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  pts: { fontSize: 10, fontWeight: '700', color: colors.inkSoft, marginTop: -2 },
  globo: { position: 'absolute', right: 0, top: -6, fontSize: 16, fontWeight: '900' },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.pill,
  },
  avisoTexto: { fontSize: 15, fontWeight: '900' },
});

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';

import { Button } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, typography } from '../../lib/theme';
import { useSondeo } from '../../lib/useSondeo';
import type { Database } from '../../types/database';
import { recienConseguidos, textoCondicion, TIPOS_RETO } from './retos';

const nativo = Platform.OS !== 'web';

type Reto = Database['public']['Functions']['retos_mios']['Returns'][number];

/**
 * Los retos de la ruta (0047) en Ruta/Sellos: una fila compacta ("Retos 1/3")
 * que abre la lista con el progreso de cada uno. Se refresca cada 30 s y al
 * sellar; cuando uno pasa a conseguido, sale un aviso con sus puntos.
 */
export function RetosRuta({ rutaId, sellos }: { rutaId: string; sellos: number }) {
  const [retos, setRetos] = useState<Reto[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<Reto | null>(null);
  const anteriores = useRef<Reto[] | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('retos_mios', { p_route_id: rutaId });
    if (error || !data) return;
    const nuevos = recienConseguidos(anteriores.current, data);
    anteriores.current = data;
    setRetos(data);
    if (nuevos.length > 0) {
      setAviso(nuevos[0]);
      try {
        Vibration.vibrate([0, 40, 60, 40]);
      } catch {
        // Sin vibracion.
      }
    }
  }, [rutaId]);

  // Otra ruta: lo de antes no cuenta para celebrar.
  useEffect(() => {
    anteriores.current = null;
  }, [rutaId]);
  // Al sellar puede caer un reto: se mira en el acto.
  useEffect(() => {
    void cargar();
  }, [cargar, sellos]);
  useSondeo(cargar, 30_000);

  if (!retos || retos.length === 0) return null;
  const hechos = retos.filter((r) => r.conseguido).length;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Retos de la ruta: ${hechos} de ${retos.length} conseguidos`}
        onPress={() => setAbierto(true)}
        style={({ pressed }) => [styles.fila, pressed && styles.pulsada]}
      >
        <Text style={styles.filaIcono}>🎯</Text>
        <Text style={styles.filaTexto}>Retos</Text>
        <Text style={styles.filaCuenta}>{`${hechos}/${retos.length}`}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
      </Pressable>

      {aviso ? <AvisoReto reto={aviso} onFin={() => setAviso(null)} /> : null}

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <View style={styles.fondo}>
          <ScrollView contentContainerStyle={styles.hoja}>
            <Text style={typography.sectionTitle}>Retos de la ruta</Text>
            <Text style={typography.muted}>Cada reto suma una vez para tu casa. Ninguno premia beber más ni más rápido.</Text>
            {retos.map((r) => (
              <TarjetaReto key={r.id} reto={r} />
            ))}
            <Button title="Cerrar" variant="secondary" onPress={() => setAbierto(false)} />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export function TarjetaReto({ reto: r }: { reto: Reto }) {
  const icono = TIPOS_RETO.find((t) => t.id === r.tipo)?.icono ?? '🎯';
  const plazas = r.max_personas === null ? null : Math.max(0, r.max_personas - r.conseguidos);
  const agotado = !r.conseguido && plazas === 0;
  return (
    <View style={[styles.reto, r.conseguido && styles.retoHecho, agotado && styles.retoAgotado]}>
      <View style={styles.retoCabecera}>
        <Text style={styles.retoIcono}>{r.conseguido ? '✅' : icono}</Text>
        <View style={styles.retoTextos}>
          <Text style={styles.retoNombre}>{r.nombre}</Text>
          <Text style={styles.retoCondicion}>{textoCondicion(r)}</Text>
          {r.descripcion ? <Text style={styles.retoDescripcion}>{r.descripcion}</Text> : null}
        </View>
        <Text style={styles.retoPuntos}>{`+${r.puntos}`}</Text>
      </View>
      {r.tipo !== 'ruta_antes_de' ? (
        <View style={styles.barra}>
          <View style={[styles.relleno, { width: `${(100 * r.progreso) / Math.max(1, r.meta)}%` }]} />
        </View>
      ) : null}
      <Text style={styles.retoPie}>
        {r.conseguido
          ? '¡Conseguido!'
          : agotado
            ? 'Ya lo han conseguido todos los que podían.'
            : `${r.tipo === 'ruta_antes_de' ? '' : `${r.progreso} de ${r.meta}`}${
                plazas !== null ? `${r.tipo === 'ruta_antes_de' ? '' : ' · '}Quedan ${plazas} plazas` : ''
              }`}
      </Text>
    </View>
  );
}

function AvisoReto({ reto, onFin }: { reto: Reto; onFin: () => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, { toValue: 1, friction: 5, useNativeDriver: nativo }),
      Animated.delay(3000),
      Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: nativo }),
    ]).start(() => onFin());
  }, [v, onFin]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.aviso, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}
    >
      <Text style={styles.avisoTexto}>{`🎯 ¡Reto conseguido! ${reto.nombre} · +${reto.puntos}`}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pulsada: { opacity: 0.7 },
  filaIcono: { fontSize: 16 },
  filaTexto: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.ink },
  filaCuenta: { fontSize: 14, fontWeight: '800', color: colors.beerDark },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center' },
  hoja: {
    margin: space.lg,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 460,
  },
  reto: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  retoHecho: { borderColor: colors.green, borderWidth: 2 },
  retoAgotado: { opacity: 0.55 },
  retoCabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  retoIcono: { fontSize: 22 },
  retoTextos: { flex: 1, gap: 2 },
  retoNombre: { fontSize: 15, fontWeight: '800', color: colors.ink },
  retoCondicion: { fontSize: 13, color: colors.ink },
  retoDescripcion: { fontSize: 12, color: colors.inkSoft },
  retoPuntos: { fontSize: 16, fontWeight: '900', color: colors.beerDark },
  barra: { height: 8, borderRadius: radius.pill, backgroundColor: colors.paperDeep, overflow: 'hidden' },
  relleno: { height: '100%', backgroundColor: colors.beer },
  retoPie: { fontSize: 12, color: colors.inkSoft },
  aviso: {
    marginTop: space.xs,
    padding: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: 'center',
  },
  avisoTexto: { color: colors.white, fontWeight: '800', fontSize: 14, textAlign: 'center' },
});

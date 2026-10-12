import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, typography } from '../../lib/theme';
import type { RouteRow } from '../../types/database';
import { reglasInfo, type LimitesRuta } from './reglasInfo';

const LIMITES_POR_DEFECTO: LimitesRuta = {
  consumo_minutos: 30,
  consumo_por_bar: 1,
  consumo_por_ruta: 6,
  variedad_max: 3,
  qr_max: 5,
  racha_repetible: false,
};

/**
 * El boton (i) de "Casas en esta ruta" (0054): una ventana con todas las
 * formas de ganar puntos, con los valores y limites ACTUALES de la ruta (los
 * que un admin puede cambiar en el panel).
 */
export function InfoPuntos({ ruta, visible, onCerrar }: { ruta: RouteRow | null; visible: boolean; onCerrar: () => void }) {
  const [puntos, setPuntos] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return undefined;
    let vivo = true;
    setError(null);
    void supabase.rpc('casas_puntos').then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) {
        setError(/PGRST202|Could not find/i.test(e.message) ? 'Falta aplicar la migración 0054 en Supabase.' : e.message);
        setPuntos({});
        return;
      }
      setPuntos(Object.fromEntries((data ?? []).map((r) => [r.action, r.points])));
    });
    return () => {
      vivo = false;
    };
  }, [visible]);

  const limites: LimitesRuta = ruta
    ? {
        consumo_minutos: ruta.consumo_minutos ?? LIMITES_POR_DEFECTO.consumo_minutos,
        consumo_por_bar: ruta.consumo_por_bar ?? LIMITES_POR_DEFECTO.consumo_por_bar,
        consumo_por_ruta: ruta.consumo_por_ruta ?? LIMITES_POR_DEFECTO.consumo_por_ruta,
        variedad_max: ruta.variedad_max ?? LIMITES_POR_DEFECTO.variedad_max,
        qr_max: ruta.qr_max ?? LIMITES_POR_DEFECTO.qr_max,
        racha_repetible: ruta.racha_repetible ?? LIMITES_POR_DEFECTO.racha_repetible,
      }
    : LIMITES_POR_DEFECTO;

  return <HojaInfoPuntos visible={visible} puntos={puntos} limites={limites} error={error} onCerrar={onCerrar} />;
}

/** La hoja en si, a partir de los datos (se puede ensenar sola). */
export function HojaInfoPuntos({
  visible,
  puntos,
  limites,
  error,
  onCerrar,
}: {
  visible: boolean;
  puntos: Record<string, number> | null;
  limites: LimitesRuta;
  error: string | null;
  onCerrar: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar} accessibilityLabel="Cerrar">
        <Pressable style={styles.hoja} onPress={() => undefined}>
          <View style={styles.cabecera}>
            <Text style={typography.sectionTitle}>Cómo se ganan puntos</Text>
            <Text style={typography.muted}>Todo lo que consigues suma para tu casa en esta ruta.</Text>
          </View>
          <ScrollView style={styles.cuerpo} contentContainerStyle={styles.cuerpoInterior}>
            {error ? <Banner tone="error">{error}</Banner> : null}
            {!puntos ? <ActivityIndicator color={colors.beer} /> : null}
            {puntos
              ? reglasInfo(puntos, limites).map((r) => (
                  <View key={r.titulo} style={styles.regla}>
                    <Text style={styles.icono}>{r.icono}</Text>
                    <View style={styles.reglaTextos}>
                      <View style={styles.reglaTitulo}>
                        <Text style={styles.titulo}>{r.titulo}</Text>
                        {r.puntos ? <Text style={styles.puntos}>{r.puntos}</Text> : null}
                      </View>
                      <Text style={styles.texto}>{r.texto}</Text>
                    </View>
                  </View>
                ))
              : null}
            <Text style={styles.nota}>
              Bebe con cabeza: ningún punto premia beber más ni más rápido, y las opciones sin alcohol puntúan igual.
            </Text>
          </ScrollView>
          <View style={styles.pie}>
            <Button title="Entendido" onPress={onCerrar} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: space.lg },
  hoja: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 460,
    maxHeight: '88%',
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  cabecera: { padding: space.md, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
  cuerpo: { flexGrow: 0 },
  cuerpoInterior: { padding: space.md, gap: space.sm },
  regla: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icono: { fontSize: 22, width: 30, textAlign: 'center' },
  reglaTextos: { flex: 1, gap: 2 },
  reglaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  titulo: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.ink },
  puntos: { fontSize: 15, fontWeight: '900', color: colors.beerDark },
  texto: { fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  nota: { fontSize: 12, color: colors.inkSoft, marginTop: space.xs },
  pie: { padding: space.md },
});

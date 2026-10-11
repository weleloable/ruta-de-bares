import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, typography } from '../../lib/theme';
import { CASAS, type IdCasa } from './casas';
import { Escudo } from './Escudo';
import { formatearPuntos, ordenarAportes, type Aporte } from './ranking';

/**
 * La lista de quien pone los puntos de una casa en la ruta (0052). Se abre al
 * tocar la casa en la tabla de Sellos. Los encuentros por QR se reparten a
 * medias entre los dos y la racha entre quienes la hicieron, por eso hay
 * decimales. La suma de la lista es la de la casa en el ranking.
 */
export function AportesCasa({ rutaId, casa, miId, onCerrar }: { rutaId: string; casa: IdCasa | null; miId: string | null; onCerrar: () => void }) {
  const [filas, setFilas] = useState<Aporte[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!casa) return undefined;
    let vivo = true;
    setFilas(null);
    setError(null);
    void supabase.rpc('casas_aportes', { p_route_id: rutaId, p_house: casa }).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) {
        setError(/PGRST202|Could not find/i.test(e.message) ? 'Falta aplicar la migración 0052 en Supabase.' : e.message);
        return;
      }
      setFilas((data ?? []).map((f) => ({ user_id: f.user_id, nombre: f.nombre, puntos: Number(f.puntos) })));
    });
    return () => {
      vivo = false;
    };
  }, [rutaId, casa]);

  return <HojaAportes casa={casa} filas={filas} error={error} miId={miId} onCerrar={onCerrar} />;
}

/** La hoja en si, a partir de las filas (se puede ensenar sola). */
export function HojaAportes({
  casa,
  filas,
  error,
  miId,
  onCerrar,
}: {
  casa: IdCasa | null;
  filas: Aporte[] | null;
  error: string | null;
  miId: string | null;
  onCerrar: () => void;
}) {
  const c = casa ? CASAS[casa] : null;
  const lista = filas ? ordenarAportes(filas) : null;
  const total = lista ? lista.reduce((s, f) => s + f.puntos, 0) : 0;

  return (
    <Modal visible={casa !== null} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar} accessibilityLabel="Cerrar">
        {/* Un toque dentro de la hoja no la cierra. */}
        <Pressable style={styles.hoja} onPress={() => undefined}>
          {c && casa ? (
            <View style={[styles.cabecera, { backgroundColor: c.color }]}>
              <Escudo casa={casa} tamano={40} />
              <View style={styles.cabeceraTextos}>
                <Text style={[styles.casaNombre, { color: c.texto }]}>{c.nombre}</Text>
                <Text style={[styles.casaSub, { color: c.detalle }]}>Quién pone los puntos</Text>
              </View>
              <Text style={[styles.casaTotal, { color: c.texto }]}>{formatearPuntos(total)}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.cuerpo} contentContainerStyle={styles.cuerpoInterior}>
            {error ? <Banner tone="error">{error}</Banner> : null}
            {!lista && !error ? <ActivityIndicator color={colors.beer} /> : null}
            {lista && lista.length === 0 ? <Text style={typography.muted}>Esta casa aún no tiene a nadie en la ruta.</Text> : null}

            {lista?.map((f, i) => {
              const mia = f.user_id !== null && f.user_id === miId;
              return (
                <View key={f.user_id ?? 'sin-persona'} style={[styles.fila, mia && c ? { borderColor: c.color } : null]}>
                  <Text style={styles.puesto}>{f.user_id === null ? '' : i + 1}</Text>
                  <Text style={[styles.nombre, f.user_id === null && styles.sinPersona]} numberOfLines={1}>
                    {f.user_id === null ? 'Ajustes y cuentas borradas' : f.nombre}
                    {mia ? ' · tú' : ''}
                  </Text>
                  <Text style={[styles.puntos, f.puntos === 0 && styles.cero]}>{formatearPuntos(f.puntos)}</Text>
                </View>
              );
            })}

            {lista && lista.length > 0 ? (
              <Text style={styles.nota}>
                Los encuentros por QR se reparten a partes iguales entre los dos, y la racha entre quienes la hicieron.
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.pie}>
            <Button title="Cerrar" variant="secondary" onPress={onCerrar} />
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
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  cabeceraTextos: { flex: 1 },
  casaNombre: { fontSize: 20, fontWeight: '900' },
  casaSub: { fontSize: 12, fontWeight: '700' },
  casaTotal: { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  cuerpo: { flexGrow: 0 },
  cuerpoInterior: { padding: space.md, gap: space.xs },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.card,
  },
  puesto: { width: 20, fontSize: 14, fontWeight: '900', color: colors.inkSoft, textAlign: 'center' },
  nombre: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  sinPersona: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  puntos: { fontSize: 17, fontWeight: '900', color: colors.ink, fontVariant: ['tabular-nums'] },
  cero: { color: colors.inkFaint },
  nota: { fontSize: 12, color: colors.inkSoft, marginTop: space.sm },
  pie: { padding: space.md },
});

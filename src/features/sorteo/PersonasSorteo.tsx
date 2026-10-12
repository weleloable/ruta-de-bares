import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field } from '../../components/ui';
import { colors, radius, space, typography } from '../../lib/theme';
import { excluirDelSorteo, incluirEnSorteo, leerPersonasSorteo } from './api';
import type { PersonaSorteo } from './sorteo';

/**
 * "Quién participa" en el editor de la ruta (0063): la gente de la ruta, con
 * cuantos bares lleva, y un boton para sacar del sorteo a quien lo pida (con
 * motivo opcional) o volverle a meter. Plegado por defecto: solo hace falta
 * cuando alguien escribe. `onCambio` refresca la cuenta de participantes.
 */
export function PersonasSorteo({ routeId, onCambio }: { routeId: string; onCambio: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [personas, setPersonas] = useState<PersonaSorteo[] | null>(null);
  const [sacando, setSacando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setPersonas(await leerPersonasSorteo(routeId));
  }, [routeId]);

  useEffect(() => {
    if (abierta) void cargar();
  }, [abierta, cargar]);

  async function cambiar(p: PersonaSorteo) {
    setOcupado(true);
    setError(null);
    try {
      if (p.excluido) await incluirEnSorteo(routeId, p.user_id);
      else await excluirDelSorteo(routeId, p.user_id, motivo.trim() || undefined);
      setSacando(null);
      setMotivo('');
      await cargar();
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar.');
    } finally {
      setOcupado(false);
    }
  }

  const fuera = personas?.filter((p) => p.excluido).length ?? 0;
  return (
    <View style={styles.caja}>
      <Pressable accessibilityRole="button" onPress={() => setAbierta((a) => !a)} style={styles.cabecera}>
        <Text style={[typography.body, styles.titulo]}>
          {`Quién participa${fuera > 0 ? ` · ${fuera} fuera` : ''}`}
        </Text>
        <Ionicons name={abierta ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
      </Pressable>

      {abierta ? (
        personas === null ? (
          <Text style={typography.muted}>Falta aplicar la migración 0063 en Supabase.</Text>
        ) : personas.length === 0 ? (
          <Text style={typography.muted}>Todavía no hay nadie en la ruta.</Text>
        ) : (
          <>
            <Text style={typography.muted}>
              Si alguien pide no participar, sácale aquí. Puedes volver a meterle cuando quieras (antes de sortear).
            </Text>
            {error ? <Banner tone="error">{error}</Banner> : null}
            {personas.map((p) => (
              <View key={p.user_id} style={styles.fila}>
                <View style={styles.linea}>
                  <View style={styles.datos}>
                    <Text style={[styles.nombre, p.excluido && styles.tachado]} numberOfLines={1}>
                      {p.nombre}
                    </Text>
                    <Text style={styles.detalle} numberOfLines={1}>
                      {p.excluido
                        ? `Fuera: ${p.motivo ?? 'pidió no participar'}`
                        : p.completa
                          ? '✓ Entra en el sorteo'
                          : `${p.bares_sellados} ${p.bares_sellados === 1 ? 'bar sellado' : 'bares sellados'}`}
                    </Text>
                  </View>
                  {sacando === p.user_id ? null : (
                    <Pressable
                      accessibilityRole="button"
                      disabled={ocupado}
                      onPress={() => (p.excluido ? void cambiar(p) : (setSacando(p.user_id), setMotivo('')))}
                      style={({ pressed }) => [styles.accion, p.excluido ? styles.accionMeter : styles.accionSacar, pressed && styles.pulsada]}
                    >
                      <Text style={[styles.accionTexto, p.excluido ? styles.textoMeter : styles.textoSacar]}>
                        {p.excluido ? 'Volver a meter' : 'Sacar'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {sacando === p.user_id ? (
                  <>
                    <Field label="Motivo (opcional)" value={motivo} maxLength={200} onChangeText={setMotivo} placeholder="Pidió no participar" />
                    <View style={styles.acciones}>
                      <Button title="Cancelar" variant="ghost" onPress={() => setSacando(null)} />
                      <Button title="Sacar del sorteo" variant="danger" loading={ocupado} onPress={() => void cambiar(p)} />
                    </View>
                  </>
                ) : null}
              </View>
            ))}
          </>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontWeight: '700' },
  fila: { gap: space.sm, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  linea: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  datos: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: '700', color: colors.ink },
  tachado: { textDecorationLine: 'line-through', color: colors.inkFaint },
  detalle: { fontSize: 13, color: colors.inkSoft },
  accion: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1 },
  accionSacar: { borderColor: colors.stamp },
  accionMeter: { borderColor: colors.inkSoft },
  accionTexto: { fontSize: 13, fontWeight: '800' },
  textoSacar: { color: colors.stamp },
  textoMeter: { color: colors.ink },
  pulsada: { opacity: 0.7 },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});

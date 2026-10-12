import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, typography } from '../../lib/theme';
import { CASAS, type IdCasa } from './casas';
import { Escudo } from './Escudo';
import { nombreProcedencia, vecesProcedencia, type LineaProcedencia } from './procedencia';
import { formatearPuntos, ordenarAportes, type Aporte } from './ranking';

const sinMigracion = (m: string, n: string) => (/PGRST202|Could not find/i.test(m) ? `Falta aplicar la migración ${n} en Supabase.` : m);

/**
 * Quien pone los puntos de una casa en la ruta (0052) y, al tocar a una
 * persona, de donde salen los suyos (0053). Se abre al tocar la casa en la
 * tabla de Sellos. Los encuentros por QR se reparten a medias entre los dos y
 * la racha entre quienes la hicieron, por eso hay decimales. La suma de la
 * lista es la de la casa en el ranking, y la del desglose, la de la persona.
 */
export function AportesCasa({ rutaId, casa, miId, onCerrar }: { rutaId: string; casa: IdCasa | null; miId: string | null; onCerrar: () => void }) {
  const [filas, setFilas] = useState<Aporte[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persona, setPersona] = useState<{ id: string; nombre: string; puntos: number } | null>(null);
  const [lineas, setLineas] = useState<LineaProcedencia[] | null>(null);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  useEffect(() => {
    setPersona(null);
    if (!casa) return undefined;
    let vivo = true;
    setFilas(null);
    setError(null);
    void supabase.rpc('casas_aportes', { p_route_id: rutaId, p_house: casa }).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) return setError(sinMigracion(e.message, '0052'));
      setFilas((data ?? []).map((f) => ({ user_id: f.user_id, nombre: f.nombre, puntos: Number(f.puntos) })));
    });
    return () => {
      vivo = false;
    };
  }, [rutaId, casa]);

  useEffect(() => {
    if (!casa || !persona) return undefined;
    let vivo = true;
    setLineas(null);
    setErrorDetalle(null);
    void supabase
      .rpc('casas_aportes_detalle', { p_route_id: rutaId, p_house: casa, p_user_id: persona.id })
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) return setErrorDetalle(sinMigracion(e.message, '0053'));
        setLineas((data ?? []).map((l) => ({ ...l, puntos: Number(l.puntos) })));
      });
    return () => {
      vivo = false;
    };
  }, [rutaId, casa, persona]);

  return (
    <HojaAportes
      casa={casa}
      filas={filas}
      error={error}
      miId={miId}
      onCerrar={onCerrar}
      persona={persona}
      lineas={lineas}
      errorDetalle={errorDetalle}
      onPersona={(f) => {
        if (f.user_id) setPersona({ id: f.user_id, nombre: f.nombre ?? '', puntos: f.puntos });
      }}
      onVolver={() => setPersona(null)}
    />
  );
}

/** La hoja en si, a partir de las filas (se puede ensenar sola). */
export function HojaAportes({
  casa,
  filas,
  error,
  miId,
  onCerrar,
  persona = null,
  lineas = null,
  errorDetalle = null,
  onPersona,
  onVolver,
}: {
  casa: IdCasa | null;
  filas: Aporte[] | null;
  error: string | null;
  miId: string | null;
  onCerrar: () => void;
  /** Si hay una persona elegida, se ensena su desglose en vez de la lista. */
  persona?: { id: string; nombre: string; puntos: number } | null;
  lineas?: LineaProcedencia[] | null;
  errorDetalle?: string | null;
  onPersona?: (f: Aporte) => void;
  onVolver?: () => void;
}) {
  const c = casa ? CASAS[casa] : null;
  const lista = filas ? ordenarAportes(filas) : null;
  const total = lista ? lista.reduce((s, f) => s + f.puntos, 0) : 0;

  return (
    <Modal visible={casa !== null} transparent animationType="fade" onRequestClose={persona && onVolver ? onVolver : onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar} accessibilityLabel="Cerrar">
        {/* Un toque dentro de la hoja no la cierra. */}
        <Pressable style={styles.hoja} onPress={() => undefined}>
          {c && casa ? (
            <View style={[styles.cabecera, { backgroundColor: c.color }]}>
              <Escudo casa={casa} tamano={40} />
              <View style={styles.cabeceraTextos}>
                <Text style={[styles.casaNombre, { color: c.texto }]} numberOfLines={1}>
                  {persona ? persona.nombre : c.nombre}
                </Text>
                <Text style={[styles.casaSub, { color: c.detalle }]}>
                  {persona ? `De dónde salen sus puntos · ${c.nombre}` : 'Quién pone los puntos'}
                </Text>
              </View>
              <Text style={[styles.casaTotal, { color: c.texto }]}>{formatearPuntos(persona ? persona.puntos : total)}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.cuerpo} contentContainerStyle={styles.cuerpoInterior}>
            {persona ? (
              <>
                {errorDetalle ? <Banner tone="error">{errorDetalle}</Banner> : null}
                {!lineas && !errorDetalle ? <ActivityIndicator color={colors.beer} /> : null}
                {lineas && lineas.length === 0 ? <Text style={typography.muted}>Todavía no ha conseguido puntos.</Text> : null}
                {lineas?.map((l) => {
                  const veces = vecesProcedencia(l);
                  return (
                    <View key={`${l.tipo}|${l.detalle}|${l.puesto}`} style={styles.fila}>
                      <Text style={styles.nombre} numberOfLines={2}>
                        {nombreProcedencia(l)}
                        {veces ? <Text style={styles.veces}>{`  ${veces}`}</Text> : null}
                      </Text>
                      <Text style={styles.puntos}>{formatearPuntos(l.puntos)}</Text>
                    </View>
                  );
                })}
                {lineas && lineas.length > 0 ? (
                  <Text style={styles.nota}>Los encuentros por QR cuentan a partes iguales entre los dos, y la racha entre quienes la hicieron.</Text>
                ) : null}
              </>
            ) : (
              <>
                {error ? <Banner tone="error">{error}</Banner> : null}
                {!lista && !error ? <ActivityIndicator color={colors.beer} /> : null}
                {lista && lista.length === 0 ? <Text style={typography.muted}>Esta casa aún no tiene a nadie en la ruta.</Text> : null}

                {lista?.map((f, i) => {
                  const mia = f.user_id !== null && f.user_id === miId;
                  const sinPersona = f.user_id === null;
                  return (
                    <Pressable
                      key={f.user_id ?? 'sin-persona'}
                      accessibilityRole={sinPersona ? undefined : 'button'}
                      accessibilityLabel={sinPersona ? undefined : `${f.nombre}, ${formatearPuntos(f.puntos)} puntos. Ver de dónde salen`}
                      disabled={sinPersona || !onPersona}
                      onPress={() => onPersona?.(f)}
                      style={({ pressed }) => [styles.fila, mia && c ? { borderColor: c.color } : null, pressed && styles.pulsada]}
                    >
                      <Text style={styles.puesto}>{sinPersona ? '' : i + 1}</Text>
                      <Text style={[styles.nombre, sinPersona && styles.sinPersona]} numberOfLines={1}>
                        {sinPersona ? 'Ajustes y cuentas borradas' : f.nombre}
                        {mia ? ' · tú' : ''}
                      </Text>
                      <Text style={[styles.puntos, f.puntos === 0 && styles.cero]}>{formatearPuntos(f.puntos)}</Text>
                      {sinPersona ? <View style={styles.sinFlecha} /> : <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />}
                    </Pressable>
                  );
                })}

                {lista && lista.length > 0 ? (
                  <Text style={styles.nota}>
                    Toca a alguien para ver de dónde salen sus puntos. Los encuentros por QR se reparten a partes iguales entre los dos, y
                    la racha entre quienes la hicieron.
                  </Text>
                ) : null}
              </>
            )}
          </ScrollView>

          <View style={styles.pie}>
            {persona && onVolver ? (
              <View style={styles.pieBoton}>
                <Button title="Volver" variant="secondary" icon="chevron-back" onPress={onVolver} />
              </View>
            ) : null}
            <View style={styles.pieBoton}>
              <Button title="Cerrar" variant="secondary" onPress={onCerrar} />
            </View>
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
  pulsada: { opacity: 0.7 },
  puesto: { width: 20, fontSize: 14, fontWeight: '900', color: colors.inkSoft, textAlign: 'center' },
  nombre: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  veces: { fontSize: 13, fontWeight: '800', color: colors.inkSoft },
  sinPersona: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  puntos: { fontSize: 17, fontWeight: '900', color: colors.ink, fontVariant: ['tabular-nums'] },
  cero: { color: colors.inkFaint },
  sinFlecha: { width: 16 },
  nota: { fontSize: 12, color: colors.inkSoft, marginTop: space.sm },
  pie: { flexDirection: 'row', gap: space.sm, padding: space.md },
  pieBoton: { flex: 1 },
});

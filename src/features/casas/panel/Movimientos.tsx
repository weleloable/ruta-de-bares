import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Field } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space, typography } from '../../../lib/theme';
import type { Database } from '../../../types/database';
import { Casilla } from '../../match/piezas';
import { ACCIONES, describirErrorPanel, detalleMovimiento, leerPuntosAjuste, nombreAccion } from '../acciones';
import { CASAS, esCasa, ORDEN_CASAS, type IdCasa } from '../casas';
import { Escudo } from '../Escudo';
import { Chips, fechaCorta } from './piezas';

type Mov = Database['public']['Functions']['casas_admin_movimientos']['Returns'][number];

const TODAS = '__todas';
const OPC_CASAS = [{ id: TODAS, texto: 'Todas' }, ...ORDEN_CASAS.map((c) => ({ id: c as string, texto: CASAS[c].nombre }))];
const OPC_ACCIONES = [{ id: TODAS, texto: 'Todo' }, ...ACCIONES.map((a) => ({ id: a.id, texto: a.nombre }))];

/**
 * Todos los puntos, de donde salen y quien los consiguio. Filtros por casa,
 * actividad y persona (la ruta la elige la pantalla). Anular pide motivo; el
 * ajuste a mano suma o resta a una casa de la ruta elegida.
 */
export function Movimientos({ rutaId }: { rutaId: string | null }) {
  const [casa, setCasa] = useState<string>(TODAS);
  const [accion, setAccion] = useState<string>(TODAS);
  const [persona, setPersona] = useState('');
  const [anulados, setAnulados] = useState(true);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ajuste, setAjuste] = useState<{ casa: IdCasa; puntos: string; motivo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('casas_admin_movimientos', {
      p_route_id: rutaId,
      p_house: casa === TODAS ? null : casa,
      p_action: accion === TODAS ? null : accion,
      p_incluir_anulados: anulados,
      p_limite: 500,
    });
    if (e) return setError(describirErrorPanel(e.message));
    setError(null);
    setMovs(data ?? []);
  }, [rutaId, casa, accion, anulados]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = persona.trim().toLowerCase();
    return q ? movs.filter((m) => (m.persona ?? '').toLowerCase().includes(q)) : movs;
  }, [movs, persona]);
  const suma = visibles.filter((m) => !m.annulled_at).reduce((s, m) => s + m.points, 0);

  async function anular(id: number) {
    setOcupado(true);
    const { error: e } = await supabase.rpc('casas_admin_anular', { p_id: id, p_motivo: motivo });
    setOcupado(false);
    if (e) return setError(describirErrorPanel(e.message));
    setAnulando(null);
    setMotivo('');
    await cargar();
  }

  async function ajustar() {
    if (!ajuste || !rutaId) return;
    const puntos = leerPuntosAjuste(ajuste.puntos);
    if (puntos === null) return setError('Los puntos tienen que ser un número entre -1000 y 1000, distinto de 0.');
    setOcupado(true);
    const { error: e } = await supabase.rpc('casas_admin_ajuste', {
      p_route_id: rutaId,
      p_house: ajuste.casa,
      p_points: puntos,
      p_motivo: ajuste.motivo,
    });
    setOcupado(false);
    if (e) return setError(describirErrorPanel(e.message));
    setAjuste(null);
    await cargar();
  }

  return (
    <View style={styles.raiz}>
      <Chips opciones={OPC_CASAS} elegida={casa} onElegir={setCasa} />
      <Chips opciones={OPC_ACCIONES} elegida={accion} onElegir={setAccion} />
      <Field label="Persona" value={persona} onChangeText={setPersona} placeholder="Filtrar por nombre" autoCapitalize="none" />
      <Casilla marcada={anulados} texto="Ver también los anulados" onCambiar={setAnulados} />
      {error ? <Banner tone="error">{error}</Banner> : null}

      {rutaId ? (
        ajuste ? (
          <Card style={styles.ajuste}>
            <Text style={typography.sectionTitle}>Ajuste a mano</Text>
            <Chips<IdCasa>
              opciones={ORDEN_CASAS.map((c) => ({ id: c, texto: CASAS[c].nombre }))}
              elegida={ajuste.casa}
              onElegir={(c) => setAjuste({ ...ajuste, casa: c })}
            />
            <Field
              label="Puntos (negativo para restar)"
              value={ajuste.puntos}
              onChangeText={(t) => setAjuste({ ...ajuste, puntos: t })}
              keyboardType="numbers-and-punctuation"
              placeholder="+10 o -5"
            />
            <Field label="Motivo" value={ajuste.motivo} onChangeText={(t) => setAjuste({ ...ajuste, motivo: t })} placeholder="Por qué" />
            <View style={styles.acciones}>
              <Button title="Cancelar" variant="ghost" onPress={() => setAjuste(null)} />
              <Button title="Apuntar" loading={ocupado} onPress={() => void ajustar()} />
            </View>
          </Card>
        ) : (
          <Button
            title="Ajuste a mano"
            variant="secondary"
            icon="create-outline"
            onPress={() => setAjuste({ casa: 'mahou', puntos: '', motivo: '' })}
          />
        )
      ) : (
        <Text style={typography.muted}>Elige una ruta para hacer ajustes a mano.</Text>
      )}

      <Text style={styles.total}>{`${visibles.length} movimientos · ${suma} puntos válidos`}</Text>

      {visibles.map((m) => {
        const anulado = m.annulled_at !== null;
        const detalle = detalleMovimiento(m);
        return (
          <View key={m.id} style={[styles.mov, anulado && styles.movAnulado]}>
            <View style={styles.movFila}>
              {esCasa(m.house) ? <Escudo casa={m.house} tamano={22} /> : null}
              <View style={styles.movTextos}>
                <Text style={[styles.movTitulo, anulado && styles.tachado]}>
                  {`${nombreAccion(m.action)}${detalle ? ` · ${detalle}` : ''}`}
                </Text>
                <Text style={styles.movSub}>
                  {`${m.persona ?? (m.user_id ? 'Cuenta borrada' : 'La casa')} · ${rutaId ? '' : `${m.ruta} · `}${fechaCorta(m.created_at)}`}
                </Text>
                {anulado ? (
                  <Text style={styles.movAnulacion}>{`Anulado${m.anulado_por ? ` por ${m.anulado_por}` : ''}: ${m.annul_reason ?? ''}`}</Text>
                ) : null}
              </View>
              <Text style={[styles.movPuntos, m.points < 0 && styles.negativo, anulado && styles.tachado]}>
                {m.points > 0 ? `+${m.points}` : String(m.points)}
              </Text>
            </View>
            {!anulado ? (
              anulando === m.id ? (
                <View style={styles.anular}>
                  <Field label="Motivo de la anulación" value={motivo} onChangeText={setMotivo} placeholder="Por qué se anula" />
                  <View style={styles.acciones}>
                    <Button title="Cancelar" variant="ghost" onPress={() => setAnulando(null)} />
                    <Button title="Anular" loading={ocupado} onPress={() => void anular(m.id)} />
                  </View>
                </View>
              ) : (
                <View style={styles.acciones}>
                  <Button
                    title="Anular"
                    variant="ghost"
                    onPress={() => {
                      setMotivo('');
                      setAnulando(m.id);
                    }}
                  />
                </View>
              )
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.sm },
  ajuste: { gap: space.sm },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  total: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: space.sm },
  mov: {
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  movAnulado: { opacity: 0.6 },
  movFila: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  movTextos: { flex: 1, gap: 1 },
  movTitulo: { fontSize: 14, fontWeight: '700', color: colors.ink },
  movSub: { fontSize: 12, color: colors.inkSoft },
  movAnulacion: { fontSize: 12, color: colors.danger },
  movPuntos: { fontSize: 16, fontWeight: '900', color: colors.green },
  negativo: { color: colors.danger },
  tachado: { textDecorationLine: 'line-through' },
  anular: { gap: space.sm },
});

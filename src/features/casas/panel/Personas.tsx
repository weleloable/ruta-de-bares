import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Field } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space, typography } from '../../../lib/theme';
import type { Database } from '../../../types/database';
import { describirErrorPanel } from '../acciones';
import { CASAS, esCasa, ORDEN_CASAS, type IdCasa } from '../casas';
import { Escudo } from '../Escudo';
import { Chips, fechaCorta } from './piezas';

type Persona = Database['public']['Functions']['casas_admin_personas']['Returns'][number];
type Cambio = Database['public']['Functions']['casas_admin_cambios']['Returns'][number];

const nombreCasa = (c: string | null) => (c && esCasa(c) ? CASAS[c].nombre : 'sin casa');

/**
 * Cambiar a alguien de casa. Sus puntos se van con el; los de racha y QR (que
 * hizo con su casa de antes) se anulan. Pide motivo y queda en el historial.
 */
export function Personas() {
  const [busqueda, setBusqueda] = useState('');
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [elegida, setElegida] = useState<Persona | null>(null);
  const [destino, setDestino] = useState<IdCasa | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const buscar = useCallback(async (texto: string) => {
    const { data, error: e } = await supabase.rpc('casas_admin_personas', { p_busqueda: texto || null });
    if (e) return setError(describirErrorPanel(e.message));
    setPersonas(data ?? []);
  }, []);

  const cargarCambios = useCallback(async () => {
    const { data } = await supabase.rpc('casas_admin_cambios');
    setCambios(data ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void buscar(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda, buscar]);
  useEffect(() => {
    void cargarCambios();
  }, [cargarCambios]);

  async function cambiar() {
    if (!elegida || !destino) return;
    setOcupado(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('casas_admin_cambiar_casa', {
      p_user_id: elegida.user_id,
      p_house: destino,
      p_motivo: motivo,
    });
    setOcupado(false);
    if (e) return setError(describirErrorPanel(e.message));
    setHecho(
      `${elegida.nombre} ahora es de ${CASAS[destino].nombre}. Se movieron ${data.movidos} movimientos y se anularon ${data.anulados} de racha o QR.`,
    );
    setElegida(null);
    setMotivo('');
    await Promise.all([buscar(busqueda.trim()), cargarCambios()]);
  }

  return (
    <View style={styles.raiz}>
      <Field label="Buscar persona" value={busqueda} onChangeText={setBusqueda} placeholder="Nombre" autoCapitalize="none" />
      {hecho ? <Banner tone="success">{hecho}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {elegida ? (
        <Card style={styles.tarjeta}>
          <Text style={typography.sectionTitle}>{`Cambiar de casa a ${elegida.nombre}`}</Text>
          <Text style={typography.muted}>
            {`Ahora es de ${nombreCasa(elegida.house)}. Sus puntos se van con ella; los de racha y encuentros QR se anulan, porque los hizo con compañeros de su casa anterior.`}
          </Text>
          <Chips<IdCasa>
            opciones={ORDEN_CASAS.filter((c) => c !== elegida.house).map((c) => ({ id: c, texto: CASAS[c].nombre }))}
            elegida={destino}
            onElegir={setDestino}
          />
          <Field label="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Por qué se cambia" />
          <View style={styles.acciones}>
            <Button title="Cancelar" variant="ghost" onPress={() => setElegida(null)} />
            <Button title="Cambiar de casa" loading={ocupado} disabled={!destino} onPress={() => void cambiar()} />
          </View>
        </Card>
      ) : null}

      {personas.map((p) => (
        <Pressable
          key={p.user_id}
          accessibilityRole="button"
          onPress={() => {
            setHecho(null);
            setDestino(null);
            setMotivo('');
            setElegida(p);
          }}
          style={({ pressed }) => [styles.persona, pressed && styles.pulsada]}
        >
          {p.house && esCasa(p.house) ? <Escudo casa={p.house} tamano={26} /> : <View style={styles.sinEscudo} />}
          <View style={styles.personaTextos}>
            <Text style={styles.personaNombre}>{p.nombre}</Text>
            <Text style={styles.personaSub}>{`${nombreCasa(p.house)} · ${p.rutas} ${p.rutas === 1 ? 'ruta' : 'rutas'}`}</Text>
          </View>
          <Text style={styles.personaPuntos}>{p.puntos}</Text>
        </Pressable>
      ))}

      {cambios.length > 0 ? (
        <Card style={styles.tarjeta}>
          <Text style={typography.sectionTitle}>Cambios de casa</Text>
          {cambios.map((c, i) => (
            <Text key={i} style={styles.cambio}>
              {`${fechaCorta(c.el)} · ${c.persona ?? 'Cuenta borrada'}: ${nombreCasa(c.de)} → ${nombreCasa(c.a)} · «${c.motivo}»${c.por ? ` (${c.por})` : ''}`}
            </Text>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.sm },
  tarjeta: { gap: space.sm },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  persona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pulsada: { opacity: 0.7 },
  sinEscudo: { width: 26, height: 30 },
  personaTextos: { flex: 1 },
  personaNombre: { fontSize: 15, fontWeight: '700', color: colors.ink },
  personaSub: { fontSize: 12, color: colors.inkSoft },
  personaPuntos: { fontSize: 16, fontWeight: '900', color: colors.ink },
  cambio: { fontSize: 12, color: colors.ink },
});

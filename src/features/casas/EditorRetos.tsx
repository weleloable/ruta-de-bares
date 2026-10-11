import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Field } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, typography } from '../../lib/theme';
import { Casilla } from '../match/piezas';
import { Paso } from '../routes/AjustesCana';
import type { RouteBarRow, RouteRow } from '../../types/database';
import { CATEGORIAS } from './reglasConsumo';
import { ajustarObjetivo, horaLimite, limitesObjetivo, textoCondicion, TIPOS_RETO, type TipoReto } from './retos';

type RetoFila = {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: TipoReto;
  objetivo: number;
  categoria: string | null;
  hora_limite: string | null;
  puntos: number;
  max_personas: number | null;
  activo: boolean;
};

type Borrador = Omit<RetoFila, 'id' | 'activo' | 'hora_limite'> & { id: string | null; hora: string };

const VACIO: Borrador = {
  id: null,
  nombre: '',
  descripcion: '',
  tipo: 'bares',
  objetivo: 3,
  categoria: null,
  hora: '',
  puntos: 10,
  max_personas: null,
};

function hhmm(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Los retos de la ruta (0047) en el editor: lista, activar/desactivar y un
 * formulario para crear o cambiar. Las condiciones salen de un catalogo
 * cerrado y la base de datos vuelve a comprobar los limites.
 */
export function EditorRetos({ ruta, bares }: { ruta: RouteRow; bares: RouteBarRow[] }) {
  const [retos, setRetos] = useState<RetoFila[]>([]);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('retos').select('*').eq('route_id', ruta.id).order('created_at');
    if (e) {
      setError(/retos/.test(e.message) && /exist|find/i.test(e.message) ? 'Falta aplicar la migración 0047 en Supabase.' : e.message);
      return;
    }
    setRetos((data ?? []) as RetoFila[]);
  }, [ruta.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const primeraApertura = bares.length > 0 ? new Date(bares[0].opens_at) : null;

  async function guardar() {
    if (!borrador) return;
    const b = borrador;
    if (!b.nombre.trim()) return setError('Ponle un nombre al reto.');
    if (b.tipo === 'consumiciones_categoria' && !b.categoria) return setError('Elige la categoría.');
    let limite: string | null = null;
    if (b.tipo === 'ruta_antes_de') {
      if (!primeraApertura) return setError('Añade antes los bares de la ruta.');
      const d = horaLimite(b.hora, primeraApertura);
      if (!d) return setError('Escribe la hora límite como HH:MM, por ejemplo 23:30.');
      limite = d.toISOString();
    }
    const cambios = {
      nombre: b.nombre.trim(),
      descripcion: b.descripcion.trim(),
      tipo: b.tipo,
      objetivo: ajustarObjetivo(b.objetivo, b.tipo, b.categoria),
      categoria: b.tipo === 'consumiciones_categoria' ? b.categoria : null,
      hora_limite: limite,
      puntos: b.puntos,
      max_personas: b.max_personas,
      updated_at: new Date().toISOString(),
    };
    setGuardando(true);
    setError(null);
    const { error: e } = b.id
      ? await supabase.from('retos').update(cambios).eq('id', b.id)
      : await supabase.from('retos').insert({ ...cambios, route_id: ruta.id });
    setGuardando(false);
    if (e) return setError(e.message);
    setBorrador(null);
    await cargar();
  }

  async function alternar(r: RetoFila) {
    setError(null);
    const { error: e } = await supabase
      .from('retos')
      .update({ activo: !r.activo, updated_at: new Date().toISOString() })
      .eq('id', r.id);
    if (e) return setError(e.message);
    await cargar();
  }

  const cambiar = (cambio: Partial<Borrador>) => setBorrador((b) => (b ? { ...b, ...cambio } : b));

  return (
    <Card style={styles.tarjeta}>
      <Text style={typography.sectionTitle}>Retos de esta ruta</Text>
      <Text style={typography.muted}>
        Cada reto da sus puntos una vez por persona a su casa. Desactivarlo no quita los puntos ya dados.
      </Text>
      {error ? <Banner tone="error">{error}</Banner> : null}

      {retos.map((r) => (
        <View key={r.id} style={[styles.reto, !r.activo && styles.inactivo]}>
          <View style={styles.retoTextos}>
            <Text style={styles.retoNombre}>{`${r.nombre} · +${r.puntos}`}</Text>
            <Text style={typography.muted}>
              {textoCondicion(r)}
              {r.max_personas ? ` · los ${r.max_personas} primeros` : ''}
              {r.activo ? '' : ' · desactivado'}
            </Text>
          </View>
          <View style={styles.acciones}>
            <Button
              title="Editar"
              variant="ghost"
              onPress={() =>
                setBorrador({
                  id: r.id,
                  nombre: r.nombre,
                  descripcion: r.descripcion,
                  tipo: r.tipo,
                  objetivo: r.objetivo,
                  categoria: r.categoria,
                  hora: hhmm(r.hora_limite),
                  puntos: r.puntos,
                  max_personas: r.max_personas,
                })
              }
            />
            <Button title={r.activo ? 'Desactivar' : 'Activar'} variant="secondary" onPress={() => void alternar(r)} />
          </View>
        </View>
      ))}

      {borrador ? (
        <View style={styles.formulario}>
          <Field label="Nombre" value={borrador.nombre} maxLength={60} onChangeText={(t) => cambiar({ nombre: t })} placeholder="La ruta de la sidra" />
          <Field
            label="Descripción (opcional)"
            value={borrador.descripcion}
            maxLength={200}
            onChangeText={(t) => cambiar({ descripcion: t })}
            placeholder="Lo que verá la gente"
          />

          <Text style={typography.overline}>Condición</Text>
          <View style={styles.chips}>
            {TIPOS_RETO.map((t) => (
              <Chip
                key={t.id}
                texto={`${t.icono} ${t.nombre}`}
                marcado={borrador.tipo === t.id}
                onPress={() => cambiar({ tipo: t.id, objetivo: ajustarObjetivo(borrador.objetivo, t.id, borrador.categoria) })}
              />
            ))}
          </View>

          {borrador.tipo === 'consumiciones_categoria' ? (
            <View style={styles.chips}>
              {CATEGORIAS.map((c) => (
                <Chip
                  key={c.id}
                  texto={`${c.icono} ${c.nombre}`}
                  marcado={borrador.categoria === c.id}
                  onPress={() => cambiar({ categoria: c.id, objetivo: ajustarObjetivo(borrador.objetivo, borrador.tipo, c.id) })}
                />
              ))}
            </View>
          ) : null}

          {borrador.tipo === 'ruta_antes_de' ? (
            <Field
              label="Hora límite"
              value={borrador.hora}
              onChangeText={(t) => cambiar({ hora: t })}
              placeholder="23:30"
              keyboardType="numbers-and-punctuation"
              hint="Si es antes de abrir el primer bar, cuenta como del día siguiente."
            />
          ) : (
            <Paso
              etiqueta="Cuántas"
              valor={String(borrador.objetivo)}
              puedeBajar={borrador.objetivo > limitesObjetivo(borrador.tipo, borrador.categoria).min}
              puedeSubir={borrador.objetivo < limitesObjetivo(borrador.tipo, borrador.categoria).max}
              onBajar={() => cambiar({ objetivo: ajustarObjetivo(borrador.objetivo - 1, borrador.tipo, borrador.categoria) })}
              onSubir={() => cambiar({ objetivo: ajustarObjetivo(borrador.objetivo + 1, borrador.tipo, borrador.categoria) })}
            />
          )}
          {borrador.tipo === 'consumiciones_categoria' && borrador.categoria && borrador.categoria !== 'sin_alcohol' ? (
            <Text style={styles.nota}>Con alcohol, como mucho 3: los retos no premian beber más.</Text>
          ) : null}

          <Paso
            etiqueta="Puntos"
            valor={`+${borrador.puntos}`}
            puedeBajar={borrador.puntos > 1}
            puedeSubir={borrador.puntos < 100}
            onBajar={() => cambiar({ puntos: Math.max(1, borrador.puntos - (borrador.puntos > 10 ? 5 : 1)) })}
            onSubir={() => cambiar({ puntos: Math.min(100, borrador.puntos + (borrador.puntos >= 10 ? 5 : 1)) })}
          />

          <Casilla
            marcada={borrador.max_personas === null}
            texto="Sin límite de personas"
            onCambiar={(sin) => cambiar({ max_personas: sin ? null : 3 })}
          />
          {borrador.max_personas !== null ? (
            <Paso
              etiqueta="Solo los primeros"
              valor={String(borrador.max_personas)}
              puedeBajar={borrador.max_personas > 1}
              puedeSubir={borrador.max_personas < 500}
              onBajar={() => cambiar({ max_personas: Math.max(1, (borrador.max_personas ?? 1) - 1) })}
              onSubir={() => cambiar({ max_personas: Math.min(500, (borrador.max_personas ?? 1) + 1) })}
            />
          ) : null}

          <View style={styles.acciones}>
            <Button title="Cancelar" variant="ghost" onPress={() => setBorrador(null)} />
            <Button title={borrador.id ? 'Guardar' : 'Crear reto'} loading={guardando} onPress={() => void guardar()} />
          </View>
        </View>
      ) : (
        <Button title="Nuevo reto" icon="add-circle-outline" variant="secondary" onPress={() => setBorrador(VACIO)} />
      )}
    </Card>
  );
}

function Chip({ texto, marcado, onPress }: { texto: string; marcado: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: marcado }}
      onPress={onPress}
      style={[styles.chip, marcado && styles.chipMarcado]}
    >
      <Text style={[styles.chipTexto, marcado && styles.chipTextoMarcado]}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: { gap: space.md },
  reto: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inactivo: { opacity: 0.55 },
  retoTextos: { gap: 2 },
  retoNombre: { fontSize: 15, fontWeight: '800', color: colors.ink },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, flexWrap: 'wrap' },
  formulario: { gap: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipMarcado: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTexto: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  chipTextoMarcado: { color: colors.white },
  nota: { fontSize: 12, color: colors.inkSoft },
});

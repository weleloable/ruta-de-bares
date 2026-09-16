import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, EmptyState, Loading } from '../../../src/components/ui';
import { getMatchGrid, listMatchTags, voteMatch } from '../../../src/features/match/api';
import { AvatarCana, ChipEtiqueta } from '../../../src/features/match/piezas';
import { estadoTarjeta, votoRompeConexion } from '../../../src/features/match/reglas';
import { ASPECTO } from '../../../src/features/match/TarjetaPersona';
import { useActiveRoute } from '../../../src/features/routes/ActiveRouteProvider';
import { confirmar } from '../../../src/lib/confirmar';
import { colors, radius, space, typography } from '../../../src/lib/theme';
import type { MatchGridRow, MatchVote } from '../../../src/types/database';

/**
 * Ficha de una persona en Tirate una cana: foto grande, frase, etiquetas y los
 * dos botones de voto, que muestran tu voto actual y sirven para cambiarlo.
 *
 * Los datos salen de la misma grilla (match_grid): son pocas filas por ruta y
 * asi la ficha aplica las mismas reglas de visibilidad sin otra funcion SQL.
 */
export default function PersonaCana() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { activeRoute } = useActiveRoute();
  const rutaId = activeRoute?.id ?? null;

  const [persona, setPersona] = useState<MatchGridRow | null>(null);
  const [etiquetas, setEtiquetas] = useState<Map<string, string>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [votando, setVotando] = useState<MatchVote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!rutaId || !userId) return;
    setError(null);
    try {
      const [filas, catalogo] = await Promise.all([getMatchGrid(rutaId), listMatchTags()]);
      setPersona(filas.find((fila) => fila.user_id === userId) ?? null);
      setEtiquetas(new Map(catalogo.map((etiqueta) => [etiqueta.id, etiqueta.label])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la ficha.');
    } finally {
      setCargando(false);
    }
  }, [rutaId, userId]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  if (cargando) return <Loading label="Abriendo la ficha..." />;

  if (!persona || !rutaId) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <Stack.Screen options={{ title: 'Tírate una caña' }} />
        <View style={styles.cuerpo}>
          {error ? <Banner tone="error">{error}</Banner> : null}
          <EmptyState
            title="Esta persona ya no está"
            body="Puede que haya desactivado Tírate una caña o que ya no participe en la ruta."
          />
          <Button title="Volver" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const estado = estadoTarjeta(persona);
  const aspecto = ASPECTO[estado];

  async function votar(valor: MatchVote) {
    if (!persona || !rutaId || valor === persona.my_vote || votando) return;
    if (votoRompeConexion(estado, valor)) {
      const seguro = await confirmar({
        titulo: 'Cerrar la conexión',
        mensaje: `Se cerrará la conexión con ${persona.display_name} y se borrará vuestro chat.`,
        aceptar: 'No me gusta',
        destructiva: true,
      });
      if (!seguro) return;
    }
    setVotando(valor);
    setError(null);
    setAviso(null);
    try {
      const { connectionId } = await voteMatch(rutaId, persona.user_id, valor);
      if (connectionId && !persona.connection_id) {
        setAviso(`¡${persona.display_name} y tú os habéis dado me gusta! Ya sois una conexión.`);
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar tu voto.');
    } finally {
      setVotando(null);
    }
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <Stack.Screen options={{ title: persona.display_name }} />
      <ScrollView contentContainerStyle={styles.cuerpo}>
        <View style={[styles.marco, { borderColor: aspecto.borde }]}>
          <AvatarCana
            nombre={persona.display_name}
            foto={persona.avatar_url}
            redondo={false}
            tamanoIniciales={88}
            style={styles.foto}
          />
        </View>

        <View style={styles.cabecera}>
          <Text style={[typography.screenTitle, styles.nombre]} numberOfLines={2}>
            {persona.display_name}
          </Text>
          <View style={[styles.estado, { borderColor: aspecto.borde, backgroundColor: aspecto.fondo }]}>
            {aspecto.icono ? <Ionicons name={aspecto.icono} size={14} color={aspecto.borde} /> : null}
            <Text style={[styles.estadoTexto, { color: estado === 'nuevo' ? colors.inkSoft : aspecto.borde }]}>
              {aspecto.texto}
            </Text>
          </View>
        </View>

        <Text style={[typography.body, styles.frase]}>{persona.bio}</Text>

        {persona.tag_ids.length > 0 ? (
          <View style={styles.chips}>
            {persona.tag_ids.map((id) => (
              <ChipEtiqueta key={id} texto={etiquetas.get(id) ?? id} />
            ))}
          </View>
        ) : null}

        {aviso ? <Banner tone="success">{aviso}</Banner> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

        <View style={styles.votos}>
          <BotonVoto
            texto="No me gusta"
            icono="close"
            color={colors.stamp}
            elegido={persona.my_vote === 'dislike'}
            ocupado={votando === 'dislike'}
            onPress={() => votar('dislike')}
          />
          <BotonVoto
            texto="Me gusta"
            icono="checkmark"
            color={colors.green}
            elegido={persona.my_vote === 'like'}
            ocupado={votando === 'like'}
            onPress={() => votar('like')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BotonVoto({
  texto,
  icono,
  color,
  elegido,
  ocupado,
  onPress,
}: {
  texto: string;
  icono: 'close' | 'checkmark';
  color: string;
  elegido: boolean;
  ocupado: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: elegido, busy: ocupado }}
      accessibilityLabel={elegido ? `${texto}, tu voto actual` : texto}
      onPress={onPress}
      style={({ pressed }) => [
        styles.voto,
        { borderColor: color },
        elegido && { backgroundColor: color },
        (pressed || ocupado) && styles.votoPulsado,
      ]}
    >
      <Ionicons name={icono} size={20} color={elegido ? colors.white : color} />
      <Text style={[styles.votoTexto, { color: elegido ? colors.white : color }]}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  marco: { borderWidth: 4, borderRadius: radius.lg, overflow: 'hidden', alignSelf: 'center', width: '100%', maxWidth: 420 },
  foto: { width: '100%', aspectRatio: 1 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  nombre: { flexShrink: 1 },
  estado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  estadoTexto: { fontSize: 12, fontWeight: '700' },
  frase: { fontSize: 17, lineHeight: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  votos: { flexDirection: 'row', gap: space.md },
  voto: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  votoPulsado: { opacity: 0.75 },
  votoTexto: { fontSize: 16, fontWeight: '800' },
});

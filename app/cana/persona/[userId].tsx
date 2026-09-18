import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, EmptyState, Loading } from '../../../src/components/ui';
import { getMatchGrid, listMatchTags, markMatchSeen, setMatchLike } from '../../../src/features/match/api';
import { AvatarCana, ChipEtiqueta } from '../../../src/features/match/piezas';
import {
  estadoTarjeta,
  hayQueMarcarVisto,
  quitarMeGustaRompeConexion,
} from '../../../src/features/match/reglas';
import { ASPECTO } from '../../../src/features/match/TarjetaPersona';
import { VasoCana } from '../../../src/features/match/VasoCana';
import { AccionesPersona } from '../../../src/features/match/AccionesPersona';
import { BotonVolverCana } from '../../../src/features/match/BotonVolverCana';
import { DialogoConfirmar } from '../../../src/features/profile/DialogoConfirmar';
import { useActiveRoute } from '../../../src/features/routes/ActiveRouteProvider';
import { colors, radius, space, typography } from '../../../src/lib/theme';
import type { MatchGridRow } from '../../../src/types/database';

/**
 * Ficha de una persona en Tirate una cana: foto grande, frase, etiquetas y un
 * unico boton, Me gusta, que se da y se quita. No hay "No me gusta" (0004):
 * abrir la ficha ya la deja como Visto, y quitar el Me gusta tambien.
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
  const [cambiando, setCambiando] = useState(false);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!rutaId || !userId) return;
    setError(null);
    try {
      const [filas, catalogo] = await Promise.all([getMatchGrid(rutaId), listMatchTags()]);
      let encontrada = filas.find((fila) => fila.user_id === userId) ?? null;
      if (encontrada && hayQueMarcarVisto(estadoTarjeta(encontrada))) {
        try {
          await markMatchSeen(rutaId, encontrada.user_id);
          encontrada = { ...encontrada, my_vote: 'seen' };
        } catch {
          // Si no se apunta, la ficha se ve igual; solo no pasara a Visto.
        }
      }
      setPersona(encontrada);
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
        <Stack.Screen options={{ title: 'Tírate una caña', headerLeft: () => <BotonVolverCana /> }} />
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

  const teGusta = persona.my_vote === 'like';

  function alternarMeGusta() {
    if (cambiando) return;
    // Quitarlo en una conexion la cierra y borra el chat: primero se confirma.
    if (teGusta && quitarMeGustaRompeConexion(estado)) {
      setConfirmandoQuitar(true);
      return;
    }
    void guardarMeGusta(!teGusta);
  }

  async function guardarMeGusta(dar: boolean) {
    if (!persona || !rutaId) return;
    setCambiando(true);
    setError(null);
    setAviso(null);
    try {
      const { connectionId } = await setMatchLike(rutaId, persona.user_id, dar);
      if (connectionId && !persona.connection_id) {
        setAviso(`¡${persona.display_name} y tú os habéis dado me gusta! Ya sois una conexión.`);
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar tu Me gusta.');
    } finally {
      setCambiando(false);
      setConfirmandoQuitar(false);
    }
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <Stack.Screen options={{ title: persona.display_name, headerLeft: () => <BotonVolverCana /> }} />
      <ScrollView contentContainerStyle={styles.cuerpo}>
        {/* Mismo lenguaje que la tarjeta de la grilla, sin apagar la foto: aqui se viene a mirarla. */}
        <View style={[styles.anillo, aspecto.anillo ? { borderColor: aspecto.anillo } : null]}>
          <View
            style={[
              styles.marco,
              { borderColor: aspecto.borde, borderStyle: aspecto.discontinuo ? 'dashed' : 'solid' },
            ]}
          >
            <AvatarCana
              nombre={persona.display_name}
              foto={persona.avatar_url}
              redondo={false}
              tamanoIniciales={88}
              style={styles.foto}
            />
          </View>
        </View>

        <View style={styles.cabecera}>
          <Text style={[typography.screenTitle, styles.nombre]} numberOfLines={2}>
            {persona.display_name}
          </Text>
          <View
            style={[
              styles.estado,
              aspecto.vaso
                ? { borderColor: aspecto.borde, backgroundColor: aspecto.vaso.fondo }
                : { borderColor: colors.border, backgroundColor: colors.paperDeep },
            ]}
          >
            {aspecto.vaso ? <VasoCana nivel={aspecto.vaso.nivel} tamano={16} trazo={aspecto.vaso.trazo} /> : null}
            <Text style={[styles.estadoTexto, { color: aspecto.vaso ? aspecto.vaso.trazo : colors.inkSoft }]}>
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

        {aviso ? (
          <View style={styles.aviso} accessibilityRole="alert">
            <VasoCana nivel="llena" tamano={22} trazo={colors.card} />
            <Text style={styles.avisoTexto}>{aviso}</Text>
          </View>
        ) : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

        <View style={styles.meGustaBloque}>
          <BotonMeGusta activo={teGusta} ocupado={cambiando} onPress={alternarMeGusta} />
          {teGusta ? (
            <Text style={[typography.muted, styles.centrado]}>
              {persona.connection_id
                ? 'Si lo quitas, se cierra la conexión y se borra el chat.'
                : 'Toca otra vez para quitar tu Me gusta.'}
            </Text>
          ) : null}
        </View>

        {persona.connection_id ? (
          <Pressable
            accessibilityRole="button"
            // Etiqueta explicita: el icono es un caracter de la fuente y, sin
            // ella, el lector de pantalla lo leeria delante del texto.
            accessibilityLabel={`Abrir chat${persona.unread_count > 0 ? `, ${persona.unread_count} sin leer` : ''}`}
            onPress={() =>
              router.push({
                pathname: '/cana/chat/[connectionId]',
                params: { connectionId: persona.connection_id as string },
              })
            }
            style={({ pressed }) => [styles.abrirChat, pressed && styles.votoPulsado]}
          >
            <Ionicons name="chatbubbles" size={20} color={colors.white} />
            <Text style={styles.abrirChatTexto}>
              Abrir chat{persona.unread_count > 0 ? ` (${persona.unread_count} sin leer)` : ''}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.acciones}>
          <AccionesPersona
            routeId={rutaId}
            userId={persona.user_id}
            nombre={persona.display_name}
            connectionId={persona.connection_id}
            // Bloqueada o denunciada, deja de estar disponible: la ficha ya no
            // tiene nada que ensenar.
            onHecho={() => router.back()}
          />
        </View>
      </ScrollView>

      <DialogoConfirmar
        visible={confirmandoQuitar}
        titulo="Quitar tu Me gusta"
        mensaje={`Se cerrará la conexión con ${persona.display_name} y se borrará vuestro chat.`}
        textoConfirmar="Quitar Me gusta"
        destructivo
        ocupado={cambiando}
        onConfirmar={() => void guardarMeGusta(false)}
        onCancelar={() => setConfirmandoQuitar(false)}
      />
    </SafeAreaView>
  );
}

/** Unico boton de la ficha: vacio sin Me gusta, relleno de tostado con Me gusta. */
function BotonMeGusta({ activo, ocupado, onPress }: { activo: boolean; ocupado: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo, busy: ocupado }}
      accessibilityLabel={activo ? 'Me gusta, activado. Toca para quitarlo' : 'Me gusta'}
      disabled={ocupado}
      onPress={onPress}
      style={({ pressed }) => [
        styles.voto,
        activo && styles.votoActivo,
        (pressed || ocupado) && styles.votoPulsado,
      ]}
    >
      <VasoCana
        nivel="media"
        tamano={24}
        trazo={activo ? colors.card : colors.beerDark}
        // Sobre el boton relleno de tostado, la cerveza clara se ve; la normal no.
        liquido={activo ? colors.beerSoft : colors.beer}
      />
      <Text style={[styles.votoTexto, activo && styles.votoTextoActivo]}>Me gusta</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  // Separadas del resto: no son parte de lo que se hace con la ficha.
  acciones: { marginTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  anillo: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 432,
    padding: 3,
    borderWidth: 3,
    borderColor: 'transparent',
    borderRadius: radius.lg + 6,
  },
  marco: { borderWidth: 4, borderRadius: radius.lg, overflow: 'hidden' },
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
  meGustaBloque: { gap: space.sm },
  centrado: { textAlign: 'center' },
  voto: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 2,
    borderColor: colors.beerDark,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  votoActivo: { backgroundColor: colors.beerDark },
  votoPulsado: { opacity: 0.75 },
  votoTexto: { fontSize: 16, fontWeight: '800', color: colors.beerDark },
  votoTextoActivo: { color: colors.white },
  abrirChat: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  abrirChatTexto: { fontSize: 16, fontWeight: '800', color: colors.white },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.beerDark,
  },
  avisoTexto: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.card },
});

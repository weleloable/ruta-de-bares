import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, EmptyState, Loading } from '../../../src/components/ui';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  ErrorCana,
  fetchMatchMessages,
  getMatchConnection,
  sendMatchBuzz,
  sendMatchGif,
} from '../../../src/features/match/api';
import { gifPorId } from '../../../src/features/match/gifs';
import { AvatarCana } from '../../../src/features/match/piezas';
import {
  CONEXION_PERDIDA,
  desdeParaSondeo,
  esperaZumbidoMs,
  fusionarMensajes,
} from '../../../src/features/match/reglas';
import { SelectorGif } from '../../../src/features/match/SelectorGif';
import { colors, radius, space, typography } from '../../../src/lib/theme';
import { useNow } from '../../../src/lib/useNow';
import { useSondeo } from '../../../src/lib/useSondeo';
import type { MatchConnectionDetail, MatchMessageRow } from '../../../src/types/database';

/** Con el chat a la vista se pregunta cada 4 s: un zumbido llega con ese retraso como mucho. */
const SONDEO_CHAT_MS = 4_000;

/**
 * Chat de una conexion de Tirate una cana: GIFs del catalogo y zumbidos.
 * Todo lo que se puede o no se puede enviar lo decide el servidor; la pantalla
 * solo deshabilita lo que ya sabe que va a fallar (p. ej. el zumbido en espera).
 */
export default function ChatCana() {
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const yo = session?.user.id ?? '';

  const [detalle, setDetalle] = useState<MatchConnectionDetail | null>(null);
  const [mensajes, setMensajes] = useState<MatchMessageRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [perdida, setPerdida] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [eligiendoGif, setEligiendoGif] = useState(false);

  // Refs y no estado: el sondeo necesita lo ultimo sin volver a crearse.
  const conocidos = useRef<MatchMessageRow[]>([]);
  const primeraCarga = useRef(true);
  // Diferencia entre el reloj del servidor y el del movil, para las esperas.
  const desfase = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const temblor = useRef(new Animated.Value(0)).current;
  const ahora = useNow(1_000);

  const zumbar = useCallback(() => {
    Vibration.vibrate(400);
    const paso = (hacia: number) =>
      Animated.timing(temblor, { toValue: hacia, duration: 45, useNativeDriver: Platform.OS !== 'web' });
    Animated.sequence([paso(12), paso(-12), paso(10), paso(-10), paso(6), paso(-6), paso(0)]).start();
  }, [temblor]);

  const aplicar = useCallback(
    (nuevos: MatchMessageRow[]) => {
      const vistos = new Set(conocidos.current.map((m) => m.id));
      const recibidos = nuevos.filter((m) => !vistos.has(m.id));
      conocidos.current = fusionarMensajes(conocidos.current, nuevos);
      setMensajes(conocidos.current);
      // Solo zumba lo que llega con el chat abierto, no el historial al entrar.
      if (!primeraCarga.current && recibidos.some((m) => m.kind === 'buzz' && m.sender_id !== yo)) zumbar();
    },
    [yo, zumbar],
  );

  const fallo = useCallback((e: unknown, porDefecto: string) => {
    if (e instanceof ErrorCana && e.codigo && CONEXION_PERDIDA.has(e.codigo)) {
      setPerdida(e.message);
      return;
    }
    setError(e instanceof Error ? e.message : porDefecto);
  }, []);

  const traer = useCallback(async () => {
    if (!connectionId || perdida) return;
    try {
      const [actual, nuevos] = await Promise.all([
        getMatchConnection(connectionId),
        fetchMatchMessages(connectionId, desdeParaSondeo(conocidos.current)),
      ]);
      desfase.current = Date.parse(actual.server_now) - Date.now();
      setDetalle(actual);
      aplicar(nuevos);
      primeraCarga.current = false;
      setError(null);
    } catch (e) {
      fallo(e, 'No se pudo cargar el chat.');
    } finally {
      setCargando(false);
    }
  }, [connectionId, perdida, aplicar, fallo]);

  useFocusEffect(
    useCallback(() => {
      void traer();
    }, [traer]),
  );
  useSondeo(traer, SONDEO_CHAT_MS, perdida === null);

  async function enviar(accion: () => Promise<MatchMessageRow>) {
    setEnviando(true);
    setError(null);
    try {
      const mensaje = await accion();
      aplicar([mensaje]);
      if (mensaje.kind === 'buzz') {
        setDetalle((previo) => (previo ? { ...previo, my_last_buzz_at: mensaje.created_at } : previo));
      }
    } catch (e) {
      fallo(e, 'No se pudo enviar.');
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <Loading label="Abriendo el chat..." />;

  if (perdida || !detalle) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <Stack.Screen options={{ title: 'Chat' }} />
        <View style={styles.cuerpoVacio}>
          <EmptyState title="Este chat ya no está disponible" body={perdida ?? error ?? 'No se pudo abrir.'} />
          <Button title="Volver a Tírate una caña" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const esperaZumbido = esperaZumbidoMs(detalle.my_last_buzz_at, new Date(ahora.getTime() + desfase.current));
  const nombre = detalle.display_name;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: nombre }} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ver la ficha de ${nombre}`}
        onPress={() =>
          router.push({ pathname: '/cana/persona/[userId]', params: { userId: detalle.other_user_id } })
        }
        style={styles.cabecera}
      >
        <AvatarCana nombre={nombre} foto={detalle.avatar_url} tamano={36} />
        <Text style={[typography.cardTitle, styles.cabeceraNombre]} numberOfLines={1}>
          {nombre}
        </Text>
        <Text style={styles.enlace}>Ver ficha</Text>
      </Pressable>

      <Animated.View style={[styles.hilo, { transform: [{ translateX: temblor }] }]}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.mensajes}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {mensajes.length === 0 ? (
            <Text style={[typography.muted, styles.centrado]}>
              Sois una conexión. Rompe el hielo con un GIF o un zumbido.
            </Text>
          ) : (
            mensajes.map((mensaje) => (
              <Mensaje key={mensaje.id} mensaje={mensaje} mio={mensaje.sender_id === yo} nombreOtro={nombre} />
            ))
          )}
        </ScrollView>
      </Animated.View>

      {error ? (
        <View style={styles.aviso}>
          <Banner tone="error">{error}</Banner>
        </View>
      ) : null}

      <View style={styles.composer}>
        <View style={styles.acciones}>
          <BotonChat icono="images" texto="GIF" onPress={() => setEligiendoGif(true)} desactivado={enviando} />
          <BotonChat
            icono="flash"
            texto={esperaZumbido > 0 ? `Zumbido (${Math.ceil(esperaZumbido / 1000)} s)` : 'Zumbido'}
            onPress={() => void enviar(() => sendMatchBuzz(detalle.connection_id))}
            desactivado={enviando || esperaZumbido > 0}
          />
        </View>
      </View>

      <SelectorGif
        visible={eligiendoGif}
        onCerrar={() => setEligiendoGif(false)}
        onElegir={(gifId) => {
          setEligiendoGif(false);
          void enviar(() => sendMatchGif(detalle.connection_id, gifId));
        }}
      />
    </SafeAreaView>
  );
}

function Mensaje({ mensaje, mio, nombreOtro }: { mensaje: MatchMessageRow; mio: boolean; nombreOtro: string }) {
  switch (mensaje.kind) {
    case 'gif': {
      const gif = gifPorId(mensaje.gif_id);
      return (
        <View
          accessible
          accessibilityLabel={`${mio ? 'Has enviado' : `${nombreOtro} ha enviado`} el GIF ${gif?.etiqueta ?? ''}`}
          style={[styles.burbuja, mio ? styles.mia : styles.suya]}
        >
          {gif ? (
            <Image source={gif.fuente} style={styles.gif} contentFit="cover" />
          ) : (
            <Text style={typography.muted}>GIF no disponible en esta versión de la app</Text>
          )}
        </View>
      );
    }
    case 'buzz':
      return (
        <View style={styles.evento}>
          <Ionicons name="flash" size={14} color={colors.beerDark} />
          <Text style={styles.eventoTexto}>
            {mio ? 'Has mandado un zumbido' : `${nombreOtro} te ha mandado un zumbido`}
          </Text>
        </View>
      );
    default:
      return null;
  }
}

function BotonChat({
  icono,
  texto,
  onPress,
  desactivado,
}: {
  icono: ComponentProps<typeof Ionicons>['name'];
  texto: string;
  onPress(): void;
  desactivado: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: desactivado }}
      disabled={desactivado}
      onPress={onPress}
      style={({ pressed }) => [styles.boton, desactivado && styles.botonDesactivado, pressed && styles.pulsado]}
    >
      <Ionicons name={icono} size={18} color={colors.ink} />
      <Text style={styles.botonTexto}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpoVacio: { padding: space.lg, gap: space.lg },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cabeceraNombre: { flex: 1 },
  enlace: { fontSize: 13, fontWeight: '700', color: colors.beerDark },
  hilo: { flex: 1 },
  mensajes: { padding: space.lg, gap: space.md },
  centrado: { textAlign: 'center', marginTop: space.xl },
  burbuja: { maxWidth: '72%', borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1 },
  mia: { alignSelf: 'flex-end', borderColor: colors.beer, backgroundColor: '#F3E1C6' },
  suya: { alignSelf: 'flex-start', borderColor: colors.border, backgroundColor: colors.card },
  gif: { width: 200, height: 150 },
  evento: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.paperDeep,
  },
  eventoTexto: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  aviso: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    padding: space.md,
    gap: space.sm,
  },
  acciones: { flexDirection: 'row', gap: space.sm },
  boton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  botonDesactivado: { opacity: 0.45 },
  pulsado: { opacity: 0.75 },
  botonTexto: { fontSize: 14, fontWeight: '700', color: colors.ink },
});

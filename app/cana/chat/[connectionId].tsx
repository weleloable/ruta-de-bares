import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, EmptyState, Loading } from '../../../src/components/ui';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  ErrorCana,
  answerBeer,
  askBeer,
  fetchMatchMessages,
  getMatchConnection,
  sendMatchText,
} from '../../../src/features/match/api';
import { AccionesPersona } from '../../../src/features/match/AccionesPersona';
import { BotonVolverCana } from '../../../src/features/match/BotonVolverCana';
import { AvatarCana } from '../../../src/features/match/piezas';
import { FranjaCerveza, ResponderCerveza } from '../../../src/features/match/PreguntaCerveza';
import {
  CONEXION_PERDIDA,
  TEXTO_MAX,
  TEXTOS_POR_PERSONA,
  desdeParaSondeo,
  estadoPregunta,
  textoRestante,
  hiloVacio,
  recibirDelSondeo,
  recibirEnviado,
  type HiloChat,
} from '../../../src/features/match/reglas';
import { DialogoConfirmar } from '../../../src/features/profile/DialogoConfirmar';
import { formatDuration } from '../../../src/features/stamps/rules';
import { colors, radius, space, typography } from '../../../src/lib/theme';
import { useNow } from '../../../src/lib/useNow';
import { useSondeo } from '../../../src/lib/useSondeo';
import type { BeerAnswer, MatchConnectionDetail, MatchMessageRow } from '../../../src/types/database';

/** Con el chat a la vista se pregunta cada 4 s: una respuesta llega con ese retraso como mucho. */
const SONDEO_CHAT_MS = 4_000;

/**
 * Conexion de Tirate una cana. Lo unico que se puede hacer es ofrecer la cana
 * ("Te tomas una cerveza conmigo?") y responder Si, No o "dentro de un rato";
 * tras el Si, cada persona manda UN mensaje de hasta 120 caracteres (0008: se
 * retiraron los GIFs y los zumbidos). Todo lo decide el servidor; la pantalla
 * solo deshabilita lo que ya sabe que va a fallar, con el espejo de reglas.ts.
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
  const [confirmandoNo, setConfirmandoNo] = useState(false);
  // El texto se gasta y no vuelve: se confirma antes de enviarlo. Se guarda
  // aparte lo que se va a enviar, porque al enviar se vacia el campo y el
  // dialogo, mientras se cierra, ensenaba unas comillas vacias.
  const [textoAConfirmar, setTextoAConfirmar] = useState('');
  const [texto, setTexto] = useState('');

  // Refs y no estado: el sondeo necesita lo ultimo sin volver a crearse.
  const hilo = useRef<HiloChat<MatchMessageRow>>(hiloVacio());
  const primeraCarga = useRef(true);
  // Diferencia entre el reloj del servidor y el del movil, para las esperas.
  const desfase = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const ahora = useNow(1_000);

  const pintar = useCallback((siguiente: HiloChat<MatchMessageRow>) => {
    hilo.current = siguiente;
    setMensajes(siguiente.mensajes);
  }, []);

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
        fetchMatchMessages(connectionId, desdeParaSondeo(hilo.current)),
      ]);
      desfase.current = Date.parse(actual.server_now) - Date.now();
      setDetalle(actual);
      pintar(recibirDelSondeo(hilo.current, nuevos));
      primeraCarga.current = false;
      setError(null);
    } catch (e) {
      fallo(e, 'No se pudo cargar el chat.');
    } finally {
      setCargando(false);
    }
  }, [connectionId, perdida, pintar, fallo]);

  useFocusEffect(
    useCallback(() => {
      void traer();
    }, [traer]),
  );
  useSondeo(traer, SONDEO_CHAT_MS, perdida === null);

  /** Envia, pinta el mensaje al momento y vuelve a leer el estado de la pregunta. */
  async function enviar(accion: () => Promise<MatchMessageRow>): Promise<boolean> {
    setEnviando(true);
    setError(null);
    try {
      const enviado = await accion();
      // hilo.current se lee despues del await: un sondeo puede haber llegado mientras.
      pintar(recibirEnviado(hilo.current, enviado));
      await traer();
      return true;
    } catch (e) {
      fallo(e, 'No se pudo enviar.');
      return false;
    } finally {
      setEnviando(false);
    }
  }

  function responder(respuesta: BeerAnswer) {
    // "No" cierra la conexion y borra el chat: primero se confirma.
    if (respuesta === 'no') {
      setConfirmandoNo(true);
      return;
    }
    void guardarRespuesta(respuesta);
  }

  async function guardarRespuesta(respuesta: BeerAnswer) {
    if (!detalle) return;
    setEnviando(true);
    setError(null);
    try {
      const { isOpen } = await answerBeer(detalle.connection_id, respuesta);
      if (!isOpen) {
        setPerdida('Has dicho que no. La conexión se ha cerrado y el chat se ha borrado.');
        return;
      }
      await traer();
    } catch (e) {
      fallo(e, 'No se pudo guardar tu respuesta.');
    } finally {
      setEnviando(false);
      setConfirmandoNo(false);
    }
  }

  function pedirConfirmacion() {
    if (texto.trim().length === 0) return;
    setTextoAConfirmar(texto.trim());
  }

  async function enviarTexto() {
    if (!detalle || textoAConfirmar.length === 0) return;
    const aEnviar = textoAConfirmar;
    setTextoAConfirmar('');
    if (await enviar(() => sendMatchText(detalle.connection_id, aEnviar))) setTexto('');
  }

  if (cargando) return <Loading label="Abriendo el chat..." />;

  if (perdida || !detalle) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <Stack.Screen options={{ title: 'Chat', headerLeft: () => <BotonVolverCana /> }} />
        <View style={styles.cuerpoVacio}>
          <EmptyState title="Este chat ya no está disponible" body={perdida ?? error ?? 'No se pudo abrir.'} />
          <Button title="Volver a Tírate una caña" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const ahoraServidor = new Date(ahora.getTime() + desfase.current);
  const pregunta = estadoPregunta(detalle, yo, ahoraServidor);
  const nombre = detalle.display_name;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: nombre, headerLeft: () => <BotonVolverCana /> }} />
      <KeyboardAvoidingView style={styles.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

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

        <FranjaCerveza estado={pregunta} nombre={nombre} />

        <View style={styles.hilo}>
          <ScrollView
            ref={scroll}
            contentContainerStyle={styles.mensajes}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          >
            {mensajes.length === 0 ? (
              <Text style={[typography.muted, styles.centrado]}>
                Sois una conexión. Ofrécele una caña cuando quieras.
              </Text>
            ) : (
              mensajes.map((mensaje) => (
                <Mensaje key={mensaje.id} mensaje={mensaje} mio={mensaje.sender_id === yo} nombreOtro={nombre} />
              ))
            )}
          </ScrollView>
        </View>

        {error ? (
          <View style={styles.aviso}>
            <Banner tone="error">{error}</Banner>
          </View>
        ) : null}

        {pregunta.tipo === 'te-toca-responder' ? (
          <ResponderCerveza
            nombre={nombre}
            ultimoAplazamiento={pregunta.ultimoAplazamiento}
            ocupado={enviando}
            onResponder={responder}
          />
        ) : null}

        <View style={styles.acciones2}>
          <AccionesPersona
            routeId={detalle.route_id}
            userId={detalle.other_user_id}
            nombre={nombre}
            connectionId={detalle.connection_id}
            onHecho={() => setPerdida('Ya no podéis veros. La conexión se ha cerrado y el chat se ha borrado.')}
          />
        </View>

        <View style={styles.composer}>
          {pregunta.tipo === 'aceptada' ? (
            pregunta.textosRestantes > 0 ? (
              <View style={styles.escribir}>
                <View style={styles.avisoUnico} accessibilityRole="summary">
                  <Ionicons name="alert-circle-outline" size={16} color={colors.beerDark} />
                  <Text style={styles.avisoUnicoTexto}>
                    {TEXTOS_POR_PERSONA === 1
                      ? 'Es tu único mensaje. Luego ya no podrás escribir más.'
                      : `Tienes ${TEXTOS_POR_PERSONA} mensajes en total con esta persona.`}
                  </Text>
                </View>
                <View style={styles.filaTexto}>
                  <TextInput
                    value={texto}
                    onChangeText={setTexto}
                    maxLength={TEXTO_MAX}
                    placeholder="Estoy en la barra del fondo, camiseta roja"
                    placeholderTextColor={colors.inkFaint}
                    editable={!enviando}
                    accessibilityLabel="Mensaje"
                    style={styles.campo}
                    onSubmitEditing={pedirConfirmacion}
                    returnKeyType="send"
                  />
                  <BotonChat
                    icono="send"
                    texto="Enviar"
                    onPress={pedirConfirmacion}
                    desactivado={enviando || texto.trim().length === 0}
                    compacto
                  />
                </View>
                <Text style={styles.nota}>
                  {textoRestante(pregunta.textosRestantes)} · {texto.trim().length}/{TEXTO_MAX}
                </Text>
              </View>
            ) : (
              <Text style={styles.nota}>{textoRestante(0)}</Text>
            )
          ) : null}

          <View style={styles.acciones}>
            {pregunta.tipo === 'disponible' ||
            pregunta.tipo === 'aplazada' ||
            pregunta.tipo === 'esperando-respuesta' ? (
              <BotonChat
                icono="beer"
                // "Preguntar en 30 min" no cabe: se ve la espera y el lector
                // de pantalla recibe la frase entera.
                texto={
                  pregunta.tipo === 'aplazada'
                    ? `En ${formatDuration(pregunta.disponibleEnMs)}`
                    : pregunta.tipo === 'esperando-respuesta'
                      ? 'Preguntado'
                      : '¿Una caña?'
                }
                etiqueta={
                  pregunta.tipo === 'aplazada' ? `Preguntar en ${formatDuration(pregunta.disponibleEnMs)}` : undefined
                }
                onPress={() => void enviar(() => askBeer(detalle.connection_id))}
                desactivado={enviando || pregunta.tipo !== 'disponible'}
                destacado={pregunta.tipo === 'disponible'}
              />
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>

      <DialogoConfirmar
        visible={textoAConfirmar.length > 0}
        titulo="¿Enviamos tu único mensaje?"
        mensaje={`Se enviará "${textoAConfirmar}". Después ya no podrás escribir más a ${nombre}.`}
        textoConfirmar="Enviar"
        textoCancelar="Seguir escribiendo"
        ocupado={enviando}
        onConfirmar={() => void enviarTexto()}
        onCancelar={() => setTextoAConfirmar('')}
      />

      <DialogoConfirmar
        visible={confirmandoNo}
        titulo={`Decir que no a ${nombre}`}
        mensaje="Se cerrará la conexión y se borrará el chat."
        textoConfirmar="Decir que no"
        destructivo
        ocupado={enviando}
        onConfirmar={() => void guardarRespuesta('no')}
        onCancelar={() => setConfirmandoNo(false)}
      />
    </SafeAreaView>
  );
}

function Mensaje({ mensaje, mio, nombreOtro }: { mensaje: MatchMessageRow; mio: boolean; nombreOtro: string }) {
  switch (mensaje.kind) {
    case 'question':
      return (
        <View style={styles.pregunta}>
          <Text style={typography.overline}>{mio ? 'Has preguntado' : `${nombreOtro} pregunta`}</Text>
          <Text style={styles.preguntaTexto}>¿Te tomas una cerveza conmigo?</Text>
        </View>
      );
    case 'answer':
      if (mensaje.answer === 'yes') {
        return (
          <Evento icono="beer" tono="aceptada">
            {mio ? 'Has dicho que sí a la cerveza' : `¡${nombreOtro} ha dicho que sí a la cerveza!`}
          </Evento>
        );
      }
      return (
        <Evento icono="time-outline">
          {mio
            ? 'Has pedido que te lo pregunten dentro de un rato'
            : `${nombreOtro} dice que se lo preguntes dentro de un rato`}
        </Evento>
      );
    case 'text':
      return (
        <View style={[styles.burbuja, styles.burbujaTexto, mio ? styles.mia : styles.suya]}>
          <Text style={typography.body}>{mensaje.body}</Text>
        </View>
      );
    default:
      return null;
  }
}

function Evento({
  icono,
  tono = 'normal',
  children,
}: {
  icono: ComponentProps<typeof Ionicons>['name'];
  tono?: 'normal' | 'aceptada';
  children: string;
}) {
  const aceptada = tono === 'aceptada';
  return (
    <View style={[styles.evento, aceptada && styles.eventoAceptado]} accessible accessibilityLabel={children}>
      <Ionicons name={icono} size={14} color={aceptada ? colors.white : colors.beerDark} />
      <Text style={[styles.eventoTexto, aceptada && styles.eventoTextoAceptado]}>{children}</Text>
    </View>
  );
}

function BotonChat({
  icono,
  texto,
  etiqueta,
  onPress,
  desactivado,
  destacado = false,
  compacto = false,
}: {
  icono: ComponentProps<typeof Ionicons>['name'];
  texto: string;
  /** Para el lector de pantalla, si el texto visible se queda corto. */
  etiqueta?: string;
  onPress(): void;
  desactivado: boolean;
  destacado?: boolean;
  compacto?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta ?? texto}
      accessibilityState={{ disabled: desactivado }}
      disabled={desactivado}
      onPress={onPress}
      style={({ pressed }) => [
        styles.boton,
        compacto && styles.botonCompacto,
        destacado && styles.botonDestacado,
        desactivado && styles.botonDesactivado,
        pressed && styles.pulsado,
      ]}
    >
      <Ionicons name={icono} size={18} color={destacado ? colors.white : colors.ink} />
      <Text style={[styles.botonTexto, destacado && styles.botonTextoDestacado]} numberOfLines={1}>
        {texto}
      </Text>
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
  mia: { alignSelf: 'flex-end', borderColor: colors.beer, backgroundColor: colors.beerSoft },
  suya: { alignSelf: 'flex-start', borderColor: colors.border, backgroundColor: colors.card },
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
  eventoAceptado: { backgroundColor: colors.beerDark },
  eventoTextoAceptado: { color: colors.white },
  pregunta: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.beer,
    backgroundColor: colors.card,
  },
  preguntaTexto: { fontFamily: typography.sectionTitle.fontFamily, fontSize: 16, color: colors.ink },
  burbujaTexto: { paddingHorizontal: space.md, paddingVertical: space.sm },
  aviso: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  escribir: { gap: 4 },
  filaTexto: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  campo: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    fontSize: 15,
    color: colors.ink,
  },
  nota: { fontSize: 12, color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  avisoUnico: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.beerSoft,
  },
  avisoUnicoTexto: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.beerDark },
  botonCompacto: { flex: 0, paddingHorizontal: space.lg },
  botonDestacado: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  botonTextoDestacado: { color: colors.white },
  acciones2: { paddingBottom: space.xs },
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

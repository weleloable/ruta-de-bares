import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field, Loading } from '../../../src/components/ui';
import {
  desactivarCana,
  expulsarDeRuta,
  leerMensajesDenunciados,
  leerTicket,
  reclamarAlerta,
  resolverAlerta,
  retirarFoto,
} from '../../../src/features/admin/api';
import {
  accionesTicket,
  ESTADOS,
  etiquetaMotivo,
  etiquetaResolucion,
  hace,
  RESOLUCIONES,
  resolucionSugerida,
} from '../../../src/features/admin/alertas';
import { AvatarCana } from '../../../src/features/match/piezas';
import { DialogoConfirmar } from '../../../src/features/profile/DialogoConfirmar';
import { hora } from '../../../src/lib/fechas';
import { colors, radius, space, typography } from '../../../src/lib/theme';
import type {
  MatchAdminReportMessageRow,
  MatchAdminTicketRow,
  MatchReportResolution,
} from '../../../src/types/database';

/** Lo que la persona denunciante escribio al denunciar, mas lo que copio. */
const NOTA_MAX = 500;

/**
 * Un ticket de la bandeja de administracion: toda la denuncia y lo que se puede
 * hacer con ella.
 *
 * Lo que se lee aqui NO es el chat: son los mensajes que la persona denunciante
 * copio al denunciar (D10, migracion 0009). El chat sigue cerrado tambien para
 * los admins, y por eso la copia se guarda aparte: bloquear borra la
 * conversacion justo cuando hace falta la prueba.
 *
 * Al abrirlo se reclama la denuncia (`match_admin_take`): si dos admins la
 * abren, consta quien se puso con ella.
 */
export default function AlertaAdmin() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const [ticket, setTicket] = useState<MatchAdminTicketRow | null>(null);
  const [mensajes, setMensajes] = useState<MatchAdminReportMessageRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [resolucion, setResolucion] = useState<MatchReportResolution | null>(null);
  const [hechas, setHechas] = useState<MatchReportResolution[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState<'foto' | 'desactivar' | 'expulsar' | 'resolver' | null>(null);

  const cargar = useCallback(async () => {
    if (!reportId) return;
    try {
      const leido = await leerTicket(reportId);
      setTicket(leido);
      setMensajes(leido.mensajes > 0 ? await leerMensajesDenunciados(reportId) : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la alerta.');
    } finally {
      setCargando(false);
    }
  }, [reportId]);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      void (async () => {
        await cargar();
        // Reclamarla es un efecto de abrirla, no un boton: si ya la tenia otra
        // persona devuelve false y no pasa nada.
        if (!vivo || !reportId) return;
        try {
          if (await reclamarAlerta(reportId)) await cargar();
        } catch {
          // Reclamar es cortesia entre admins: si falla, el ticket se puede
          // gestionar igual y el error real saldra en la accion de verdad.
        }
      })();
      return () => {
        vivo = false;
      };
    }, [cargar, reportId]),
  );

  const ejecutar = useCallback(
    // `unknown` y no `void`: expulsar devuelve si de verdad estaba en la ruta, y
    // aqui da igual (el ticket se recarga y lo cuenta el).
    async (accion: () => Promise<unknown>, hecho: MatchReportResolution | null, mensaje: string) => {
      setOcupado(true);
      try {
        await accion();
        if (hecho) setHechas((previas) => [...previas, hecho]);
        setAviso(mensaje);
        setError(null);
        await cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
      } finally {
        setOcupado(false);
        setConfirmando(null);
      }
    },
    [cargar],
  );

  if (cargando) return <Loading label="Abriendo la alerta..." />;
  if (!ticket) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <View style={styles.cuerpo}>
          <Banner tone="error">{error ?? 'Esa alerta ya no existe.'}</Banner>
        </View>
      </SafeAreaView>
    );
  }

  const estado = ESTADOS[ticket.status];
  const puede = accionesTicket(ticket);
  const elegida = resolucion ?? resolucionSugerida(ticket, hechas);

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {aviso ? <Banner tone="success">{aviso}</Banner> : null}

        <View style={styles.cabecera}>
          <View style={styles.estado}>
            <View style={[styles.punto, styles[`punto_${estado.tono}`]]} />
            <Text style={styles.estadoTexto}>{estado.etiqueta.toUpperCase()}</Text>
          </View>
          <Text style={styles.cuando}>{hace(ticket.created_at, new Date())}</Text>
        </View>

        <Card>
          <Text style={typography.overline}>Sobre quién</Text>
          <View style={styles.persona}>
            <AvatarCana nombre={ticket.reported_name} foto={ticket.reported_avatar_url} tamano={64} />
            <View style={styles.personaDatos}>
              <Text style={styles.nombre}>{ticket.reported_name}</Text>
              {ticket.reported_bio ? <Text style={typography.muted}>{ticket.reported_bio}</Text> : null}
              <Text style={styles.dato}>
                Su caña está {ticket.reported_active ? 'activada' : 'apagada'}
                {ticket.reported_in_route ? '' : ' · ya no está en la ruta'}
              </Text>
            </View>
          </View>
          <Text style={styles.dato}>Ruta: {ticket.route_name}</Text>
          <Text style={styles.dato}>Quien denuncia: {ticket.reporter_name}</Text>
        </Card>

        <Card>
          <Text style={typography.overline}>Motivo</Text>
          <Text style={styles.motivo}>{etiquetaMotivo(ticket.reason)}</Text>
          {ticket.detail ? <Text style={styles.detalle}>«{ticket.detail}»</Text> : null}
        </Card>

        {mensajes.length > 0 ? (
          <Card>
            <Text style={typography.overline}>Mensajes de {ticket.reported_name} ({mensajes.length})</Text>
            {/*
              Decir de quien son NO es un adorno: al leerlos seguidos parecen una
              conversacion entre dos, y no lo son. La denuncia solo copia los
              mensajes de quien esta denunciado (match_report, 0009), asi que lo
              que escribio la otra persona no esta aqui ni se puede pedir: el
              chat esta cerrado tambien para los admins (D10).
            */}
            <Text style={typography.muted}>
              Solo se copian los suyos. Lo que escribió {ticket.reporter_name} no se guarda, y los chats
              no se pueden leer.
            </Text>
            {mensajes.map((mensaje) => {
              const suceso = mensaje.kind !== 'text';
              return (
                <View key={mensaje.message_id} style={suceso ? styles.suceso : styles.mensaje}>
                  {suceso ? null : <Text style={styles.mensajeQuien}>{ticket.reported_name}</Text>}
                  <Text style={suceso ? styles.sucesoTexto : styles.mensajeCuerpo}>
                    {textoMensaje(mensaje, ticket.reported_name)}
                  </Text>
                  <Text style={styles.mensajeCuando}>{hora(new Date(mensaje.created_at))}</Text>
                </View>
              );
            })}
          </Card>
        ) : null}

        {ticket.status === 'resuelta' ? (
          <Card>
            <Text style={typography.overline}>Resuelta</Text>
            <Text style={styles.dato}>
              {etiquetaResolucion(ticket.resolution)}
              {ticket.handled_by_name ? ` · por ${ticket.handled_by_name}` : ''}
            </Text>
            {ticket.handler_note ? <Text style={styles.detalle}>«{ticket.handler_note}»</Text> : null}
          </Card>
        ) : (
          <Card>
            <Text style={typography.overline}>Acciones</Text>
            <Button
              title="Retirar la foto"
              variant="secondary"
              disabled={!puede.puedeRetirarFoto || ocupado}
              onPress={() => setConfirmando('foto')}
            />
            <Button
              title="Desactivar su caña"
              variant="secondary"
              disabled={!puede.puedeDesactivar || ocupado}
              onPress={() => setConfirmando('desactivar')}
            />
            {/*
              La medida gorda, y por eso va en rojo y la ultima: le quita el
              acceso a ESTA ruta. No borra su cuenta ni sus sellos.
            */}
            <Button
              title="Expulsar de la ruta"
              variant="danger"
              disabled={!puede.puedeExpulsar || ocupado}
              onPress={() => setConfirmando('expulsar')}
            />

            <Text style={[typography.overline, styles.separado]}>Nota interna</Text>
            <Field
              label=""
              value={nota}
              onChangeText={setNota}
              maxLength={NOTA_MAX}
              placeholder="Queda en el registro de moderación"
              multiline
              editable={!ocupado}
            />

            <Text style={[typography.overline, styles.separado]}>Cerrar como</Text>
            <View style={styles.resoluciones}>
              {RESOLUCIONES.map(({ id, etiqueta, ayuda }) => {
                const marcada = id === elegida;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: marcada }}
                    onPress={() => setResolucion(id)}
                    style={[styles.resolucion, marcada && styles.resolucionElegida]}
                  >
                    <Text style={[styles.resolucionTexto, marcada && styles.resolucionTextoElegido]}>
                      {etiqueta}
                    </Text>
                    {ayuda ? (
                      <Text style={[styles.resolucionAyuda, marcada && styles.resolucionTextoElegido]}>
                        {ayuda}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Button
              title="Marcar como resuelta"
              loading={ocupado}
              disabled={ocupado}
              onPress={() => setConfirmando('resolver')}
            />
          </Card>
        )}
      </ScrollView>

      <DialogoConfirmar
        visible={confirmando === 'foto'}
        titulo="¿Retirar la foto?"
        mensaje={`${ticket.reported_name} se queda sin foto de perfil y quedará apuntado quién lo hizo.`}
        textoConfirmar="Retirar"
        destructivo
        ocupado={ocupado}
        onConfirmar={() =>
          void ejecutar(
            () => retirarFoto(ticket.reported_id, ticket.id, nota),
            'foto_retirada',
            'Foto retirada.',
          )
        }
        onCancelar={() => setConfirmando(null)}
      />

      <DialogoConfirmar
        visible={confirmando === 'desactivar'}
        titulo="¿Desactivar su caña?"
        mensaje={`${ticket.reported_name} desaparece de Tírate una caña y de sus chats. No se borra su perfil ni sale de la ruta.`}
        textoConfirmar="Desactivar"
        destructivo
        ocupado={ocupado}
        onConfirmar={() =>
          void ejecutar(
            () => desactivarCana(ticket.reported_id, ticket.id, nota),
            'cana_desactivada',
            'Caña desactivada.',
          )
        }
        onCancelar={() => setConfirmando(null)}
      />

      <DialogoConfirmar
        visible={confirmando === 'expulsar'}
        titulo="¿Expulsar de la ruta?"
        mensaje={`${ticket.reported_name} deja de ver «${ticket.route_name}», sus bares y a su gente, y no podrá sellar. No se borra su cuenta ni sus sellos, y podría volver con otra invitación.`}
        textoConfirmar="Expulsar"
        destructivo
        ocupado={ocupado}
        onConfirmar={() =>
          void ejecutar(
            () => expulsarDeRuta(ticket.reported_id, ticket.route_id, ticket.id, nota),
            'expulsada_de_ruta',
            `${ticket.reported_name} ya no está en la ruta.`,
          )
        }
        onCancelar={() => setConfirmando(null)}
      />

      <DialogoConfirmar
        visible={confirmando === 'resolver'}
        titulo="¿Cerrar la alerta?"
        mensaje={`Se cerrará como «${etiquetaResolucion(elegida)}». Después ya no se puede tocar.`}
        textoConfirmar="Cerrar"
        ocupado={ocupado}
        onConfirmar={() =>
          void ejecutar(() => resolverAlerta(ticket.id, elegida, nota), null, 'Alerta cerrada.')
        }
        onCancelar={() => setConfirmando(null)}
      />
    </SafeAreaView>
  );
}

/**
 * La copia de un mensaje. La pregunta de la cerveza y su respuesta no son texto
 * escrito sino sucesos del chat (el cuerpo va vacio), y se cuentan con palabras
 * y con el nombre delante: quien lee la denuncia necesita saber si hubo un si
 * de por medio, y no confundirlos con lo que la persona escribio.
 */
function textoMensaje(mensaje: MatchAdminReportMessageRow, nombre: string): string {
  switch (mensaje.kind) {
    case 'question':
      return `${nombre} ofreció tomar una caña`;
    case 'answer':
      return mensaje.answer === 'yes'
        ? `${nombre} aceptó la caña`
        : `${nombre} pidió que se lo preguntaran más tarde`;
    default:
      return mensaje.body ?? '';
  }
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  estado: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  punto: { width: 8, height: 8, borderRadius: radius.pill },
  punto_aviso: { backgroundColor: colors.stamp },
  punto_curso: { backgroundColor: colors.beer },
  punto_hecho: { backgroundColor: colors.green },
  estadoTexto: { fontSize: 11, fontWeight: '800', color: colors.inkSoft, letterSpacing: 0.5 },
  cuando: { fontSize: 12, color: colors.inkFaint },
  persona: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  personaDatos: { flex: 1, gap: 2 },
  nombre: { ...typography.cardTitle },
  dato: { fontSize: 13, color: colors.inkSoft },
  motivo: { ...typography.cardTitle },
  detalle: { fontSize: 14, color: colors.ink, fontStyle: 'italic' },
  mensaje: {
    backgroundColor: colors.paperDeep,
    borderRadius: radius.md,
    padding: space.md,
    gap: 2,
  },
  mensajeQuien: { fontSize: 11, fontWeight: '800', color: colors.inkSoft },
  mensajeCuando: { fontSize: 11, color: colors.inkFaint, alignSelf: 'flex-end' },
  // Un suceso del chat (ofrecer la cana, aceptarla) no es algo que se escribiera:
  // sin burbuja y en cursiva, para que no se lea como un mensaje mas.
  suceso: { paddingHorizontal: space.md, paddingVertical: space.xs, gap: 2 },
  sucesoTexto: { fontSize: 13, color: colors.inkSoft, fontStyle: 'italic' },
  mensajeCuerpo: { fontSize: 14, color: colors.ink },
  separado: { marginTop: space.sm },
  resoluciones: { gap: space.sm },
  resolucion: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: colors.card,
  },
  resolucionElegida: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  resolucionTexto: { fontSize: 14, fontWeight: '700', color: colors.ink },
  resolucionAyuda: { fontSize: 12, color: colors.inkSoft },
  resolucionTextoElegido: { color: colors.white },
});

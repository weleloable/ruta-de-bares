import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field, Loading } from '../../../src/components/ui';
import {
  desactivarCana,
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
  const [confirmando, setConfirmando] = useState<'foto' | 'desactivar' | 'resolver' | null>(null);

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
    async (accion: () => Promise<void>, hecho: MatchReportResolution | null, mensaje: string) => {
      setOcupado(true);
      try {
        await accion();
        if (hecho) setHechas((previas) => [...previas, hecho]);
        setAviso(mensaje);
        setError(null);
        await cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo completar la accion.');
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
          <Text style={typography.overline}>Sobre quien</Text>
          <View style={styles.persona}>
            <AvatarCana nombre={ticket.reported_name} foto={ticket.reported_avatar_url} tamano={64} />
            <View style={styles.personaDatos}>
              <Text style={styles.nombre}>{ticket.reported_name}</Text>
              {ticket.reported_bio ? <Text style={typography.muted}>{ticket.reported_bio}</Text> : null}
              <Text style={styles.dato}>
                Su cana esta {ticket.reported_active ? 'activada' : 'apagada'}
              </Text>
            </View>
          </View>
          <Text style={styles.dato}>Ruta: {ticket.route_name}</Text>
          <Text style={styles.dato}>Denunciada por: {ticket.reporter_name}</Text>
        </Card>

        <Card>
          <Text style={typography.overline}>Motivo</Text>
          <Text style={styles.motivo}>{etiquetaMotivo(ticket.reason)}</Text>
          {ticket.detail ? <Text style={styles.detalle}>«{ticket.detail}»</Text> : null}
        </Card>

        {mensajes.length > 0 ? (
          <Card>
            <Text style={typography.overline}>
              Lo que escribió {ticket.reported_name} ({mensajes.length})
            </Text>
            {/*
              No es el chat: es lo que la denuncia se llevo copiado, y la copia
              solo trae los mensajes de quien esta denunciado (match_report, en
              la 0009). El chat no se puede leer desde aqui ni desde ningun
              sitio, tampoco siendo admin (D10). Por eso no se repite el nombre
              en cada burbuja: son todas suyas.
            */}
            {mensajes.map((mensaje) => (
              <View key={mensaje.message_id} style={styles.mensaje}>
                <Text style={styles.mensajeCuerpo}>{textoMensaje(mensaje)}</Text>
                <Text style={styles.mensajeCuando}>{hora(new Date(mensaje.created_at))}</Text>
              </View>
            ))}
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
              title="Desactivar su cana"
              variant="secondary"
              disabled={!puede.puedeDesactivar || ocupado}
              onPress={() => setConfirmando('desactivar')}
            />

            <Text style={[typography.overline, styles.separado]}>Nota interna</Text>
            <Field
              label=""
              value={nota}
              onChangeText={setNota}
              maxLength={NOTA_MAX}
              placeholder="Queda en el registro de moderacion"
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
        mensaje={`${ticket.reported_name} se queda sin foto de perfil y quedara apuntado quien lo hizo.`}
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
        titulo="¿Desactivar su cana?"
        mensaje={`${ticket.reported_name} desaparece de la cana y de sus chats. No se borra su perfil.`}
        textoConfirmar="Desactivar"
        destructivo
        ocupado={ocupado}
        onConfirmar={() =>
          void ejecutar(
            () => desactivarCana(ticket.reported_id, ticket.id, nota),
            'cana_desactivada',
            'Cana desactivada.',
          )
        }
        onCancelar={() => setConfirmando(null)}
      />

      <DialogoConfirmar
        visible={confirmando === 'resolver'}
        titulo="¿Cerrar la alerta?"
        mensaje={`Se cerrara como "${etiquetaResolucion(elegida)}". Despues ya no se puede tocar.`}
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
 * La copia de un mensaje, en una linea. La pregunta y la respuesta son eventos
 * sin texto (el cuerpo va vacio), asi que aqui se cuentan con palabras: quien
 * lee la denuncia necesita saber si hubo un si de por medio.
 */
function textoMensaje(mensaje: MatchAdminReportMessageRow): string {
  switch (mensaje.kind) {
    case 'question':
      return 'Le pregunto si se tomaban una cerveza';
    case 'answer':
      return mensaje.answer === 'yes' ? 'Dijo que si a la cerveza' : 'Pidio que se lo preguntaran mas tarde';
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
  mensajeCuando: { fontSize: 11, color: colors.inkFaint, alignSelf: 'flex-end' },
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

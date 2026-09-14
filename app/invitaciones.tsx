import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Divider, EmptyState, Field, Loading } from '../src/components/ui';
import { useAuth } from '../src/features/auth/AuthProvider';
import {
  createInvite,
  inviteStatus,
  listInvites,
  revokeInvite,
  type CreatedInvite,
} from '../src/features/invites/api';
import { buildInviteUrl, buildShareMessage } from '../src/features/invites/link';
import { diaLargo } from '../src/lib/fechas';
import { colors, radius, space, typography } from '../src/lib/theme';
import type { InviteRow } from '../src/types/database';

/**
 * Invitaciones, solo administradores.
 *
 * El token completo se ve UNA vez, justo despues de crearlo: la base de datos
 * guarda solo su sha256 y no hay forma de recuperarlo. La lista de abajo
 * muestra el estado, no el codigo.
 */
export default function InvitacionesScreen() {
  const { isAdmin } = useAuth();
  const [invitaciones, setInvitaciones] = useState<InviteRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [etiqueta, setEtiqueta] = useState('');
  const [dias, setDias] = useState('7');
  const [creando, setCreando] = useState(false);
  const [recienCreada, setRecienCreada] = useState<CreatedInvite | null>(null);
  // La etiqueta del campo se vacia al crear; el mensaje que se comparte necesita
  // la que se uso, no la del formulario ya limpio.
  const [etiquetaCreada, setEtiquetaCreada] = useState('');
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setInvitaciones(await listInvites());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las invitaciones.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void cargar();
    else setCargando(false);
  }, [isAdmin, cargar]);

  async function onCrear() {
    const diasNumero = Number(dias);
    if (!Number.isInteger(diasNumero) || diasNumero < 1 || diasNumero > 90) {
      setError('La caducidad tiene que ser un numero entero de dias entre 1 y 90.');
      return;
    }

    setCreando(true);
    setError(null);
    setCopiado(false);
    try {
      const creada = await createInvite(etiqueta, diasNumero);
      setRecienCreada(creada);
      setEtiquetaCreada(etiqueta);
      setEtiqueta('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la invitacion.');
    } finally {
      setCreando(false);
    }
  }

  async function onCopiar() {
    if (!recienCreada) return;
    await Clipboard.setStringAsync(buildShareMessage(recienCreada.token, etiquetaCreada));
    setCopiado(true);
  }

  async function onCompartir() {
    if (!recienCreada) return;
    await Share.share({ message: buildShareMessage(recienCreada.token, etiquetaCreada) });
  }

  function onAnular(invitacion: InviteRow) {
    Alert.alert('Anular invitacion', 'El enlace dejara de funcionar para siempre.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Anular',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeInvite(invitacion.id);
            await cargar();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo anular la invitacion.');
          }
        },
      },
    ]);
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState
          title="Solo para administradores"
          body="Las invitaciones las crean los administradores de la ruta."
        />
      </SafeAreaView>
    );
  }

  if (cargando && invitaciones.length === 0) return <Loading label="Cargando invitaciones..." />;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colors.beer} />
        }
      >
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Card>
          <Text style={typography.sectionTitle}>Nueva invitacion</Text>
          <Text style={typography.muted}>
            Genera un enlace que sirve una sola vez. Quien lo use crea una cuenta de participante,
            sin acceso al editor de rutas.
          </Text>
          <Field
            label="Para quien es"
            value={etiqueta}
            onChangeText={setEtiqueta}
            placeholder="Marta"
            hint="Opcional. Solo para que tu sepas a quien se la diste."
          />
          <Field
            label="Caduca en (dias)"
            value={dias}
            onChangeText={setDias}
            keyboardType="number-pad"
            hint="Entre 1 y 90."
          />
          <Button title="Crear invitacion" onPress={onCrear} loading={creando} />
        </Card>

        {recienCreada ? (
          <Card style={styles.tarjetaToken}>
            <Text style={typography.overline}>Enlace listo</Text>
            <Text style={typography.muted}>
              Copialo ahora. Este codigo no se puede volver a ver: solo guardamos su huella.
            </Text>
            <View style={styles.cajaToken}>
              <Text selectable style={styles.token}>
                {buildInviteUrl(recienCreada.token)}
              </Text>
            </View>
            <Button title={copiado ? 'Copiado' : 'Copiar mensaje'} onPress={onCopiar} />
            <Button title="Compartir" variant="secondary" onPress={onCompartir} />
            <Button
              title="Ya lo tengo, ocultar"
              variant="ghost"
              onPress={() => {
                setRecienCreada(null);
                setCopiado(false);
              }}
            />
          </Card>
        ) : null}

        <Text style={typography.sectionTitle}>Historial</Text>

        {invitaciones.length === 0 ? (
          <EmptyState
            title="Sin invitaciones"
            body="Cuando crees la primera aparecera aqui con su estado."
          />
        ) : (
          invitaciones.map((invitacion) => {
            const estado = inviteStatus(invitacion);
            return (
              <Card key={invitacion.id}>
                <View style={styles.filaEstado}>
                  <Text style={typography.cardTitle}>
                    {invitacion.label.length > 0 ? invitacion.label : 'Sin etiqueta'}
                  </Text>
                  <View style={[styles.etiqueta, styles[`etiqueta_${estado}`]]}>
                    <Text style={styles.etiquetaTexto}>{estado}</Text>
                  </View>
                </View>
                <Text style={typography.muted}>
                  Creada el {diaLargo(new Date(invitacion.created_at))}
                </Text>
                <Text style={typography.muted}>
                  {invitacion.used_at
                    ? `Usada el ${diaLargo(new Date(invitacion.used_at))}`
                    : `Caduca el ${diaLargo(new Date(invitacion.expires_at))}`}
                </Text>
                {estado === 'activa' ? (
                  <>
                    <Divider />
                    <Button title="Anular" variant="ghost" onPress={() => onAnular(invitacion)} />
                  </>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  tarjetaToken: { borderColor: colors.stamp, borderWidth: 2 },
  cajaToken: {
    backgroundColor: colors.paperDeep,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  token: { fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] },
  filaEstado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  etiqueta: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  etiqueta_activa: { backgroundColor: '#DCEBE1', borderColor: colors.green },
  etiqueta_usada: { backgroundColor: colors.paperDeep, borderColor: colors.border },
  etiqueta_caducada: { backgroundColor: colors.stampSoft, borderColor: colors.danger },
  etiquetaTexto: { fontSize: 11, fontWeight: '700', color: colors.ink, textTransform: 'uppercase' },
});

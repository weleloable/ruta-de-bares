import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, EmptyState, Field, Loading } from '../../../src/components/ui';
import {
  decidirFoto,
  ErrorAdmin,
  leerSolicitudFoto,
  urlPublicaAvatar,
  type AvatarAdminRequestRow,
} from '../../../src/features/admin/api';
import { hace, MOTIVO_MAX, motivoValido } from '../../../src/features/admin/alertas';
import { colors, radius, space, typography } from '../../../src/lib/theme';

/**
 * Una foto de perfil pendiente de aprobar (0020), solo administradores.
 *
 * Se ve la foto nueva grande y, al lado, la que tiene puesta ahora, para
 * decidir con las dos delante. Aprobar la pone en el perfil; rechazar exige un
 * motivo, que es lo que la persona lee en Mi perfil.
 *
 * Quien protege esto de verdad es avatar_admin_decide() en Postgres: aunque
 * alguien llegue aqui escribiendo la URL, la consulta le falla con NOT_ADMIN.
 */
export default function FotoAdmin() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();

  const [fila, setFila] = useState<AvatarAdminRequestRow | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enCurso, setEnCurso] = useState<'aprobar' | 'rechazar' | null>(null);

  const cargar = useCallback(async () => {
    if (!requestId) return;
    try {
      setFila(await leerSolicitudFoto(requestId));
      setError(null);
    } catch (e) {
      setFila(null);
      setError(e instanceof Error ? e.message : 'No se pudo leer la foto.');
    } finally {
      setCargando(false);
    }
  }, [requestId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function decidir(decision: Parameters<typeof decidirFoto>[1]) {
    if (!fila) return;
    setEnCurso(decision.aprobar ? 'aprobar' : 'rechazar');
    setError(null);
    try {
      await decidirFoto(fila, decision);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la decision.');
      // Otra persona se adelanto, o la foto fue sustituida: se relee para
      // ensenar como esta ahora en vez de dejar botones que ya no valen.
      if (e instanceof ErrorAdmin && (e.codigo === 'REQUEST_NOT_PENDING' || e.codigo === 'REQUEST_NOT_FOUND')) {
        await cargar();
      }
    } finally {
      setEnCurso(null);
    }
  }

  if (cargando) return <Loading label="Cargando la foto..." />;

  if (!fila) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState title="Foto no encontrada" body={error ?? 'Esta foto ya no está pendiente.'} />
      </SafeAreaView>
    );
  }

  const pendiente = fila.status === 'pendiente';
  const actual = fila.current_avatar_thumb_url ?? fila.current_avatar_url;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <KeyboardAvoidingView style={styles.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
          {error ? <Banner tone="error">{error}</Banner> : null}

          {!pendiente ? (
            <Banner tone={fila.status === 'aprobada' ? 'success' : 'info'}>
              {fila.status === 'aprobada'
                ? `Aprobada por ${fila.decided_by_name ?? 'otra persona'}${fila.decided_at ? ` ${hace(fila.decided_at, new Date())}` : ''}.`
                : `Rechazada por ${fila.decided_by_name ?? 'otra persona'}${fila.reason ? `: ${fila.reason}` : '.'}`}
            </Banner>
          ) : null}

          <Card style={styles.tarjeta}>
            <Text style={typography.overline}>Foto de perfil nueva</Text>
            <Text style={typography.sectionTitle}>{fila.user_name}</Text>
            <Text style={typography.muted}>La subió {hace(fila.created_at, new Date())}</Text>

            <Image
              source={{ uri: urlPublicaAvatar(fila.foto_path) }}
              style={styles.foto}
              contentFit="cover"
              accessibilityLabel={`Foto nueva de ${fila.user_name}`}
            />

            {/*
              La MINIATURA tambien se ve, y es a proposito: es un fichero aparte
              que sube la persona, el servidor no puede saber si es una version
              reducida de la foto grande, y es lo que ven los demas en la grilla y
              en las listas. Si aqui solo se viera la grande, aprobar seria dar el
              visto bueno a una imagen que nadie ha mirado.
            */}
            {pendiente ? (
              <View style={styles.actual}>
                <Image
                  source={{ uri: urlPublicaAvatar(fila.thumb_path) }}
                  style={styles.miniatura}
                  contentFit="cover"
                  accessibilityLabel={`Miniatura de ${fila.user_name}`}
                />
                <View style={styles.actualTexto}>
                  <Text style={typography.cardTitle}>Miniatura</Text>
                  <Text style={typography.muted}>
                    Así se ve en la grilla y en las listas. Comprueba que es la misma foto de arriba.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Solo con la solicitud pendiente: decidida, "la actual" ya no es un termino de comparacion. */}
            {pendiente ? (
              <View style={styles.actual}>
                {actual ? (
                  <Image source={{ uri: actual }} style={styles.actualFoto} contentFit="cover" accessibilityLabel="Foto actual" />
                ) : (
                  <View style={[styles.actualFoto, styles.actualVacia]} />
                )}
                <View style={styles.actualTexto}>
                  <Text style={typography.cardTitle}>{actual ? 'Foto actual' : 'Sin foto todavía'}</Text>
                  <Text style={typography.muted}>
                    {actual ? 'Es la que se ve ahora. Se sustituye si apruebas la nueva.' : 'Ahora se ven sus iniciales.'}
                  </Text>
                </View>
              </View>
            ) : null}
          </Card>

          {pendiente && !rechazando ? (
            <>
              <Button title="Aprobar" onPress={() => decidir({ aprobar: true })} loading={enCurso === 'aprobar'} disabled={enCurso !== null} />
              <Button title="Rechazar" variant="secondary" onPress={() => setRechazando(true)} disabled={enCurso !== null} />
            </>
          ) : null}

          {pendiente && rechazando ? (
            <Card style={styles.tarjeta}>
              <Field
                label="Motivo (lo verá la persona)"
                value={motivo}
                onChangeText={setMotivo}
                placeholder="Sale la cara tapada"
                multiline
                maxLength={MOTIVO_MAX}
                hint={`${motivo.trim().length}/${MOTIVO_MAX}. Sin motivo no se puede rechazar: hay que decirle por qué.`}
              />
              <Button
                title="Rechazar la foto"
                variant="danger"
                onPress={() => decidir({ aprobar: false, motivo: motivo.trim() })}
                loading={enCurso === 'rechazar'}
                disabled={!motivoValido(motivo) || enCurso !== null}
              />
              <Button title="Cancelar" variant="ghost" onPress={() => setRechazando(false)} disabled={enCurso !== null} />
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  tarjeta: { gap: space.sm },
  foto: { width: '100%', maxWidth: 360, aspectRatio: 1, alignSelf: 'center', borderRadius: radius.lg, backgroundColor: colors.paperDeep },
  actual: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  // 133 pt: lo que mide la casilla de la grilla de la cana (ver imagenes.ts).
  miniatura: { width: 133, height: 133, borderRadius: radius.md, backgroundColor: colors.paperDeep },
  actualFoto: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.paperDeep },
  actualVacia: { borderWidth: 1, borderColor: colors.border },
  actualTexto: { flex: 1, gap: 2 },
});

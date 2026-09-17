import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Divider, EmptyState, Loading } from '../src/components/ui';
import { useAuth } from '../src/features/auth/AuthProvider';
import {
  createRouteInvite,
  inviteStatus,
  listRouteInvites,
  plazasTexto,
  revokeInvite,
  type CreatedInvite,
  type InviteConRuta,
} from '../src/features/invites/api';
import { buildInviteUrl, buildShareMessage } from '../src/features/invites/link';
import { DialogoConfirmar } from '../src/features/profile/DialogoConfirmar';
import { listRoutes } from '../src/features/routes/api';
import { diaLargo } from '../src/lib/fechas';
import { colors, radius, space, typography } from '../src/lib/theme';
import type { RouteRow } from '../src/types/database';

/** Las que ofrece el formulario. El servidor acepta 1-72 (ver migracion 0004). */
const HORAS = [2, 4, 8] as const;
/** Tope de personas por enlace. El servidor acepta 1-500. */
const PLAZAS = [5, 10, 20, 50] as const;

/**
 * Invitaciones a una ruta, solo administradores.
 *
 * Desde la migracion 0004 una invitacion NO crea cuenta (el alta es abierta):
 * mete a quien la canjea en UNA ruta concreta, que es lo unico que le hara
 * visible esa ruta. El mismo enlace vale para varias personas hasta agotar las
 * plazas o caducar.
 */
export default function InvitacionesScreen() {
  const { isAdmin } = useAuth();

  const [rutas, setRutas] = useState<RouteRow[]>([]);
  const [invitaciones, setInvitaciones] = useState<InviteConRuta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rutaId, setRutaId] = useState<string | null>(null);
  const [horas, setHoras] = useState<number>(4);
  const [plazas, setPlazas] = useState<number>(20);
  const [creando, setCreando] = useState(false);
  const [recienCreada, setRecienCreada] = useState<CreatedInvite | null>(null);
  // El nombre de la ruta que se uso al crear: el selector puede cambiar
  // despues y el mensaje que se comparte tiene que nombrar la de verdad.
  const [rutaCreada, setRutaCreada] = useState('');
  // Id de la fila cuyo enlace se acaba de copiar, para el aviso de "Copiado".
  const [copiado, setCopiado] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<InviteConRuta | null>(null);
  const [anulandoEnCurso, setAnulandoEnCurso] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [misRutas, historial] = await Promise.all([listRoutes(), listRouteInvites()]);
      setRutas(misRutas);
      setInvitaciones(historial);
      // Preselecciona la primera ruta para que crear sea un solo toque.
      setRutaId((actual) =>
        actual !== null && misRutas.some((r) => r.id === actual) ? actual : (misRutas[0]?.id ?? null),
      );
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
    if (rutaId === null) return;
    setCreando(true);
    setError(null);
    setCopiado(null);
    try {
      const creada = await createRouteInvite(rutaId, plazas, horas);
      setRecienCreada(creada);
      setRutaCreada(rutas.find((r) => r.id === rutaId)?.name ?? '');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la invitacion.');
    } finally {
      setCreando(false);
    }
  }

  /** Tocar el enlace lo copia: es la accion que se quiere el 100% de las veces. */
  async function onCopiarEnlace(id: string, token: string) {
    await Clipboard.setStringAsync(buildInviteUrl(token));
    setCopiado(id);
  }

  async function onCompartir(token: string, nombreRuta: string) {
    await Share.share({ message: buildShareMessage(token, nombreRuta) });
  }

  async function onAnularConfirmado() {
    if (!anulando) return;
    setAnulandoEnCurso(true);
    try {
      await revokeInvite(anulando.id);
      setAnulando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular la invitacion.');
    } finally {
      setAnulandoEnCurso(false);
    }
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState
          title="Solo para administradores"
          body="Las invitaciones a una ruta las crean los administradores."
        />
      </SafeAreaView>
    );
  }

  if (cargando && invitaciones.length === 0 && rutas.length === 0) {
    return <Loading label="Cargando invitaciones..." />;
  }

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
          {rutas.length === 0 ? (
            <Text style={typography.muted}>
              Crea una ruta en el editor antes de invitar a nadie.
            </Text>
          ) : (
            <>
              <Selector
                etiqueta="Ruta seleccionada"
                opciones={rutas.map((r) => ({ valor: r.id, texto: r.name }))}
                valor={rutaId}
                onCambio={setRutaId}
              />
              <Selector
                etiqueta="Caduca en (horas)"
                opciones={HORAS.map((h) => ({ valor: h, texto: `${h} h` }))}
                valor={horas}
                onCambio={setHoras}
              />
              <Selector
                etiqueta="Plazas"
                opciones={PLAZAS.map((p) => ({ valor: p, texto: String(p) }))}
                valor={plazas}
                onCambio={setPlazas}
              />
              <Button
                title="Crear invitacion"
                onPress={onCrear}
                loading={creando}
                disabled={rutaId === null}
              />
            </>
          )}
        </Card>

        {recienCreada ? (
          <Card style={styles.tarjetaToken}>
            <Text style={typography.overline}>Enlace listo</Text>
            <Pressable onPress={() => onCopiarEnlace(recienCreada.id, recienCreada.token)}>
              <View style={styles.cajaToken}>
                <Text style={styles.token}>{buildInviteUrl(recienCreada.token)}</Text>
              </View>
            </Pressable>
            <Button
              title={copiado === recienCreada.id ? 'Copiado' : 'Copiar enlace'}
              onPress={() => onCopiarEnlace(recienCreada.id, recienCreada.token)}
            />
            <Button
              title="Compartir"
              variant="secondary"
              onPress={() => onCompartir(recienCreada.token, rutaCreada)}
            />
            <Button
              title="Ya lo tengo, ocultar"
              variant="ghost"
              onPress={() => {
                setRecienCreada(null);
                setCopiado(null);
              }}
            />
          </Card>
        ) : null}

        <Text style={typography.sectionTitle}>Historial</Text>

        {invitaciones.length === 0 ? (
          <EmptyState
            title="Sin invitaciones"
            body="Cuando crees la primera aparecera aqui con su estado y su enlace."
          />
        ) : (
          invitaciones.map((invitacion) => {
            const estado = inviteStatus(invitacion);
            return (
              <Card key={invitacion.id}>
                <View style={styles.filaEstado}>
                  <Text style={typography.cardTitle}>{invitacion.routeName}</Text>
                  <View style={[styles.etiqueta, styles[`etiqueta_${estado}`]]}>
                    <Text style={styles.etiquetaTexto}>{estado}</Text>
                  </View>
                </View>

                <Text style={typography.muted}>
                  Creada el {diaLargo(new Date(invitacion.created_at))}
                </Text>
                <Text style={typography.muted}>
                  Caduca el {diaLargo(new Date(invitacion.expires_at))}
                </Text>
                <Text style={typography.muted}>{plazasTexto(invitacion)}</Text>

                <Pressable
                  onPress={() => onCopiarEnlace(invitacion.id, invitacion.token)}
                  accessibilityRole="button"
                  accessibilityLabel={`Copiar el enlace de ${invitacion.routeName}`}
                >
                  <View style={styles.cajaToken}>
                    <Text style={styles.token} numberOfLines={2}>
                      {buildInviteUrl(invitacion.token)}
                    </Text>
                    <Text style={styles.pistaCopiar}>
                      {copiado === invitacion.id ? 'Copiado' : 'Toca para copiar'}
                    </Text>
                  </View>
                </Pressable>

                {estado === 'activa' ? (
                  <>
                    <Divider />
                    <Button
                      title="Anular"
                      variant="ghost"
                      onPress={() => setAnulando(invitacion)}
                    />
                  </>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>

      {/*
        Con Alert.alert este boton no hacia NADA en web: react-native-web lo
        define como `static alert() {}`, sin pintar ni llamar al callback. Es el
        mismo fallo que se arreglo en "Cerrar sesion" (PR #8), y la solucion es
        la misma: un Modal propio que funciona en las dos plataformas.
      */}
      <DialogoConfirmar
        visible={anulando !== null}
        titulo="Anular la invitacion"
        mensaje="El enlace dejara de funcionar. Quien ya haya entrado con el se queda en la ruta."
        textoConfirmar="Anular"
        destructivo
        ocupado={anulandoEnCurso}
        onConfirmar={onAnularConfirmado}
        onCancelar={() => setAnulando(null)}
      />
    </SafeAreaView>
  );
}

/**
 * Fila de pildoras para elegir una opcion.
 *
 * Es el patron que ya usa la pestana Sellos para cambiar de ruta, y no un
 * desplegable: en el movil se elige de un toque y se ve todo lo que hay.
 */
function Selector<T extends string | number>({
  etiqueta,
  opciones,
  valor,
  onCambio,
}: {
  etiqueta: string;
  opciones: { valor: T; texto: string }[];
  valor: T | null;
  onCambio: (valor: T) => void;
}) {
  return (
    <View style={styles.selector}>
      <Text style={typography.muted}>{etiqueta}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {opciones.map((opcion) => {
          const activa = opcion.valor === valor;
          return (
            <Pressable
              key={String(opcion.valor)}
              onPress={() => onCambio(opcion.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: activa }}
              style={[styles.chip, activa && styles.chipActivo]}
            >
              <Text style={[styles.chipTexto, activa && styles.chipTextoActivo]}>
                {opcion.texto}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  selector: { gap: space.xs },
  chips: { gap: space.sm, paddingVertical: space.xs },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  chipActivo: { backgroundColor: colors.stamp, borderColor: colors.stamp },
  chipTexto: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  chipTextoActivo: { color: colors.white },
  tarjetaToken: { borderColor: colors.stamp, borderWidth: 2 },
  cajaToken: {
    backgroundColor: colors.paperDeep,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.xs,
  },
  token: { fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] },
  pistaCopiar: { fontSize: 11, fontWeight: '700', color: colors.inkFaint, textTransform: 'uppercase' },
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
  etiqueta_llena: { backgroundColor: colors.paperDeep, borderColor: colors.borderStrong },
  etiqueta_caducada: { backgroundColor: colors.paperDeep, borderColor: colors.border },
  etiqueta_anulada: { backgroundColor: colors.stampSoft, borderColor: colors.danger },
  etiquetaTexto: { fontSize: 11, fontWeight: '700', color: colors.ink, textTransform: 'uppercase' },
});

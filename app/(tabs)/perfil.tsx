import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Divider, Field } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { initials, pickAvatar, updateDisplayName, uploadAvatar } from '../../src/features/profile/api';
import { DialogoConfirmar } from '../../src/features/profile/DialogoConfirmar';
import { useInstalacion } from '../../src/features/pwa/pwa';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { colors, radius, space, typography } from '../../src/lib/theme';

export default function PerfilScreen() {
  const { session, profile, isAdmin, signOut, refreshProfile } = useAuth();
  const { stamps } = useActiveRoute();
  const router = useRouter();
  // En la app nativa devuelve 'no-web' y la tarjeta no se pinta.
  const { estado: instalacion, instalando, instalar } = useInstalacion();

  const [nombre, setNombre] = useState(profile?.display_name ?? '');
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  // El perfil llega despues del primer render (lo carga AuthProvider): sin esto
  // el campo se queda vacio aunque el usuario tenga nombre.
  useEffect(() => {
    setNombre(profile?.display_name ?? '');
  }, [profile?.display_name]);

  const email = session?.user.email ?? '';
  const cambiado = profile !== null && nombre.trim() !== profile.display_name;

  async function onGuardarNombre() {
    if (!profile || !cambiado) return;
    setGuardando(true);
    setError(null);
    setExito(null);
    try {
      await updateDisplayName(profile.id, nombre);
      await refreshProfile();
      setExito('Nombre actualizado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el nombre.');
    } finally {
      setGuardando(false);
    }
  }

  async function onCambiarFoto() {
    if (!profile) return;
    setError(null);
    setExito(null);
    try {
      const elegida = await pickAvatar();
      if (!elegida) return;
      setSubiendo(true);
      await uploadAvatar(profile.id, elegida);
      await refreshProfile();
      setExito('Foto de perfil actualizada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la foto.');
    } finally {
      setSubiendo(false);
    }
  }

  async function onConfirmarSalir() {
    setSaliendo(true);
    setError(null);
    setExito(null);
    try {
      await signOut();
      // Si sale bien no se toca nada mas: AuthGate ve la sesion a null y
      // redirige al login, con lo que esta pantalla (y el dialogo) se desmontan.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar la sesion.');
      setConfirmandoSalida(false);
      setSaliendo(false);
    }
  }

  return (
    // 'top' porque esta pantalla ya no tiene cabecera: sin el, el contenido se
    // mete debajo de la hora y el notch. Abajo manda la barra de pestanas.
    <SafeAreaView style={styles.pantalla} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
        <Card style={styles.cabecera}>
          <Pressable onPress={onCambiarFoto} disabled={subiendo} style={styles.avatarPulsable}>
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatar}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarVacio]}>
                <Text style={styles.avatarIniciales}>
                  {initials(profile?.display_name ?? '', email)}
                </Text>
              </View>
            )}
            <Text style={styles.avatarAccion}>{subiendo ? 'Subiendo...' : 'Cambiar foto'}</Text>
          </Pressable>

          <Text style={typography.screenTitle}>{profile?.display_name || 'Sin nombre'}</Text>
          <Text style={typography.muted}>{email}</Text>

          <View style={[styles.etiqueta, isAdmin && styles.etiquetaAdmin]}>
            <Text style={[styles.etiquetaTexto, isAdmin && styles.etiquetaTextoAdmin]}>
              {isAdmin ? 'Administrador' : 'Participante'}
            </Text>
          </View>

          <Text style={typography.muted}>
            {stamps.length} {stamps.length === 1 ? 'sello conseguido' : 'sellos conseguidos'}
          </Text>
        </Card>

        {error ? <Banner tone="error">{error}</Banner> : null}
        {exito ? <Banner tone="success">{exito}</Banner> : null}

        <Card>
          <Text style={typography.sectionTitle}>Tus datos</Text>
          <Field
            label="Nombre visible"
            value={nombre}
            onChangeText={setNombre}
            placeholder="Como quieres que te llamemos"
            editable={!guardando}
          />
          <Button
            title="Guardar nombre"
            onPress={onGuardarNombre}
            disabled={!cambiado || guardando}
            loading={guardando}
          />
          <Divider />
          <Text style={typography.muted}>
            El correo no se puede cambiar desde la app. Si lo necesitas, pideselo a un
            administrador.
          </Text>
        </Card>

        {instalacion.tipo !== 'no-web' ? (
          <Card>
            <Text style={typography.sectionTitle}>Instalar la app</Text>
            {instalacion.tipo === 'instalada' ? (
              <Text style={typography.muted}>
                Ya esta instalada en este dispositivo. Abrela desde el icono de tu pantalla de inicio.
              </Text>
            ) : (
              <Text style={typography.muted}>
                Anade Ruta de Bares a tu pantalla de inicio: se abre a pantalla completa, como una app,
                sin pasar por ninguna tienda.
              </Text>
            )}
            {instalacion.tipo === 'boton' ? (
              <Button title="Instalar app" onPress={() => void instalar()} loading={instalando} />
            ) : null}
            {instalacion.tipo === 'instrucciones'
              ? instalacion.pasos.map((paso, indice) => (
                  <Text key={paso} style={typography.body}>
                    {`${indice + 1}. ${paso}`}
                  </Text>
                ))
              : null}
          </Card>
        ) : null}

        {isAdmin ? (
          <Card>
            <Text style={typography.sectionTitle}>Administracion</Text>
            <Text style={typography.muted}>
              Crea enlaces de invitacion de un solo uso para dar de alta a gente nueva.
            </Text>
            <Button
              title="Invitaciones"
              variant="secondary"
              onPress={() => router.push('/invitaciones')}
            />
          </Card>
        ) : null}

        <Button
          title="Cerrar sesion"
          variant="danger"
          onPress={() => setConfirmandoSalida(true)}
        />
      </ScrollView>

      <DialogoConfirmar
        visible={confirmandoSalida}
        titulo="¿Volveremos a bebernos?"
        textoConfirmar="Cerrar sesion"
        destructivo
        ocupado={saliendo}
        onConfirmar={onConfirmarSalir}
        onCancelar={() => setConfirmandoSalida(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  cabecera: { alignItems: 'center', gap: space.xs },
  avatarPulsable: { alignItems: 'center', gap: space.xs },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.borderStrong,
    backgroundColor: colors.paperDeep,
  },
  avatarVacio: { alignItems: 'center', justifyContent: 'center' },
  avatarIniciales: { fontSize: 34, fontWeight: '800', color: colors.inkSoft },
  avatarAccion: { fontSize: 13, fontWeight: '700', color: colors.beerDark },
  etiqueta: {
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.paperDeep,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: space.xs,
  },
  etiquetaAdmin: { backgroundColor: colors.stampSoft, borderColor: colors.stamp },
  etiquetaTexto: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },
  etiquetaTextoAdmin: { color: colors.stamp },
});

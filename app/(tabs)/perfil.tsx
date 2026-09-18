import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field } from '../../src/components/ui';
import { contarAlertas } from '../../src/features/admin/api';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { contarAvisos } from '../../src/features/notices/api';
import { initials, pickAvatar, updateDisplayName, uploadAvatar } from '../../src/features/profile/api';
import { DialogoConfirmar } from '../../src/features/profile/DialogoConfirmar';
import { colors, fonts, radius, space, typography } from '../../src/lib/theme';

export default function PerfilScreen() {
  const { session, profile, isAdmin, signOut, refreshProfile } = useAuth();
  const router = useRouter();

  const [nombre, setNombre] = useState(profile?.display_name ?? '');
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [alertas, setAlertas] = useState(0);
  const [avisos, setAvisos] = useState(0);

  /*
    Los avisos de moderacion son de todo el mundo, no solo de admins: si alguien
    tiene una decision sin leer, se entera aqui. Es lo que hace que la
    comunicacion del art. 17 del DSA llegue de verdad.
  */
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      void contarAvisos()
        .then((total) => {
          if (vivo) setAvisos(total);
        })
        .catch(() => {
          // Sin numero se entra igual: la burbujita avisa, no es la puerta.
        });
      return () => {
        vivo = false;
      };
    }, []),
  );

  /*
    Cuantas alertas quedan sin cerrar. Solo para admins y solo al mirar esta
    pantalla: quien no lo es no debe preguntar nada (el servidor le diria
    NOT_ADMIN), y aqui no hace falta sondeo porque no es una pantalla en la que
    nadie se quede.
  */
  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) {
        setAlertas(0);
        return;
      }
      let vivo = true;
      void contarAlertas()
        .then((total) => {
          if (vivo) setAlertas(total);
        })
        .catch(() => {
          // Sin numero se entra igual: la burbujita es un aviso, no la puerta.
        });
      return () => {
        vivo = false;
      };
    }, [isAdmin]),
  );

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
    // Sin 'top': el margen del notch ya lo pone BarraSuperior, y pedirlo aqui
    // dejaria un hueco doble. Abajo manda la barra de pestanas.
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
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
        </Card>

        {error ? <Banner tone="error">{error}</Banner> : null}
        {exito ? <Banner tone="success">{exito}</Banner> : null}

        <Card>
          <Text style={styles.tituloTarjeta}>Nombre de bartalla</Text>
          <Field
            label=""
            value={nombre}
            // Sin espacios: profiles_display_name_formato (migracion 0003) los
            // rechaza en el servidor, asi que aqui ni se dejan escribir.
            onChangeText={(texto) => setNombre(texto.replace(/\s/g, ''))}
            maxLength={30}
            placeholder="Como quieres que te llamemos"
            editable={!guardando}
            style={styles.inputCentrado}
          />
          <Button
            title="Guardar nombre"
            onPress={onGuardarNombre}
            disabled={!cambiado || guardando}
            loading={guardando}
          />
        </Card>

        {/*
          Antes que las rutas: una decision sobre tu cuenta es lo primero que
          tienes que ver al entrar aqui, y llega igual estando suspendida.
        */}
        <Card>
          <Text style={styles.tituloTarjeta}>Avisos</Text>
          <View>
            <Button
              title="Decisiones sobre tu cuenta"
              variant="secondary"
              textStyle={styles.textoAccionBarra}
              onPress={() => router.push('/avisos')}
            />
            {avisos > 0 ? (
              <View style={styles.burbuja} pointerEvents="none">
                <Text style={styles.burbujaTexto}>{avisos > 99 ? '99+' : avisos}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {/*
          Via de canje a mano: si el enlace https no se puede abrir (el mensaje
          llego cortado, se copio solo el codigo...), se pega aqui el enlace o el
          codigo. Para todos, no solo admins.
        */}
        <Card>
          <Text style={styles.tituloTarjeta}>Rutas</Text>
          <Button
            title="Entrar en una ruta"
            variant="secondary"
            textStyle={styles.textoAccionBarra}
            onPress={() => router.push('/invitacion')}
          />
        </Card>

        {isAdmin ? (
          <Card>
            <Text style={styles.tituloTarjeta}>Detrás de la barra</Text>
            <Button
              title="Editor de rutas"
              variant="secondary"
              textStyle={styles.textoAccionBarra}
              onPress={() => router.push('/editor')}
            />
            <Button
              title="Invitaciones"
              variant="secondary"
              textStyle={styles.textoAccionBarra}
              onPress={() => router.push('/invitaciones')}
            />
            {/*
              La burbujita va superpuesta y no dentro del texto para que el
              boton siga leyendose igual que los otros dos cuando no hay nada.
            */}
            <View>
              <Button
                title="Alertas de administración"
                variant="secondary"
                textStyle={styles.textoAccionBarra}
                onPress={() => router.push('/admin/alertas')}
              />
              {alertas > 0 ? (
                <View style={styles.burbuja} pointerEvents="none">
                  <Text style={styles.burbujaTexto}>{alertas > 99 ? '99+' : alertas}</Text>
                </View>
              ) : null}
            </View>
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
  // Misma burbujita que la de los chats sin leer de la cana.
  burbuja: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burbujaTexto: { color: colors.white, fontSize: 11, fontWeight: '800' },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  // Titulo de "Nombre de bartalla" y "Detrás de la barra": se comparte para que
  // las tarjetas de Perfil se titulen igual.
  // Georgia, peso normal, sin mayusculas: decision final tras comparar varias
  // combinaciones en vivo. Tamano igual que "Tus datos" antes de quitarlo;
  // color colors.inkFaint (#A2907C) bajado ~15% para que lea como titulo.
  tituloTarjeta: {
    fontFamily: fonts.title,
    fontSize: 19,
    color: '#8A7A69',
    textAlign: 'center',
  },
  // Misma familia que tituloTarjeta, pero sin bajar el 15%: en negrita (el peso
  // de los botones) el tono oscuro leia como negro, casi igual al resto de
  // texto de la app.
  textoAccionBarra: { color: colors.inkFaint },
  inputCentrado: { textAlign: 'center' },
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

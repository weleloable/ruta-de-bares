import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field, Loading } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { activateMatch, getMatchProfile, listMatchTags, updateMatchProfile } from '../../src/features/match/api';
import { AvatarCana, Casilla, ChipEtiqueta } from '../../src/features/match/piezas';
import { BIO_MAX, ETIQUETAS_MAX, alternarEtiqueta, validarPresentacion } from '../../src/features/match/reglas';
import { pickAvatar, uploadAvatar } from '../../src/features/profile/api';
import { colors, space, typography } from '../../src/lib/theme';
import type { MatchCatalogRow } from '../../src/types/database';

/**
 * Presentacion para Tirate una cana: frase y etiquetas, y un empujon para
 * subir foto (no es obligatoria, D9).
 *
 * modo=alta   primera activacion; `adulto` trae la casilla de mayoria de edad
 *             de la pestana, y guardar es lo que activa.
 * modo=editar cambia frase y etiquetas sin tocar si esta activado.
 */
export default function PresentacionCana() {
  const { modo, adulto } = useLocalSearchParams<{ modo?: string; adulto?: string }>();
  const alta = modo !== 'editar';
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();

  const [catalogo, setCatalogo] = useState<MatchCatalogRow[]>([]);
  const [bio, setBio] = useState('');
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [intentado, setIntentado] = useState(false);
  // Solo en el alta: activar la cana es un si explicito e informado (0009).
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const [etiquetas, perfil] = await Promise.all([listMatchTags(), alta ? null : getMatchProfile()]);
        if (!activo) return;
        setCatalogo(etiquetas);
        if (perfil) {
          setBio(perfil.bio);
          setSeleccion(perfil.tag_ids);
        }
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudo cargar tu presentación.');
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [alta]);

  const errores = validarPresentacion({ bio, etiquetas: seleccion });
  const nombre = profile?.display_name || session?.user.email?.split('@')[0] || '';

  async function onGuardar() {
    setIntentado(true);
    if (errores.length > 0 || (alta && !acepta)) return;
    setGuardando(true);
    setError(null);
    try {
      if (alta) {
        await activateMatch({ mayorDeEdad: adulto === '1', bio: bio.trim(), etiquetas: seleccion });
      } else {
        await updateMatchProfile(bio.trim(), seleccion);
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setGuardando(false);
    }
  }

  async function onFoto() {
    if (!profile) return;
    setError(null);
    try {
      const elegida = await pickAvatar();
      if (!elegida) return;
      setSubiendoFoto(true);
      await uploadAvatar(profile.id, elegida);
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la foto.');
    } finally {
      setSubiendoFoto(false);
    }
  }

  if (cargando) return <Loading label="Preparando tu presentación..." />;

  const llena = seleccion.length >= ETIQUETAS_MAX;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <Stack.Screen options={{ title: alta ? 'Preséntate' : 'Tu perfil cervecero' }} />
      <KeyboardAvoidingView style={styles.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
          {alta ? (
            <Text style={typography.muted}>
              Solo te lo pedimos la primera vez. Luego puedes cambiarlo desde la pestaña.
            </Text>
          ) : null}

          <Card style={styles.tarjetaFoto}>
            <AvatarCana nombre={nombre} foto={profile?.avatar_thumb_url ?? profile?.avatar_url ?? null} tamano={64} />
            <View style={styles.textoFoto}>
              <Text style={typography.cardTitle}>{nombre}</Text>
              <Pressable accessibilityRole="button" onPress={onFoto} disabled={subiendoFoto}>
                <Text style={styles.enlace}>
                  {subiendoFoto ? 'Subiendo...' : profile?.avatar_url ? 'Cambiar foto' : 'Añadir foto'}
                </Text>
              </Pressable>
              {!profile?.avatar_url ? <Text style={typography.muted}>Sin foto se verán tus iniciales.</Text> : null}
            </View>
          </Card>

          <View style={styles.bloque}>
            <Field
              label="Tu frase"
              value={bio}
              onChangeText={setBio}
              placeholder="Me apunto a la última ronda si alguien pide bravas."
              multiline
              maxLength={BIO_MAX}
              editable={!guardando}
              style={styles.frase}
            />
            <Text style={styles.contador}>
              {bio.trim().length}/{BIO_MAX}
            </Text>
          </View>

          <View style={styles.bloque}>
            <Text style={typography.overline}>Etiquetas</Text>
            <Text style={typography.muted}>
              Opcionales, hasta {ETIQUETAS_MAX} ({seleccion.length}/{ETIQUETAS_MAX}).
            </Text>
            <View style={styles.chips}>
              {catalogo.map((etiqueta) => {
                const marcada = seleccion.includes(etiqueta.id);
                return (
                  <ChipEtiqueta
                    key={etiqueta.id}
                    texto={etiqueta.label}
                    marcada={marcada}
                    desactivada={guardando || (llena && !marcada)}
                    onPress={() => setSeleccion((actual) => alternarEtiqueta(actual, etiqueta.id))}
                  />
                );
              })}
            </View>
          </View>

          {alta ? (
            <View style={styles.bloque}>
              <Casilla
                marcada={acepta}
                onCambiar={setAcepta}
                texto="He leído cómo funciona la caña y acepto que se active"
              />
              <Pressable accessibilityRole="button" onPress={() => router.push('/cana/condiciones')}>
                <Text style={styles.enlace}>Leer cómo funciona y qué se recoge</Text>
              </Pressable>
              {intentado && !acepta ? (
                <Text style={typography.error}>Tienes que aceptarlo para activarlo.</Text>
              ) : null}
            </View>
          ) : null}

          {intentado
            ? errores.map((mensaje) => (
                <Text key={mensaje} style={typography.error}>
                  {mensaje}
                </Text>
              ))
            : null}
          {error ? <Banner tone="error">{error}</Banner> : null}

          <Button
            title={alta ? 'Activar y ver quién hay' : 'Guardar cambios'}
            onPress={onGuardar}
            loading={guardando}
          />
          <Button title="Cancelar" variant="ghost" onPress={() => router.back()} disabled={guardando} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  tarjetaFoto: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  textoFoto: { flex: 1, gap: 2 },
  enlace: { fontSize: 14, fontWeight: '700', color: colors.beerDark },
  bloque: { gap: space.xs },
  frase: { minHeight: 84, paddingTop: space.md, textAlignVertical: 'top' },
  contador: { alignSelf: 'flex-end', fontSize: 12, color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});

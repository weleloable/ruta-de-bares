import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectorPosicion } from '../../../src/components/SelectorPosicion';
import { Banner, Button, Card, Field } from '../../../src/components/ui';
import { BarLogo } from '../../../src/features/routes/BarLogo';
import { useCatalogo, guardarBarPropio } from '../../../src/features/routes/catalogoStore';
import { CENTRO_POR_DEFECTO, NOMBRE_MAX, validarBarPropio } from '../../../src/features/routes/catalogoPropio';
import { elegirLogoBar } from '../../../src/features/routes/logoPropio';
import { colors, space, typography } from '../../../src/lib/theme';

/**
 * Alta de un bar que no esta en la lista: nombre, ubicacion e imagen del sello.
 *
 * Al guardar entra en el catalogo de ESTE dispositivo (catalogoStore.ts) y esta
 * disponible en el desplegable de cualquier ruta, no solo en la que se estaba
 * editando. El formulario de bar, que sigue montado debajo, lo deja elegido al
 * volver. Nada de esto toca Supabase: el bar solo llega a la BBDD cuando se
 * anade a una ruta, con nombre y posicion.
 */
export default function BarNuevo() {
  const router = useRouter();
  const catalogo = useCatalogo();

  const [nombre, setNombre] = useState('');
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [eligiendoLogo, setEligiendoLogo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function onElegirLogo() {
    setEligiendoLogo(true);
    setError(null);
    try {
      const elegido = await elegirLogoBar();
      if (elegido) setLogo(elegido);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo elegir la imagen.');
    } finally {
      setEligiendoLogo(false);
    }
  }

  async function onGuardar() {
    const borrador = { nombre, punto, logoUri: logo };
    const problemas = validarBarPropio(borrador, catalogo);
    setErrores(problemas);
    if (problemas.length > 0) return;

    setGuardando(true);
    setError(null);
    try {
      await guardarBarPropio(borrador);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el bar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <KeyboardAvoidingView style={styles.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
          {error ? <Banner tone="error">{error}</Banner> : null}

          <Field
            label="Nombre del bar"
            value={nombre}
            onChangeText={setNombre}
            placeholder="La Cepa"
            maxLength={NOMBRE_MAX}
            autoCapitalize="words"
          />

          <Card style={styles.tarjeta}>
            <Text style={typography.overline}>Ubicacion</Text>
            <SelectorPosicion
              punto={punto}
              // Sin circulo: el radio se elige al anadir el bar a una ruta.
              radioM={null}
              centroInicial={CENTRO_POR_DEFECTO}
              onCambiar={setPunto}
            />
          </Card>

          <View style={styles.bloque}>
            <Text style={typography.overline}>Imagen del sello</Text>
            <View style={styles.filaLogo}>
              <BarLogo nombre={nombre.trim().length > 0 ? nombre : '?'} uri={logo} tamano={88} />
              <View style={styles.botonesLogo}>
                <Button
                  title={logo ? 'Cambiar imagen' : 'Elegir imagen'}
                  variant="secondary"
                  onPress={onElegirLogo}
                  loading={eligiendoLogo}
                />
                {logo ? <Button title="Quitar imagen" variant="ghost" onPress={() => setLogo(null)} /> : null}
              </View>
            </View>
            <Text style={typography.muted}>
              Opcional. Sin imagen el sello sale con las iniciales del bar.
            </Text>
          </View>

          {errores.map((mensaje) => (
            <Text key={mensaje} style={typography.error}>
              {mensaje}
            </Text>
          ))}

          <Button title="Guardar bar" onPress={onGuardar} loading={guardando} />
          <Button title="Cancelar" variant="ghost" onPress={() => router.back()} disabled={guardando} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  tarjeta: { gap: space.sm },
  bloque: { gap: space.sm },
  filaLogo: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  botonesLogo: { flex: 1, gap: space.sm },
});

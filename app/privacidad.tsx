import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card } from '../src/components/ui';
import { politica } from '../src/features/legal/politica';
import {
  CORREO_PRIVACIDAD,
  DIAS_CONSERVACION,
  PENDIENTE,
  RESPONSABLE,
  VERSION_POLITICA,
} from '../src/features/legal/responsable';
import { exportMyData } from '../src/features/profile/api';
import { colors, radius, space, typography } from '../src/lib/theme';

/**
 * Que datos se recogen, quien responde de ellos, quien puede verlos y como
 * ejercer tus derechos — incluido descargarlos, con el recuadro de abajo.
 *
 * Existe porque el art. 13 del RGPD obliga a dar esta informacion **en el
 * momento de recoger los datos**, no despues: por eso se enlaza desde la
 * entrada, el registro y el canje de una invitacion, que es donde se recogen.
 *
 * El TEXTO no vive aqui sino en `legal/politica.ts`, porque tambien se publica
 * como pagina HTML estatica (la que exige Google para verificar el acceso con
 * Google) y dos copias acabarian diciendo cosas distintas. Aqui solo se pinta,
 * mas lo que la web estatica no puede hacer: descargar tus datos.
 *
 * El responsable y el correo son PROVISIONALES (ver `legal/responsable.ts`).
 * Mientras lo sean, la pantalla lo dice arriba del todo: una politica con
 * huecos publicada en silencio promete cosas que nadie se ha comprometido a
 * cumplir.
 */
export default function Privacidad() {
  const router = useRouter();
  const [datos, setDatos] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [errorDatos, setErrorDatos] = useState<string | null>(null);

  const texto = politica({
    responsable: RESPONSABLE,
    correo: CORREO_PRIVACIDAD,
    diasConservacion: DIAS_CONSERVACION,
  });

  async function descargar() {
    setCargando(true);
    setErrorDatos(null);
    setCopiado(false);
    try {
      setDatos(JSON.stringify(await exportMyData(), null, 2));
    } catch (e) {
      setErrorDatos(e instanceof Error ? e.message : 'No se pudieron traer tus datos.');
    } finally {
      setCargando(false);
    }
  }

  async function copiar() {
    if (!datos) return;
    await Clipboard.setStringAsync(datos);
    setCopiado(true);
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Privacidad' }} />
      <ScrollView contentContainerStyle={styles.cuerpo}>
        {PENDIENTE ? (
          <Banner tone="info">
            Borrador. Falta cerrar quién responde de los datos y el correo de contacto. Mientras tanto, escribe desde
            Mi perfil, en "Escribir a la organización".
          </Banner>
        ) : null}

        <Text style={typography.muted}>Versión {VERSION_POLITICA}</Text>
        <Text style={typography.body}>{texto.presentacion}</Text>

        {texto.secciones.map((seccion) => (
          <View key={seccion.titulo} style={styles.seccion}>
            <Text style={typography.sectionTitle}>{seccion.titulo}</Text>
            {seccion.bloques.map((bloque, i) => (
              <View key={bloque.subtitulo ?? i} style={styles.seccion}>
                {bloque.subtitulo ? (
                  <Text style={[typography.overline, styles.subtitulo]}>{bloque.subtitulo}</Text>
                ) : null}
                {bloque.puntos.map((punto) => (
                  <Punto key={punto}>{punto}</Punto>
                ))}
              </View>
            ))}
          </View>
        ))}

        <Card style={styles.tarjeta}>
          <Text style={typography.sectionTitle}>{texto.verLoQueGuardamos.titulo}</Text>
          {texto.verLoQueGuardamos.parrafos.map((p) => (
            <Text key={p} style={typography.muted}>
              {p}
            </Text>
          ))}
          {errorDatos ? <Banner tone="error">{errorDatos}</Banner> : null}
          <Button title={datos ? 'Actualizar' : 'Ver mis datos'} onPress={() => void descargar()} loading={cargando} />
          {datos ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => void copiar()}>
                <Text style={styles.enlace}>{copiado ? 'Copiado' : 'Copiar todo'}</Text>
              </Pressable>
              {/* Dos ScrollView anidados, uno por eje: el JSON es largo Y ancho.
                  `nestedScrollEnabled` hace falta por estar dentro del ScrollView
                  de la pantalla: sin el, en Android el de dentro no scrollea. */}
              <ScrollView style={styles.caja} nestedScrollEnabled>
                <ScrollView horizontal>
                  <Text style={styles.json} selectable>
                    {datos}
                  </Text>
                </ScrollView>
              </ScrollView>
            </>
          ) : null}
        </Card>

        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Punto({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.punto}>
      <View style={styles.bolita} />
      <Text style={[typography.body, styles.puntoTexto]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  seccion: { gap: space.xs },
  subtitulo: { marginTop: space.sm },
  punto: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  bolita: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.beerDark,
    marginTop: 8,
  },
  puntoTexto: { flex: 1 },
  tarjeta: { gap: space.sm },
  enlace: { fontSize: 14, fontWeight: '700', color: colors.beerDark },
  caja: {
    maxHeight: 280,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paperDeep,
  },
  json: { fontFamily: 'monospace', fontSize: 12, color: colors.inkSoft },
});

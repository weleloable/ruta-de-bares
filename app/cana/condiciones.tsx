import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/ui';
import { CONSENTIMIENTO_VERSION } from '../../src/features/match/reglas';
import { colors, radius, space, typography } from '../../src/lib/theme';

/**
 * Cómo funciona La Caña, paso a paso, y qué normas tiene. Es la pantalla a la
 * que apunta el consentimiento que guarda match_activate, y por eso lleva su
 * version a la vista (0010).
 *
 * Lo que NO va aqui, a proposito: que dato se guarda y quien lo ve. Eso es
 * politica de privacidad, y vivia mezclado con la mecanica hasta que se separo
 * en dos pantallas (privacidad.tsx tiene la seccion "La Caña"). Aqui solo se
 * explica el mecanismo (D5-D8 y D12 de docs/TIRATE-UNA-CANA.md) y las normas de
 * convivencia; el enlace de abajo lleva a la parte de datos.
 */
export default function CondicionesCana() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Cómo funciona La Caña' }} />
      <ScrollView contentContainerStyle={styles.cuerpo}>
        <Text style={typography.muted}>Versión {CONSENTIMIENTO_VERSION}</Text>

        <Seccion titulo="Es voluntario y se puede parar">
          <Punto>Activarlo es decisión tuya y puedes desactivarlo cuando quieras: dejas de aparecer y tus chats se guardan para cuando vuelvas.</Punto>
          <Punto>Si prefieres no dejar rastro, puedes borrar tu cuenta entera desde Mi perfil &gt; Borrar Cuenta.</Punto>
          <Punto>Es solo para mayores de edad.</Punto>
        </Seccion>

        <Seccion titulo="Cómo funciona, paso a paso">
          <Punto>Ves las fichas de quien más, en tu ruta, también tenga La Caña activada: foto, frase y etiquetas.</Punto>
          <Punto>Le das Me gusta a quien te interese. Abrir una ficha sin darle Me gusta la deja como Visto.</Punto>
          <Punto>Si esa persona también te lo ha dado a ti, se abre una conexión.</Punto>
          <Punto>En la conexión podéis preguntaros: "¿Te tomas una cerveza conmigo?". Se responde Sí, No, o "Pregúntamelo dentro de un rato".</Punto>
          <Punto>Tras el Sí, cada uno manda un único mensaje. A partir de ahí, quedáis por vuestra cuenta.</Punto>
        </Seccion>

        <Seccion titulo="Lo que no se puede hacer">
          <Punto>Está prohibido usar una foto que no sea tuya, ni de otra persona sin su permiso.</Punto>
          <Punto>Está prohibido subir contenido sexual.</Punto>
          <Punto>Está prohibido insistir a quien no te responde, insultar o acosar, dentro o fuera de la app.</Punto>
          <Punto>Está prohibido hacerte pasar por otra persona.</Punto>
          <Punto>Está prohibido estar aquí siendo menor de edad.</Punto>
        </Seccion>

        <Seccion titulo="Qué pasa si alguien lo incumple">
          <Punto>Cualquiera puede bloquear y denunciar desde la ficha o desde el chat.</Punto>
          <Punto>Quien organiza la ruta puede retirar una foto o desactivarle La Caña a esa persona.</Punto>
          <Punto>Bloquear cierra la conexión y borra el chat, y la otra persona deja de verte en la ruta.</Punto>
        </Seccion>

        <Text style={typography.muted}>
          Qué dato se guarda de cada cosa y quién puede verlo está en la política de privacidad, no aquí.
        </Text>
        <Button
          title="Cómo tratamos tus datos"
          variant="secondary"
          onPress={() => router.push('/privacidad')}
        />
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={styles.seccion}>
      <Text style={typography.sectionTitle}>{titulo}</Text>
      {children}
    </View>
  );
}

function Punto({ children }: { children: string }) {
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
  seccion: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  punto: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  bolita: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.beer, marginTop: 8 },
  puntoTexto: { flex: 1 },
});

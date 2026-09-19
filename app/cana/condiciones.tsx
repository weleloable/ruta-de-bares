import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/ui';
import { CONSENTIMIENTO_VERSION } from '../../src/features/match/reglas';
import { colors, radius, space, typography } from '../../src/lib/theme';

/**
 * Lo que se acepta al activar la cana: que se recoge, quien lo ve y que no se
 * puede hacer. Es la pantalla a la que apunta el consentimiento que guarda
 * match_activate, y por eso lleva su version a la vista (0010).
 *
 * PENDIENTE: la politica de privacidad general de la app (quien responde de
 * los datos y como ejercer los derechos) no existe todavia, porque falta
 * decidir quien es el responsable del tratamiento. Cuando exista, se enlaza
 * desde aqui y se sube CONSENTIMIENTO_VERSION.
 */
export default function CondicionesCana() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Cómo funciona la caña' }} />
      <ScrollView contentContainerStyle={styles.cuerpo}>
        <Text style={typography.muted}>Versión {CONSENTIMIENTO_VERSION}</Text>

        <Seccion titulo="Es voluntario y se puede parar">
          <Punto>Activarlo es decisión tuya y puedes desactivarlo cuando quieras: dejas de aparecer y tus chats se guardan para cuando vuelvas.</Punto>
          <Punto>Si prefieres no dejar rastro, puedes borrar todos tus datos de la caña desde "Mis datos".</Punto>
          <Punto>Es solo para mayores de edad.</Punto>
        </Seccion>

        <Seccion titulo="Qué se recoge mientras lo tengas activado">
          <Punto>Tu frase de presentación y las etiquetas que elijas.</Punto>
          <Punto>A quién le das Me gusta y de quién abres la ficha.</Punto>
          <Punto>Con quién conectas y cuándo.</Punto>
          <Punto>La pregunta de la cerveza, su respuesta y el mensaje que escribas después.</Punto>
          <Punto>Cuándo abres cada chat, para poder enseñarte lo que tienes sin leer.</Punto>
        </Seccion>

        <Seccion titulo="Quién ve cada cosa">
          <Punto>Tu nombre, tu foto, tu frase y tus etiquetas: las personas de tu ruta que también lo tengan activado.</Punto>
          <Punto>A quién das Me gusta y qué fichas abres: nadie. Solo se sabe que hay conexión cuando el Me gusta es mutuo.</Punto>
          <Punto>Los chats: nadie más que vosotros dos. Quien organiza la ruta tampoco puede leerlos.</Punto>
          <Punto>Si denuncias a alguien, lo que esa persona te escribió viaja con la denuncia para que se pueda revisar.</Punto>
        </Seccion>

        <Seccion titulo="Lo que no se puede hacer">
          <Punto>Usar una foto que no sea tuya, ni de otra persona sin su permiso.</Punto>
          <Punto>Subir contenido sexual.</Punto>
          <Punto>Insistir a quien no te responde, insultar o acosar, dentro o fuera de la app.</Punto>
          <Punto>Hacerte pasar por otra persona.</Punto>
          <Punto>Estar aquí siendo menor de edad.</Punto>
        </Seccion>

        <Seccion titulo="Qué pasa si alguien lo incumple">
          <Punto>Cualquiera puede bloquear y denunciar desde la ficha o desde el chat.</Punto>
          <Punto>Quien organiza la ruta puede retirar una foto o desactivarle la caña a esa persona.</Punto>
          <Punto>Bloquear cierra la conexión y borra el chat, y la otra persona deja de verte en la ruta.</Punto>
        </Seccion>

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

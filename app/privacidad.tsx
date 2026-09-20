import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button } from '../src/components/ui';
import {
  CORREO_PRIVACIDAD,
  DIAS_CONSERVACION,
  PENDIENTE,
  RESPONSABLE,
  VERSION_POLITICA,
} from '../src/features/legal/responsable';
import { colors, radius, space, typography } from '../src/lib/theme';

/**
 * Que datos se recogen, quien responde de ellos y como ejercer tus derechos.
 *
 * Existe porque el art. 13 del RGPD obliga a dar esta informacion **en el
 * momento de recoger los datos**, no despues: por eso se enlaza desde el
 * registro y desde el canje de una invitacion, que es donde se recogen.
 *
 * El responsable y el correo son PROVISIONALES (ver `legal/responsable.ts`).
 * Mientras lo sean, la pantalla lo dice arriba del todo: una politica con
 * huecos publicada en silencio promete cosas que nadie se ha comprometido a
 * cumplir.
 */
export default function Privacidad() {
  const router = useRouter();

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

        <Seccion titulo="Quién responde de tus datos">
          <Punto>{RESPONSABLE}.</Punto>
          <Punto>Para cualquier cosa sobre tus datos: {CORREO_PRIVACIDAD}.</Punto>
          <Punto>
            Si tienes cuenta, es más rápido desde Mi perfil {'>'} Escribir a la organización, porque queda registrado
            junto a tu cuenta.
          </Punto>
        </Seccion>

        <Seccion titulo="Qué se recoge, y para qué">
          <Punto>Tu correo y tu contraseña: para que puedas entrar. La contraseña no la vemos, la guarda Supabase cifrada.</Punto>
          <Punto>Tu nombre visible y tu foto: para que la gente de tu ruta te reconozca.</Punto>
          <Punto>
            Dónde estabas al sellar un bar (coordenadas y hora): es lo que permite comprobar que estabas allí de
            verdad. Sin eso, sellar no significa nada.
          </Punto>
          <Punto>A qué rutas perteneces y qué bares has sellado.</Punto>
          <Punto>Si activas Tírate una caña, lo que cuenta su propia pantalla de condiciones.</Punto>
          <Punto>Las denuncias que pongas o que se pongan sobre ti, y lo que se decida.</Punto>
        </Seccion>

        <Seccion titulo="Quién lo ve">
          <Punto>Tu nombre y tu foto: la gente de tus rutas.</Punto>
          <Punto>Tus sellos y dónde estabas: solo tú y quien organiza la ruta.</Punto>
          <Punto>Tus chats de la caña: solo las dos personas. Quien organiza tampoco puede leerlos.</Punto>
          <Punto>
            No se vende ni se cede a terceros. Los únicos que tocan los datos por encargo nuestro son Supabase (base de
            datos y almacenamiento) y GitHub Pages (la web).
          </Punto>
        </Seccion>

        <Seccion titulo="Cuánto tiempo">
          <Punto>Lo de un evento se borra a los {DIAS_CONSERVACION} días de celebrarse.</Punto>
          <Punto>Tu cuenta, mientras la quieras: puedes borrarla desde Mi perfil.</Punto>
          <Punto>
            El registro de moderación (denuncias y decisiones) se conserva aunque borres tu cuenta. Si desapareciera,
            una sanción se esquivaría borrándose la cuenta.
          </Punto>
        </Seccion>

        <Seccion titulo="Si te sancionamos, guardamos una huella de tu correo">
          <Punto>
            Cuando se veta a alguien de una ruta, se le desactiva la caña o se le suspende la cuenta, se guarda una
            huella cifrada de su correo. No es el correo: no se puede leer, no dice quién eres y no sirve para buscarte.
          </Punto>
          <Punto>
            Está solo por motivos legales, por si hay una denuncia, y para que una sanción no se salte borrándose la
            cuenta y volviendo a registrarse con el mismo correo. Es decir: para que el servicio sea seguro para el
            resto.
          </Punto>
          <Punto>
            Jamás se comparte con nadie, y se borra en cuanto se levanta la sanción o se purgan los datos del evento.
          </Punto>
          <Punto>Sale en tu descarga de datos, en Mi perfil {'>'} Mis datos, como todo lo demás.</Punto>
        </Seccion>

        <Seccion titulo="Qué puedes hacer">
          <Punto>Descargar todo lo tuyo: Mi perfil {'>'} Mis datos.</Punto>
          <Punto>Borrar tu cuenta y todos tus datos: Mi perfil {'>'} Borrar Cuenta.</Punto>
          <Punto>
            Reclamar una decisión: dentro del aviso, en Mi perfil {'>'} Avisos. Tienes seis meses desde que se toma.
          </Punto>
          <Punto>
            Corregir algo que esté mal, oponerte a un tratamiento o pedir que se limite: escríbenos y te contestamos.
          </Punto>
          <Punto>
            Si no te convence nuestra respuesta, puedes reclamar ante la Agencia Española de Protección de Datos
            (aepd.es).
          </Punto>
        </Seccion>

        <Seccion titulo="Lo que todavía no está cerrado">
          <Punto>
            Que seas mayor de edad se comprueba con una casilla que marcas tú. No lo verificamos, y conviene que lo
            sepas.
          </Punto>
          <Punto>
            Si ves algo que no debería estar en la app y no tienes cuenta, escribe a {CORREO_PRIVACIDAD}: no hace falta
            registrarse para avisarnos.
          </Punto>
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
  punto: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  bolita: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.beerDark,
    marginTop: 8,
  },
  puntoTexto: { flex: 1 },
});

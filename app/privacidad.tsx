import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card } from '../src/components/ui';
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
 * momento de recoger los datos**, no despues: por eso se enlaza desde el
 * registro y desde el canje de una invitacion, que es donde se recogen.
 *
 * "Que se recoge", "para que" y "quien lo ve" van en UNA sola seccion, dato
 * por dato, y no en tres separadas (asi estaba al principio): separarlas deja
 * un hueco entre leer "se guarda tu Me gusta" y leer, mucho despues, "pero no
 * lo ve nadie". La parte de La Caña iba ademas en su propia seccion aparte;
 * ahora es "Ademas, si activas La Caña" dentro de esta misma.
 *
 * Vivia parcialmente mezclada con la mecanica en cana/condiciones.tsx (que
 * hablaba de datos donde deberia hablar solo de como funciona). Esa pantalla
 * enlaza aqui para la parte de datos; esta YA NO enlaza a esa, porque el hueco
 * que ocupaba ese boton ahora lo tiene "Ver lo que guardamos" (antes una
 * pantalla aparte, `app/mis-datos.tsx`, hoy borrada: un solo sitio para leer
 * la politica Y descargar, no dos pantallas casi iguales).
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

        <Seccion titulo="Quién responde de tus datos">
          <Punto>{RESPONSABLE}.</Punto>
          <Punto>Para cualquier cosa sobre tus datos: {CORREO_PRIVACIDAD}.</Punto>
          <Punto>
            Si tienes cuenta, es más rápido desde Mi perfil {'>'} Escribir a la organización, porque queda registrado
            junto a tu cuenta.
          </Punto>
        </Seccion>

        <Seccion titulo="Qué se recoge, para qué y quién puede verlo">
          <Punto>Tu correo y tu contraseña: para que puedas entrar. La contraseña no la vemos, se guarda cifrada.</Punto>
          <Punto>
            Tu nombre visible y tu foto: para que la gente de tus rutas te reconozca. Las ven ellas, nadie más.
          </Punto>
          <Punto>
            Dónde estabas al sellar un bar (coordenadas y hora): es lo que permite comprobar que estabas allí de
            verdad. Sin eso, sellar no significa nada. Lo ven solo tú y quien organiza la ruta.
          </Punto>
          <Punto>A qué rutas perteneces y qué bares has sellado: lo ve quien organiza esa ruta.</Punto>
          <Punto>
            No se vende ni se cede a terceros. Los únicos que tocan los datos por encargo nuestro son Supabase (base de
            datos y almacenamiento) y GitHub Pages (la web).
          </Punto>

          <Text style={[typography.overline, styles.subtitulo]}>Además, si activas La Caña</Text>
          <Punto>
            Tu frase de presentación, tu foto y tus etiquetas las ve la gente de tu ruta que también tenga La Caña
            activada.
          </Punto>
          <Punto>
            A quién le das Me gusta y de quién abres la ficha es privado: no lo ve nadie, ni la otra persona ni quien
            organiza la ruta. Se guarda solo para que el emparejamiento funcione — si los dos os dais Me gusta, ahí sí
            se abre la conexión.
          </Punto>
          <Punto>Con quién conectas y cuándo lo sabéis los dos, nadie más.</Punto>
          <Punto>
            La pregunta de la cerveza, su respuesta y el mensaje que escribas después solo los ve la otra persona del
            chat. Quien organiza la ruta no puede leerlo.
          </Punto>
          <Punto>Cuándo abres cada chat se guarda para enseñarte a ti lo que tienes sin leer; no se le enseña a nadie.</Punto>
          <Punto>
            Si denuncias a alguien, lo que esa persona te escribió viaja con la denuncia para que quien organiza la
            ruta pueda revisarlo.
          </Punto>
          <Punto>Puedes desactivarla cuando quieras sin borrar tu cuenta: se guarda todo tal cual para cuando vuelvas.</Punto>
        </Seccion>

        <Seccion titulo="Si te sancionamos, guardamos una huella de tu correo">
          <Punto>
            Cuando se veta a alguien de una ruta, se le desactiva La Caña o se le suspende la cuenta, se guarda una
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
          <Punto>Sale en tu descarga de datos, aquí abajo en "Ver lo que guardamos", como todo lo demás.</Punto>
        </Seccion>

        <Seccion titulo="Cuánto tiempo">
          <Punto>
            Un máximo de {DIAS_CONSERVACION} días tras la celebración del evento. (Aunque, idealmente, lo borraremos
            todo a las 24h)
          </Punto>
          <Punto>Puedes borrar tu cuenta junto con todos tus datos en cualquier momento desde Mi perfil.</Punto>
          <Punto>
            El registro de moderación (denuncias y decisiones) se conserva aunque borres tu cuenta. Si desapareciera,
            una sanción se esquivaría borrándose la cuenta.
          </Punto>
        </Seccion>

        <Seccion titulo="Qué puedes hacer">
          <Punto>Descargar todo lo tuyo: aquí abajo, en "Ver lo que guardamos".</Punto>
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

        {/*
          Aqui vivia el boton "Cómo funciona La Caña" (enlazaba a
          cana/condiciones.tsx). En su lugar, el recuadro de descarga que antes
          era la pantalla aparte app/mis-datos.tsx: leer la politica y
          descargar tus datos, en el mismo sitio.
        */}
        <Card style={styles.tarjeta}>
          <Text style={typography.sectionTitle}>Ver lo que guardamos</Text>
          <Text style={typography.muted}>
            Todo: tu cuenta y tu correo, las rutas en las que estás, tus sellos con la hora y el sitio, las fotos que
            enviaste a revisión, lo que se ha decidido sobre tu cuenta y por qué, y lo de La Caña (perfil, Me gusta y
            Vistos, conexiones y los mensajes que escribiste tú).
          </Text>
          <Text style={typography.muted}>
            No salen los mensajes de la otra persona, que son suyos, ni el texto de una denuncia sobre ti que siga sin
            resolver: eso llevaría el nombre de quien la puso. Lo que se decidió sí sale, y es lo que necesitas para
            reclamar.
          </Text>
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

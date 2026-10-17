import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field } from '../../src/components/ui';
import { enviarAnuncio, retirarAnuncio, useEnviados } from '../../src/features/anuncios/almacenDemo';
import {
  DURACION_POR_DEFECTO,
  DURACIONES_MIN,
  hace,
  MAX_CARACTERES,
  minutosRestantes,
  textoDuracion,
  validarTexto,
  vigente,
  type DuracionMin,
} from '../../src/features/anuncios/reglas';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { DialogoConfirmar } from '../../src/features/profile/DialogoConfirmar';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { colors, space, typography } from '../../src/lib/theme';

/**
 * PROTOTIPO: mandar un anuncio a la gente de la ruta. Aun sin servidor: lo
 * enviado vive en memoria y se ve en la pestana Ruta de este mismo navegador.
 */
export default function AnuncioAdmin() {
  const { profile } = useAuth();
  const { activeRoute } = useActiveRoute();
  const enviados = useEnviados();
  const [texto, setTexto] = useState('');
  const [movil, setMovil] = useState(true);
  const [duracion, setDuracion] = useState<DuracionMin>(DURACION_POR_DEFECTO);
  const [soloAdmins, setSoloAdmins] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [hecho, setHecho] = useState(false);

  const v = validarTexto(texto);
  const restantes = MAX_CARACTERES - texto.length;
  const ahora = Date.now();
  const rutaId = activeRoute?.id;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.contenido}>
        <Card>
          <Text style={typography.sectionTitle}>Anuncio a la ruta</Text>
          <Text style={typography.muted}>
            Se ve arriba del mapa de «{activeRoute?.name ?? 'la ruta'}» durante el tiempo que elijas. Solo se puede leer:
            nadie puede contestar.
          </Text>
          <Banner tone="info">
            Versión de prueba: por ahora el anuncio solo se ve en este navegador, no le llega a nadie más.
          </Banner>
          <Field
            label="Mensaje"
            value={texto}
            onChangeText={(t) => {
              setTexto(t.slice(0, MAX_CARACTERES + 40));
              setHecho(false);
            }}
            multiline
            placeholder="Nuevo bar en 5 minutos. Descuento en vermut."
            style={styles.entrada}
            hint={`${restantes >= 0 ? restantes : 0} caracteres restantes`}
            error={restantes < 0 ? `Te pasas por ${-restantes}.` : null}
          />
          <Text style={typography.overline}>Cuánto tiempo se ve</Text>
          <View style={styles.opciones}>
            {DURACIONES_MIN.map((d) => (
              <Pressable
                key={d}
                onPress={() => setDuracion(d)}
                accessibilityRole="radio"
                accessibilityState={{ selected: duracion === d }}
                style={[styles.opcion, duracion === d && styles.opcionActiva]}
              >
                <Text style={[styles.opcionTexto, duracion === d && styles.opcionTextoActivo]}>{textoDuracion(d)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={typography.overline}>Quién lo ve</Text>
          <View style={styles.opciones}>
            {([false, true] as const).map((solo) => (
              <Pressable
                key={String(solo)}
                onPress={() => setSoloAdmins(solo)}
                accessibilityRole="radio"
                accessibilityState={{ selected: soloAdmins === solo }}
                style={[styles.opcion, soloAdmins === solo && styles.opcionActiva]}
              >
                <Text style={[styles.opcionTexto, soloAdmins === solo && styles.opcionTextoActivo]}>
                  {solo ? 'Solo admins' : 'Toda la ruta'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.fila}>
            <View style={styles.filaTexto}>
              <Text style={typography.body}>Avisar también al móvil</Text>
              <Text style={typography.muted}>Llega como notificación a quien las tenga activadas. No se puede retirar.</Text>
            </View>
            <Switch value={movil} onValueChange={setMovil} trackColor={{ true: colors.beer }} />
          </View>
          {hecho ? <Text style={styles.ok}>Enviado. Míralo en la pestaña Ruta.</Text> : null}
          <Button title="Enviar a la ruta" disabled={!v.ok} onPress={() => setConfirmando(true)} />
        </Card>

        <Card>
          <Text style={typography.sectionTitle}>Enviados</Text>
          {enviados.length === 0 ? <Text style={typography.muted}>Todavía no has enviado ninguno.</Text> : null}
          {enviados.map((a) => {
            const activo = vigente(a, ahora);
            return (
              <View key={a.id} style={styles.enviado}>
                <Text style={typography.body}>{a.texto}</Text>
                <Text style={typography.muted}>
                  {a.autor} · {a.soloAdmins ? 'solo admins' : 'toda la ruta'} · {textoDuracion(a.duracionMin)} · {hace(a, ahora)} ·{' '}
                  {a.retirado ? 'retirado' : activo ? `se ve ${minutosRestantes(a, ahora)} min más` : 'caducado'}
                </Text>
                {activo ? <Button title="Retirar" variant="secondary" onPress={() => retirarAnuncio(a.id)} /> : null}
              </View>
            );
          })}
        </Card>
      </ScrollView>

      <DialogoConfirmar
        visible={confirmando}
        titulo="¿Enviar este anuncio?"
        mensaje={`«${v.ok ? v.texto : ''}»\n\nLo verá ${soloAdmins ? 'solo los admins' : 'toda la gente'} de la ruta durante ${textoDuracion(duracion)}${movil ? ' y recibirá una notificación en el móvil' : ''}. No se puede editar; solo retirar de la pestaña.`}
        textoConfirmar="Enviar"
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() => {
          if (v.ok && rutaId) enviarAnuncio(v.texto, profile?.display_name ?? 'Admin', rutaId, { duracionMin: duracion, soloAdmins });
          setConfirmando(false);
          setTexto('');
          setHecho(true);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  contenido: { padding: space.lg, gap: space.lg },
  entrada: { minHeight: 90, textAlignVertical: 'top' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  filaTexto: { flex: 1 },
  opciones: { flexDirection: 'row', gap: space.sm },
  opcion: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  opcionActiva: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  opcionTexto: { fontWeight: '700', color: colors.ink },
  opcionTextoActivo: { color: colors.white },
  ok: { color: colors.green, fontWeight: '700' },
  enviado: { gap: space.xs, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
});

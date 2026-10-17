import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field, Loading } from '../../src/components/ui';
import { enviarAnuncio, listarEnviados, retirarAnuncio, type Enviado } from '../../src/features/anuncios/api';
import { refrescarAnuncios } from '../../src/features/anuncios/almacen';
import {
  DURACION_POR_DEFECTO,
  DURACIONES_MIN,
  hace,
  MAX_CARACTERES,
  minutosRestantes,
  textoDuracion,
  traducirErrorAnuncios,
  validarTexto,
  type DuracionMin,
} from '../../src/features/anuncios/reglas';
import { DialogoConfirmar } from '../../src/features/profile/DialogoConfirmar';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { colors, space, typography } from '../../src/lib/theme';

/**
 * Mandar un anuncio a la gente de la ruta activa (0074): texto corto, cuanto
 * tiempo se ve, a quien llega y si ademas suena en el movil. Solo para admins, y
 * lo protege el servidor (`anuncio_enviar`), no esta pantalla.
 */
export default function AnuncioAdmin() {
  const { activeRoute } = useActiveRoute();
  const rutaId = activeRoute?.id;
  const [texto, setTexto] = useState('');
  const [movil, setMovil] = useState(true);
  const [duracion, setDuracion] = useState<DuracionMin>(DURACION_POR_DEFECTO);
  const [soloAdmins, setSoloAdmins] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviados, setEnviados] = useState<Enviado[] | null>(null);
  // Hora a la que llego la lista: de ahi se cuenta "hace X min" y lo que queda.
  const [ahora, setAhora] = useState(Date.now());

  const v = validarTexto(texto);
  const restantes = MAX_CARACTERES - texto.length;

  const cargar = useCallback(async () => {
    if (!rutaId) return;
    try {
      setEnviados(await listarEnviados(rutaId));
      setAhora(Date.now());
    } catch (e) {
      setError(traducirErrorAnuncios(e instanceof Error ? e.message : ''));
    }
  }, [rutaId]);

  useEffect(() => {
    void cargar();
    // Cada medio minuto, para que "se ve N min mas" y "caducado" no se queden viejos.
    const id = setInterval(() => void cargar(), 30_000);
    return () => clearInterval(id);
  }, [cargar]);

  async function enviar() {
    if (!v.ok || !rutaId || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await enviarAnuncio(rutaId, v.texto, { duracionMin: duracion, soloAdmins, avisarMovil: movil });
      setTexto('');
      setHecho(true);
      // La tira de la pestana Ruta y la burbuja se ponen al dia ya, sin esperar al sondeo.
      void refrescarAnuncios(rutaId);
      await cargar();
    } catch (e) {
      setError(traducirErrorAnuncios(e instanceof Error ? e.message : ''));
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  async function retirar(id: string) {
    setError(null);
    try {
      await retirarAnuncio(id);
      void refrescarAnuncios(rutaId);
      await cargar();
    } catch (e) {
      setError(traducirErrorAnuncios(e instanceof Error ? e.message : ''));
    }
  }

  if (!activeRoute) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.contenido}>
          <Banner tone="info">Entra en una ruta para mandarle un anuncio.</Banner>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.contenido}>
        <Card>
          <Text style={typography.sectionTitle}>Anuncio a la ruta</Text>
          <Text style={typography.muted}>
            Se ve arriba del mapa de «{activeRoute.name}» durante el tiempo que elijas. Solo se puede leer: nadie puede
            contestar.
          </Text>
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
              <Text style={typography.muted}>
                Llega como notificación a quien tenga los avisos activados. No se puede retirar una vez enviada.
              </Text>
            </View>
            <Switch value={movil} onValueChange={setMovil} trackColor={{ true: colors.beer }} />
          </View>
          {hecho ? <Text style={styles.ok}>Enviado. Míralo en la pestaña Ruta.</Text> : null}
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Button title="Enviar a la ruta" disabled={!v.ok} onPress={() => setConfirmando(true)} />
        </Card>

        <Card>
          <Text style={typography.sectionTitle}>Enviados</Text>
          {enviados === null ? <Loading /> : null}
          {enviados?.length === 0 ? <Text style={typography.muted}>Todavía no se ha enviado ninguno a esta ruta.</Text> : null}
          {enviados?.map((a) => (
            <View key={a.id} style={styles.enviado}>
              <Text style={typography.body}>{a.texto}</Text>
              <Text style={typography.muted}>
                {a.autor} · {a.soloAdmins ? 'solo admins' : 'toda la ruta'} · {textoDuracion(a.duracionMin)} ·{' '}
                {hace(a, ahora)} ·{' '}
                {a.estado === 'retirado'
                  ? 'retirado'
                  : a.estado === 'vigente'
                    ? `se ve ${minutosRestantes(a, ahora)} min más`
                    : 'caducado'}
              </Text>
              {a.estado === 'vigente' ? <Button title="Retirar" variant="secondary" onPress={() => void retirar(a.id)} /> : null}
            </View>
          ))}
        </Card>
      </ScrollView>

      <DialogoConfirmar
        visible={confirmando}
        titulo="¿Enviar este anuncio?"
        mensaje={`«${v.ok ? v.texto : ''}»\n\nLo verá ${soloAdmins ? 'solo los admins' : 'toda la gente'} de la ruta durante ${textoDuracion(duracion)}${movil ? ' y recibirá una notificación en el móvil' : ''}. No se puede editar; solo retirar de la pestaña.`}
        textoConfirmar="Enviar"
        ocupado={enviando}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() => void enviar()}
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

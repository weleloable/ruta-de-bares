import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, Vibration, View } from 'react-native';

import { Banner, Button, Card } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, typography } from '../../lib/theme';
import { useSondeo } from '../../lib/useSondeo';
import { useActiveRoute } from '../routes/ActiveRouteProvider';
import { CASAS, esCasa, type IdCasa } from './casas';
import { AnimacionCasa } from './DescubrimientoCasa';
import { EscanerQr } from './EscanerQr';
import { useMiCasa } from './MiCasa';
import { contenidoQr, describirErrorQr, leerQr, qrUri } from './qr';

type Ultimo = { id: string; casa: string; puntos: number; con: string | null } | null;
type Celebrar = { casa: IdCasa; puntos: number; con: string | null };

/**
 * Encuentros de casa por QR (0046), en Mi perfil: ensenar tu QR (temporal, se
 * renueva solo) o escanear el de alguien de tu casa durante la ruta. Las dos
 * partes ven la celebracion: quien escanea por la respuesta, y quien ensena
 * porque su QR pregunta cada pocos segundos si alguien lo ha usado.
 */
export function QrSocial() {
  const { casa } = useMiCasa();
  const { activeRoute } = useActiveRoute();
  const [modo, setModo] = useState<'mio' | 'escanear' | null>(null);
  const [celebrar, setCelebrar] = useState<Celebrar | null>(null);
  const [cuenta, setCuenta] = useState<number | null>(null);

  const contar = useCallback(async () => {
    if (!activeRoute) return setCuenta(null);
    const { data } = await supabase.from('encuentros').select('id').eq('route_id', activeRoute.id).eq('puntua', true);
    setCuenta(data?.length ?? 0);
  }, [activeRoute]);

  useEffect(() => {
    void contar();
  }, [contar]);

  if (!casa) return null;
  const c = CASAS[casa];

  function celebrarYa(r: Celebrar) {
    setModo(null);
    setCelebrar(r);
    void contar();
    try {
      Vibration.vibrate([0, 40, 60, 40]);
    } catch {
      // Sin vibracion.
    }
  }

  return (
    <Card style={styles.tarjeta}>
      <Text style={typography.sectionTitle}>Encuentros de casa</Text>
      <Text style={typography.muted}>
        {`Durante la ruta, si alguien de ${c.nombre} escanea tu QR (o tú el suyo), vuestra casa gana puntos. Cada pareja cuenta una vez por ruta.`}
      </Text>
      {activeRoute && cuenta !== null ? (
        <Text style={styles.cuenta}>{`En ${activeRoute.name}: ${cuenta} de ${activeRoute.qr_max ?? 5} encuentros que puntúan.`}</Text>
      ) : null}
      <View style={styles.botones}>
        <View style={styles.boton}>
          <Button title="Mi QR" icon="qr-code-outline" onPress={() => setModo('mio')} />
        </View>
        <View style={styles.boton}>
          <Button
            title="Escanear"
            variant="secondary"
            icon="scan-outline"
            disabled={!activeRoute}
            onPress={() => setModo('escanear')}
          />
        </View>
      </View>
      {!activeRoute ? <Text style={styles.nota}>Para escanear tienes que estar en una ruta.</Text> : null}

      <Modal visible={modo !== null} transparent animationType="fade" onRequestClose={() => setModo(null)}>
        <View style={styles.fondo}>
          <ScrollView contentContainerStyle={styles.hoja}>
            {modo === 'mio' ? <MiQr onEncuentro={celebrarYa} /> : null}
            {modo === 'escanear' && activeRoute ? <Escanear rutaId={activeRoute.id} onEncuentro={celebrarYa} /> : null}
            <Button title="Cerrar" variant="secondary" onPress={() => setModo(null)} />
          </ScrollView>
        </View>
      </Modal>

      {celebrar ? (
        <AnimacionCasa
          casa={celebrar.casa}
          visible
          onCerrar={() => setCelebrar(null)}
          textos={{
            antes: '¡Encuentro de casa!',
            titulo: celebrar.puntos > 0 ? `+${celebrar.puntos} para ${CASAS[celebrar.casa].nombre}` : 'Encuentro apuntado',
            explica:
              celebrar.puntos > 0
                ? `${celebrar.con ? `Tú y ${celebrar.con}` : 'Los dos'} sumáis para la casa.`
                : 'Ya habíais llegado al tope de encuentros que puntúan en esta ruta.',
            boton: '¡Genial!',
          }}
        />
      ) : null}
    </Card>
  );
}

function MiQr({ onEncuentro }: { onEncuentro: (r: Celebrar) => void }) {
  const { width } = useWindowDimensions();
  const [codigo, setCodigo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El encuentro que ya habia al abrir no se celebra otra vez.
  const visto = useRef<string | null | undefined>(undefined);
  const aviso = useRef(onEncuentro);
  aviso.current = onEncuentro;

  const pedir = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('qr_mi_codigo');
    if (e) return setError(describirErrorQr(e.message));
    setError(null);
    setCodigo(data.codigo);
    const ultimo = data.ultimo as Ultimo;
    if (visto.current === undefined) {
      visto.current = ultimo?.id ?? null;
    } else if (ultimo && ultimo.id !== visto.current) {
      visto.current = ultimo.id;
      if (esCasa(ultimo.casa)) aviso.current({ casa: ultimo.casa, puntos: ultimo.puntos, con: ultimo.con });
    }
  }, []);

  useEffect(() => {
    void pedir();
  }, [pedir]);
  useSondeo(pedir, 3000);

  const lado = Math.min(280, width - space.xl * 4);
  return (
    <View style={styles.centro}>
      <Text style={typography.sectionTitle}>Tu QR</Text>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <View style={[styles.qr, { width: lado + space.md * 2 }]}>
        {codigo ? (
          <Image source={{ uri: qrUri(contenidoQr(codigo)) }} style={{ width: lado, height: lado }} accessibilityLabel="Tu código QR" />
        ) : (
          <View style={{ width: lado, height: lado }} />
        )}
      </View>
      <Text style={styles.nota}>Enséñalo a alguien de tu casa. Cambia cada minuto: una captura no sirve.</Text>
    </View>
  );
}

function Escanear({ rutaId, onEncuentro }: { rutaId: string; onEncuentro: (r: Celebrar) => void }) {
  const [intento, setIntento] = useState(0);
  const [estado, setEstado] = useState<'mirando' | 'enviando' | 'error'>('mirando');
  const [error, setError] = useState<string | null>(null);

  async function leido(texto: string) {
    const codigo = leerQr(texto);
    if (!codigo) {
      setError('Ese QR no es de RutApp.');
      setEstado('error');
      return;
    }
    setEstado('enviando');
    const { data, error: e } = await supabase.rpc('qr_escanear', { p_route_id: rutaId, p_codigo: codigo });
    if (e) {
      setError(describirErrorQr(e.message));
      setEstado('error');
      return;
    }
    if (esCasa(data.casa)) onEncuentro({ casa: data.casa, puntos: data.puntos, con: data.con });
  }

  return (
    <View style={styles.centro}>
      <Text style={typography.sectionTitle}>Escanea su QR</Text>
      {estado === 'mirando' ? (
        <View style={styles.escaner}>
          <EscanerQr key={intento} onLeido={(t) => void leido(t)} />
        </View>
      ) : null}
      {estado === 'enviando' ? <Text style={typography.muted}>Comprobando…</Text> : null}
      {estado === 'error' && error ? (
        <>
          <Banner tone="error">{error}</Banner>
          <Button
            title="Volver a escanear"
            icon="scan-outline"
            onPress={() => {
              setError(null);
              setEstado('mirando');
              setIntento((n) => n + 1);
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { gap: space.sm },
  cuenta: { fontSize: 13, fontWeight: '700', color: colors.ink },
  botones: { flexDirection: 'row', gap: space.sm },
  boton: { flex: 1 },
  nota: { fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center' },
  hoja: {
    margin: space.lg,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
  },
  centro: { alignItems: 'center', gap: space.md },
  qr: { padding: space.md, backgroundColor: colors.white, borderRadius: radius.md, alignItems: 'center' },
  escaner: { width: '100%' },
});

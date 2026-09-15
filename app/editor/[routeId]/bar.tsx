import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectorPosicion } from '../../../src/components/SelectorPosicion';
import { Banner, Button, Card, Field, Loading } from '../../../src/components/ui';
import {
  getRouteWithBars,
  nextSortOrder,
  saveBar,
} from '../../../src/features/routes/api';
import { construirVentana, formatHora } from '../../../src/features/routes/horas';
import { RADIUS_DEFAULT_M, validateBarDraft } from '../../../src/features/routes/validation';
import { getCurrentPosition } from '../../../src/features/stamps/api';
import { desdeFechaISO } from '../../../src/lib/fechas';
import { colors, space, typography } from '../../../src/lib/theme';
import type { RouteBarRow, RouteRow } from '../../../src/types/database';

/** Centro por defecto cuando no hay nada mejor: Puerta del Sol, Madrid. */
const CENTRO_POR_DEFECTO = { lat: 40.4168, lng: -3.7038 };

/**
 * Alta y edicion de un bar.
 *
 * La posicion se marca tocando el mapa o arrastrando el pin, no escribiendo
 * coordenadas: nadie sabe de memoria la latitud de su bar, y el circulo del
 * radio se ve en el sitio, que es justo lo que el admin necesita decidir. En
 * movil el mapa es Google (SelectorPosicion.tsx) y en web OpenStreetMap
 * (SelectorPosicion.web.tsx); en web ademas se pueden pegar coordenadas.
 */
export default function EditorDeBar() {
  const { routeId, barId } = useLocalSearchParams<{ routeId: string; barId?: string }>();
  const router = useRouter();

  const [ruta, setRuta] = useState<RouteRow | null>(null);
  const [bares, setBares] = useState<RouteBarRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [radio, setRadio] = useState(String(RADIUS_DEFAULT_M));
  const [abre, setAbre] = useState('19:00');
  const [cierra, setCierra] = useState('20:00');
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(null);
  // Donde arranca el mapa en un bar nuevo. Es solo el encuadre inicial, nunca
  // una posicion: un bar nuevo empieza sin pin y no se guarda hasta que el
  // admin marca el sitio. Antes se precargaba la posicion del bar anterior, o
  // Puerta del Sol si se negaba la ubicacion, y "guardar sin tocar" dejaba el
  // bar en un sitio que nadie habia elegido.
  const [centroMapa, setCentroMapa] = useState(CENTRO_POR_DEFECTO);

  const editando = typeof barId === 'string' && barId.length > 0;

  useEffect(() => {
    let activo = true;

    (async () => {
      if (!routeId) return;
      try {
        const detalle = await getRouteWithBars(routeId);
        if (!activo || !detalle) {
          if (activo) setError('Esta ruta ya no existe.');
          return;
        }
        setRuta(detalle.route);
        setBares(detalle.bars);

        const existente = editando ? detalle.bars.find((b) => b.id === barId) : undefined;
        if (existente) {
          setNombre(existente.name);
          setDireccion(existente.address);
          setNotas(existente.notes);
          setRadio(String(existente.radius_m));
          setAbre(formatHora(new Date(existente.opens_at)));
          setCierra(formatHora(new Date(existente.closes_at)));
          setPunto({ lat: existente.lat, lng: existente.lng });
          return;
        }

        // Bar nuevo: se encadena con el anterior. Hora de apertura = cierre del
        // ultimo bar, y el mapa arranca donde esta ese bar, que es donde va a
        // estar el siguiente.
        const ultimo = detalle.bars.at(-1);
        if (ultimo) {
          const cierreAnterior = new Date(ultimo.closes_at);
          setAbre(formatHora(cierreAnterior));
          setCierra(formatHora(new Date(cierreAnterior.getTime() + 60 * 60 * 1000)));
          setCentroMapa({ lat: ultimo.lat, lng: ultimo.lng });
          return;
        }

        // Primer bar de la ruta: en el movil el mapa se centra donde esta el
        // admin. En web no se pide la ubicacion al abrir la pantalla (el
        // navegador lanzaria la pregunta sin contexto): el selector tiene el
        // boton "Usar mi ubicacion" para cuando la quiera.
        if (Platform.OS !== 'web') {
          try {
            const aqui = await getCurrentPosition();
            if (activo) setCentroMapa(aqui);
          } catch {
            // Sin permiso o sin GPS: el mapa se queda en el centro por defecto.
          }
        }
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudo cargar la ruta.');
      } finally {
        if (activo) setCargando(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, [routeId, barId, editando]);

  const dia = useMemo(
    () => desdeFechaISO(ruta?.event_date ?? null) ?? new Date(),
    [ruta?.event_date],
  );

  const resultadoVentana = construirVentana(dia, abre, cierra);

  async function onGuardar() {
    if (!routeId || !punto) {
      setErrores(['Marca la posicion del bar en el mapa.']);
      return;
    }
    if (!resultadoVentana.ok) {
      setErrores([resultadoVentana.error]);
      return;
    }

    const radioNumero = Number(radio);
    const borrador = {
      name: nombre,
      address: direccion,
      lat: punto.lat,
      lng: punto.lng,
      radiusM: Number.isInteger(radioNumero) ? radioNumero : Number.NaN,
      opensAt: resultadoVentana.ventana.opensAt,
      closesAt: resultadoVentana.ventana.closesAt,
      notes: notas,
    };

    const problemas = validateBarDraft(borrador);
    setErrores(problemas);
    if (problemas.length > 0) return;

    setGuardando(true);
    setError(null);
    try {
      const existente = editando ? bares.find((b) => b.id === barId) : undefined;
      await saveBar({
        id: existente?.id,
        routeId,
        sortOrder: existente ? existente.sort_order : nextSortOrder(bares),
        name: borrador.name,
        address: borrador.address,
        lat: borrador.lat,
        lng: borrador.lng,
        radiusM: borrador.radiusM,
        opensAt: borrador.opensAt,
        closesAt: borrador.closesAt,
        notes: borrador.notes,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el bar.');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Loading label="Preparando el bar..." />;

  const radioNumero = Number(radio);
  const radioValido = Number.isInteger(radioNumero) && radioNumero >= 20 && radioNumero <= 2000;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={styles.pantalla}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
          {error ? <Banner tone="error">{error}</Banner> : null}

          <Field label="Nombre del bar" value={nombre} onChangeText={setNombre} placeholder="La Venencia" />
          <Field
            label="Direccion"
            value={direccion}
            onChangeText={setDireccion}
            placeholder="Calle de Echegaray 7"
          />

          <Card style={styles.tarjetaMapa}>
            <Text style={typography.overline}>Posicion</Text>
            <SelectorPosicion
              key={editando ? barId : 'nuevo'}
              punto={punto}
              radioM={radioValido ? radioNumero : null}
              centroInicial={centroMapa}
              onCambiar={setPunto}
            />
          </Card>

          <Field
            label="Radio para sellar (metros)"
            value={radio}
            onChangeText={setRadio}
            keyboardType="number-pad"
            hint="Entre 20 y 2000. 120 m cubre un bar y su acera."
            error={radio.length > 0 && !radioValido ? 'Tiene que ser un entero entre 20 y 2000.' : null}
          />

          <View style={styles.filaHoras}>
            <View style={styles.mitad}>
              <Field label="Se abre a las" value={abre} onChangeText={setAbre} placeholder="19:00" />
            </View>
            <View style={styles.mitad}>
              <Field label="Se cierra a las" value={cierra} onChangeText={setCierra} placeholder="20:00" />
            </View>
          </View>

          {resultadoVentana.ok && resultadoVentana.cruzaMedianoche ? (
            <Banner tone="info">
              El cierre cae en el dia siguiente. Es lo normal en la ultima parada.
            </Banner>
          ) : null}
          {!resultadoVentana.ok ? <Banner tone="error">{resultadoVentana.error}</Banner> : null}

          <Field
            label="Notas"
            value={notas}
            onChangeText={setNotas}
            placeholder="Pedir el vermut de grifo"
            multiline
          />

          {errores.map((mensaje) => (
            <Text key={mensaje} style={typography.error}>
              {mensaje}
            </Text>
          ))}

          <Button
            title={editando ? 'Guardar cambios' : 'Anadir a la ruta'}
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
  tarjetaMapa: { gap: space.sm },
  filaHoras: { flexDirection: 'row', gap: space.md },
  mitad: { flex: 1 },
});

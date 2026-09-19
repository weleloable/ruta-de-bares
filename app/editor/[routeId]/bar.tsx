import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Desplegable } from '../../../src/components/Desplegable';
import { Banner, Button, Loading } from '../../../src/components/ui';
import {
  getRouteWithBars,
  nextSortOrder,
  saveBar,
} from '../../../src/features/routes/api';
import { buscarPorNombre, idsYaEnRuta, type BarCatalogo } from '../../../src/features/routes/catalogo';
import { consumirUltimoCreado, useCatalogo } from '../../../src/features/routes/catalogoStore';
import { construirVentana, formatHora } from '../../../src/features/routes/horas';
import { CampoHora, RelojHora } from '../../../src/features/routes/RelojHora';
import { SelectorBar } from '../../../src/features/routes/SelectorBar';
import {
  opcionesDeRadio,
  RADIO_INICIAL_M,
  validateBarDraft,
} from '../../../src/features/routes/validation';
import { desdeFechaISO } from '../../../src/lib/fechas';
import { colors, space, typography } from '../../../src/lib/theme';
import type { RouteBarRow, RouteRow } from '../../../src/types/database';

/** Lo que se guardara del bar: viene del catalogo, o de la fila si se edita un bar anterior a el. */
type BarElegido = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

function desdeCatalogo(bar: BarCatalogo): BarElegido {
  // address vacia: el plus code del catalogo es un dato interno y no se guarda
  // como direccion (ver direccionVisible en catalogo.ts).
  return { name: bar.name, address: '', lat: bar.lat, lng: bar.lng };
}

/**
 * Alta y edicion de un bar de la ruta.
 *
 * El bar se ELIGE de una lista predefinida (features/routes/catalogo.ts), que ya
 * trae nombre, posicion y logo. Lo que se decide aqui es el radio de sellado
 * (desplegable) y el horario de esa parada (reloj): escribir coordenadas o
 * marcar el mapa a mano daba bares mal colocados y el mismo bar con tres
 * nombres distintos.
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

  const [elegido, setElegido] = useState<BarElegido | null>(null);
  const [radio, setRadio] = useState<number>(RADIO_INICIAL_M);
  const [abre, setAbre] = useState('19:00');
  const [cierra, setCierra] = useState('20:00');
  // Que hora esta editando el reloj (solo hay un reloj abierto a la vez).
  const [horaActiva, setHoraActiva] = useState<'abre' | 'cierra' | null>(null);

  const editando = typeof barId === 'string' && barId.length > 0;

  // Lista cerrada + bares propios de este dispositivo (catalogoStore.ts).
  const catalogo = useCatalogo();

  // Al volver de crear un bar propio se deja elegido, para que el admin solo
  // tenga que ponerle radio y horas. Se hace al ganar el foco y no en la
  // pantalla nueva porque esta sigue montada debajo y conserva lo ya rellenado.
  useFocusEffect(
    useCallback(() => {
      const id = consumirUltimoCreado();
      if (!id) return;
      const nuevo = catalogo.find((bar) => bar.id === id);
      if (nuevo) {
        setElegido(desdeCatalogo(nuevo));
        setErrores([]);
      }
    }, [catalogo]),
  );

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
          setElegido({
            name: existente.name,
            address: existente.address,
            lat: existente.lat,
            lng: existente.lng,
          });
          setRadio(existente.radius_m);
          setAbre(formatHora(new Date(existente.opens_at)));
          setCierra(formatHora(new Date(existente.closes_at)));
          return;
        }

        // Bar nuevo: se encadena con el anterior. Hora de apertura = cierre del
        // ultimo bar de la ruta.
        const ultimo = detalle.bars.at(-1);
        if (ultimo) {
          const cierreAnterior = new Date(ultimo.closes_at);
          setAbre(formatHora(cierreAnterior));
          setCierra(formatHora(new Date(cierreAnterior.getTime() + 60 * 60 * 1000)));
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
    if (!routeId || !elegido) {
      setErrores(['Elige un bar de la lista.']);
      return;
    }
    if (!resultadoVentana.ok) {
      setErrores([resultadoVentana.error]);
      return;
    }

    const existente = editando ? bares.find((b) => b.id === barId) : undefined;
    const borrador = {
      name: elegido.name,
      address: elegido.address,
      lat: elegido.lat,
      lng: elegido.lng,
      radiusM: radio,
      opensAt: resultadoVentana.ventana.opensAt,
      closesAt: resultadoVentana.ventana.closesAt,
      // El formulario ya no tiene campo de notas. Las que tuviera el bar se
      // conservan mientras siga siendo el mismo bar; si se cambia por otro,
      // hablaban del anterior y no se arrastran.
      notes: existente && existente.name === elegido.name ? existente.notes : '',
    };

    const problemas = validateBarDraft(borrador);
    setErrores(problemas);
    if (problemas.length > 0) return;

    setGuardando(true);
    setError(null);
    try {
      await saveBar({
        id: existente?.id,
        routeId,
        sortOrder: existente ? existente.sort_order : nextSortOrder(bares),
        ...borrador,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el bar.');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Loading label="Preparando el bar..." />;

  const ocupados = idsYaEnRuta(bares, editando ? barId : undefined, catalogo);

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={styles.pantalla}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
          {error ? <Banner tone="error">{error}</Banner> : null}

          <View style={styles.bloque}>
            <Text style={typography.overline}>Bar</Text>
            <SelectorBar
              opciones={catalogo}
              elegido={elegido}
              // Por nombre y no por un id guardado: un bar que ya estaba en la ruta
              // se reconoce igual, y un propio tambien aunque el almacen cargue tarde.
              seleccionadoId={elegido ? (buscarPorNombre(elegido.name, catalogo)?.id ?? null) : null}
              ocupados={ocupados}
              onElegir={(bar) => {
                setElegido(desdeCatalogo(bar));
                setErrores([]);
              }}
              onNuevo={() => router.push({ pathname: '/editor/[routeId]/bar-nuevo', params: { routeId } })}
            />
          </View>

          <Desplegable
            etiqueta="Radio para sellar"
            opciones={opcionesDeRadio(radio).map((metros) => ({ valor: metros, etiqueta: `${metros} m` }))}
            valor={radio}
            onCambiar={setRadio}
          />

          <View style={styles.filaHoras}>
            <CampoHora
              etiqueta="Se abre a las"
              valor={abre}
              activo={horaActiva === 'abre'}
              onPress={() => setHoraActiva(horaActiva === 'abre' ? null : 'abre')}
            />
            <CampoHora
              etiqueta="Se cierra a las"
              valor={cierra}
              activo={horaActiva === 'cierra'}
              onPress={() => setHoraActiva(horaActiva === 'cierra' ? null : 'cierra')}
            />
          </View>

          {horaActiva ? (
            <RelojHora
              key={horaActiva}
              titulo={horaActiva === 'abre' ? 'Hora de apertura' : 'Hora de cierre'}
              valor={horaActiva === 'abre' ? abre : cierra}
              onCambiar={horaActiva === 'abre' ? setAbre : setCierra}
              onListo={() => setHoraActiva(null)}
            />
          ) : null}

          {resultadoVentana.ok && resultadoVentana.cruzaMedianoche ? (
            <Banner tone="info">
              El cierre cae en el dia siguiente. Es lo normal en la ultima parada.
            </Banner>
          ) : null}
          {!resultadoVentana.ok ? <Banner tone="error">{resultadoVentana.error}</Banner> : null}

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
  bloque: { gap: space.sm },
  filaHoras: { flexDirection: 'row', gap: space.md },
});

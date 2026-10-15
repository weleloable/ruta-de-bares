import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Desplegable } from '../../../src/components/Desplegable';
import { Banner, Button, Loading } from '../../../src/components/ui';
import {
  aplicarMargenATodas,
  getRouteWithBars,
  nextSortOrder,
  saveBar,
} from '../../../src/features/routes/api';
import { etiquetaMargen, OPCIONES_MARGEN } from '../../../src/features/stamps/margen';
import { buscarPorNombre, idsYaEnRuta, type BarCatalogo } from '../../../src/features/routes/catalogo';
import { consumirUltimoCreado, reintentarCatalogo, useCatalogo } from '../../../src/features/routes/catalogoStore';
import { construirVentana, formatHora } from '../../../src/features/routes/horas';
import { CampoHora, RelojHora } from '../../../src/features/routes/RelojHora';
import { SelectorBar } from '../../../src/features/routes/SelectorBar';
import { SelectorTipoParada } from '../../../src/features/routes/SelectorTipoParada';
import { tipoDe, type TipoParada } from '../../../src/features/routes/tipoParada';
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
  /** Se copia a la parada: es lo unico que ven los jugadores de un bar propio (0035). */
  logo: string | null;
};

function desdeCatalogo(bar: BarCatalogo): BarElegido {
  // address vacia: el plus code del catalogo es un dato interno y no se guarda
  // como direccion (ver direccionVisible en catalogo.ts).
  return { name: bar.name, address: '', lat: bar.lat, lng: bar.lng, logo: bar.logoUri ?? null };
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
  const [tipo, setTipo] = useState<TipoParada>('bar');
  const [margen, setMargen] = useState<number>(0);
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Lo que era al abrir el editor: si era un bar y deja de serlo, se avisa de lo que se pierde.
  const [tipoOriginal, setTipoOriginal] = useState<TipoParada>('bar');
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
            logo: existente.logo,
          });
          setRadio(existente.radius_m);
          setTipo(tipoDe(existente));
          setMargen(existente.margen_min ?? 0);
          setTipoOriginal(tipoDe(existente));
          setAbre(formatHora(new Date(existente.opens_at)));
          setCierra(formatHora(new Date(existente.closes_at)));
          return;
        }

        // Bar nuevo: se encadena con el anterior. Hora de apertura = cierre del
        // ultimo bar de la ruta, y el mismo margen de sellado.
        const ultimo = detalle.bars.at(-1);
        if (ultimo) {
          setMargen(ultimo.margen_min ?? 0);
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
      logo: elegido.logo,
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
        tipo,
        margenMin: margen,
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

  const barDelCatalogo = elegido ? buscarPorNombre(elegido.name, catalogo) : undefined;
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
              onReintentar={reintentarCatalogo}
              onNuevo={() => router.push({ pathname: '/editor/[routeId]/bar-nuevo', params: { routeId } })}
            />
            {/* Solo si el bar esta en la lista compartida: los de antes del catalogo no tienen donde corregirse. */}
            {barDelCatalogo ? (
              <Button
                title="Corregir ubicación o imagen de este bar"
                variant="ghost"
                onPress={() => router.push({ pathname: '/editor/[routeId]/bar-nuevo', params: { routeId, catalogoId: barDelCatalogo.id } })}
              />
            ) : null}
          </View>

          <SelectorTipoParada
            valor={tipo}
            onCambiar={setTipo}
            avisoPerdida={editando && tipoOriginal === 'bar' && tipo !== 'bar'}
          />

          <Desplegable
            etiqueta={tipo === 'bar' ? 'Radio para sellar' : 'Radio de la zona'}
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

          <Desplegable
            etiqueta="Margen extra de sellado"
            opciones={OPCIONES_MARGEN.map((m) => ({ valor: m, etiqueta: etiquetaMargen(m) }))}
            valor={margen}
            onCambiar={(m) => {
              setMargen(m);
              setAviso(null);
            }}
          />
          <Text style={typography.muted}>
            {margen > 0 && resultadoVentana.ok
              ? `Se podrá sellar de ${formatHora(new Date(resultadoVentana.ventana.opensAt.getTime() - margen * 60000))} a ${formatHora(new Date(resultadoVentana.ventana.closesAt.getTime() + margen * 60000))}. En el mapa sigue saliendo el horario oficial.`
              : 'Minutos que se puede sellar antes de abrir y después de cerrar, por si los horarios se mueven.'}
          </Text>
          {routeId && bares.length > 0 ? (
            <Button
              title={`Aplicar ${etiquetaMargen(margen).toLowerCase()} a todas las paradas`}
              variant="ghost"
              loading={aplicando}
              onPress={async () => {
                setAplicando(true);
                setError(null);
                try {
                  await aplicarMargenATodas(routeId, margen);
                  setBares((bs) => bs.map((b) => ({ ...b, margen_min: margen })));
                  setAviso(`Hecho: ${etiquetaMargen(margen).toLowerCase()} en todas las paradas de la ruta.`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'No se pudo aplicar el margen.');
                } finally {
                  setAplicando(false);
                }
              }}
            />
          ) : null}
          {aviso ? <Banner tone="success">{aviso}</Banner> : null}

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

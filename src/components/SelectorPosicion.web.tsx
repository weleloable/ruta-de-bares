import type * as L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';

import { describirPunto, estadoCampoCoordenadas, formatCoordenadas, puntoDesdeMapa } from '../lib/coordenadas';
import { ZOOM_PARADA } from '../lib/encuadre';
import {
  ICONO_POSICION,
  LIMITES_MUNDO,
  OSM_ATRIBUCION,
  OSM_MAX_ZOOM,
  OSM_TILES,
  asegurarEstilosMapa,
  observarTamano,
} from '../lib/mapaWeb';
import { colors, radius, typography } from '../lib/theme';
import type { SelectorPosicionProps } from './SelectorPosicion.types';
import { Button, Field } from './ui';

const AYUDA =
  'Tambien puedes pegar coordenadas: en Google Maps, clic derecho sobre el bar y pulsa las coordenadas para copiarlas.';

/** Por debajo de este zoom el mundo cabe varias veces y aparecen copias. */
const ZOOM_MINIMO = 3;

function ClicEnMapa({ onClic }: { onClic(lat: number, lng: number): void }) {
  useMapEvents({
    click(evento) {
      onClic(evento.latlng.lat, evento.latlng.lng);
    },
  });
  return null;
}

/**
 * Variante web del selector de posicion: mapa de OpenStreetMap donde se toca o
 * se arrastra el pin, con el circulo del radio de sellado, igual que en el
 * movil. Se conserva el campo de coordenadas para pegar las de Google Maps.
 *
 * El campo de texto manda: todo punto (toque, arrastre o GPS) se escribe en el
 * campo y lo que se guarda es lo que resulta de leer ese texto, o null si no
 * es valido (ver puntoDesdeMapa en src/lib/coordenadas.ts). Asi mapa, campo y
 * valor guardado no pueden contradecirse. El mapa no deja salir del mundo ni
 * alejarse hasta ver copias, asi que el pin aparece donde se toco.
 *
 * El texto inicial sale de `punto` al montar; la pantalla monta esto tras
 * cargar el bar y le da un `key` por bar, asi que no hace falta resincronizar.
 */
export function SelectorPosicion({ punto, radioM, centroInicial, onCambiar }: SelectorPosicionProps) {
  const [texto, setTexto] = useState(punto ? formatCoordenadas(punto) : '');
  const [mapa, setMapa] = useState<L.Map | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [avisoUbicacion, setAvisoUbicacion] = useState<string | null>(null);
  // Sube con cada eleccion a mano. Si el GPS responde tarde (con posicion o con
  // error) y el admin ya ha marcado otro punto, la respuesta se descarta.
  const elecciones = useRef(0);
  const estado = estadoCampoCoordenadas(texto);

  useEffect(asegurarEstilosMapa, []);
  useEffect(() => (mapa ? observarTamano(mapa) : undefined), [mapa]);

  function fijarDesdeMapa(lat: number, lng: number, centrar: boolean) {
    const resultado = puntoDesdeMapa(lat, lng);
    setTexto(resultado.texto);
    setAvisoUbicacion(null);
    onCambiar(resultado.punto);
    if (centrar && mapa && resultado.punto) {
      const { lat: la, lng: lo } = resultado.punto;
      mapa.flyTo([la, lo], Math.max(mapa.getZoom(), ZOOM_PARADA), { duration: 0.35 });
    }
  }

  function elegirEnMapa(lat: number, lng: number) {
    elecciones.current += 1;
    fijarDesdeMapa(lat, lng, false);
  }

  function onCambiarTexto(nuevo: string) {
    elecciones.current += 1;
    setTexto(nuevo);
    setAvisoUbicacion(null);
    const leido = estadoCampoCoordenadas(nuevo).punto;
    onCambiar(leido);
    if (leido && mapa) mapa.panTo([leido.lat, leido.lng]);
  }

  function usarMiUbicacion() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setAvisoUbicacion('Este navegador no da la ubicacion.');
      return;
    }
    const turno = elecciones.current;
    setUbicando(true);
    setAvisoUbicacion(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUbicando(false);
        if (elecciones.current !== turno) {
          setAvisoUbicacion('Se mantiene el punto que has marcado mientras se buscaba tu ubicacion.');
          return;
        }
        fijarDesdeMapa(p.coords.latitude, p.coords.longitude, true);
      },
      (error) => {
        setUbicando(false);
        // Si entretanto el admin eligio un punto a mano, el error ya no importa.
        if (elecciones.current !== turno) return;
        setAvisoUbicacion(
          error.code === error.PERMISSION_DENIED
            ? 'Sin permiso de ubicacion. Activalo en los ajustes del navegador.'
            : 'No se pudo obtener tu ubicacion. Prueba otra vez o toca el mapa.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  const centro: L.LatLngTuple = punto ? [punto.lat, punto.lng] : [centroInicial.lat, centroInicial.lng];

  return (
    <>
      <Text style={typography.muted}>
        Toca el mapa o arrastra el pin. El circulo es la zona desde la que se puede sellar.
      </Text>
      <View style={styles.mapaCaja}>
        <MapContainer
          ref={setMapa}
          className="rb-mapa"
          center={centro}
          zoom={punto ? ZOOM_PARADA : 15}
          minZoom={ZOOM_MINIMO}
          maxBounds={LIMITES_MUNDO}
          maxBoundsViscosity={1}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url={OSM_TILES} attribution={OSM_ATRIBUCION} maxZoom={OSM_MAX_ZOOM} noWrap />
          <ClicEnMapa onClic={elegirEnMapa} />
          {punto ? (
            <>
              {radioM !== null ? (
                <Circle
                  center={[punto.lat, punto.lng]}
                  radius={radioM}
                  interactive={false}
                  pathOptions={{ color: colors.stamp, weight: 1, fillColor: colors.stamp, fillOpacity: 0.14 }}
                />
              ) : null}
              <Marker
                position={[punto.lat, punto.lng]}
                icon={ICONO_POSICION}
                draggable
                eventHandlers={{
                  dragend(evento) {
                    const { lat, lng } = (evento.target as L.Marker).getLatLng();
                    elegirEnMapa(lat, lng);
                  },
                }}
              />
            </>
          ) : null}
        </MapContainer>
      </View>
      <Button title="Usar mi ubicacion" variant="secondary" onPress={usarMiUbicacion} loading={ubicando} />
      {avisoUbicacion ? <Text style={typography.error}>{avisoUbicacion}</Text> : null}
      <Field
        label="Coordenadas"
        value={texto}
        onChangeText={onCambiarTexto}
        placeholder="40.41680, -3.70380"
        hint={estado.punto ? `Se guardara en ${describirPunto(estado.punto)}` : AYUDA}
        error={estado.error}
      />
    </>
  );
}

const styles = StyleSheet.create({
  mapaCaja: {
    height: 300,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
});

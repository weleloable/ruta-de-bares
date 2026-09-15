import type * as L from 'leaflet';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';

import {
  HUECOS_POR_DEFECTO,
  ZOOM_PARADA,
  crearControlEncuadre,
  desplazamientoCentroPx,
  encuadreDe,
  margenesEncuadre,
  type Huecos,
} from '../lib/encuadre';
import { ventana } from '../lib/fechas';
import {
  ICONO_YO,
  LIMITES_MUNDO,
  OSM_MAX_ZOOM,
  OSM_TILES,
  asegurarEstilosMapa,
  centroParaHueco,
  iconoParada,
  observarTamano,
} from '../lib/mapaWeb';
import { colors } from '../lib/theme';
import type { RutaMapaHandle, RutaMapaProps } from './RutaMapa.types';

export type { RutaMapaHandle } from './RutaMapa.types';

/**
 * Variante web de RutaMapa: Leaflet + OpenStreetMap, con la misma API que la
 * nativa (RutaMapa.tsx, react-native-maps). Metro elige este archivo al
 * bundlear para web, asi que react-native-maps no entra en el bundle web.
 *
 * La atribucion de OpenStreetMap no va en el control de Leaflet: la cabecera y
 * el carrusel de app/(tabs)/ruta.tsx taparian las esquinas. La pinta la
 * pantalla, dentro de la cabecera, siempre visible.
 *
 * Cuando se reencuadra lo decide crearControlEncuadre (src/lib/encuadre.ts),
 * probado en Node: aqui solo se conecta a los eventos.
 */

/** Puerta del Sol: centro hasta saber donde estan los bares. */
const CENTRO_VACIO: L.LatLngTuple = [40.4168, -3.7038];

/** Margen lateral al encuadrar, para que ningun pin quede pegado al borde. */
const MARGEN_LATERAL_PX = 40;

/** Por debajo de este zoom el mundo cabe varias veces y aparecen copias. */
const ZOOM_MINIMO = 3;

/**
 * Precision normal y lecturas de hasta 10 s: para pintar "estas aqui" en una
 * calle sobra, y la alta precision mantiene el GPS a tope y gasta bateria.
 */
const OPCIONES_GPS: PositionOptions = { enableHighAccuracy: false, maximumAge: 10000, timeout: 20000 };

export const RutaMapa = forwardRef<RutaMapaHandle, RutaMapaProps>(function RutaMapa(
  { bars, sellados, seleccionado, onSeleccionar, huecos },
  ref,
) {
  const [mapa, setMapa] = useState<L.Map | null>(null);
  const [yo, setYo] = useState<L.LatLngTuple | null>(null);
  const [control] = useState(crearControlEncuadre);
  // La pestana Ruta sigue montada al cambiar a otra (display:none). Mientras no
  // se ve, ni se encuadra ni se vigila el GPS.
  const [enPantalla, setEnPantalla] = useState(true);
  const [paginaVisible, setPaginaVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );

  // Lo que tapan cabecera y carrusel se lee de una ref y no de las dependencias
  // de `encuadrar`: un cambio de medida solo afecta al siguiente encuadre.
  const tapado = useRef<Huecos>(HUECOS_POR_DEFECTO);
  tapado.current = {
    arriba: Math.round((huecos ?? HUECOS_POR_DEFECTO).arriba),
    abajo: Math.round((huecos ?? HUECOS_POR_DEFECTO).abajo),
  };
  const hayMedida = huecos !== undefined;

  useEffect(asegurarEstilosMapa, []);

  // Solo se reencuadra si cambian las posiciones, no cada vez que el proveedor
  // recarga y entrega un array nuevo con lo mismo.
  const firma = bars.map((b) => `${b.id}:${b.lat}:${b.lng}`).join('|');
  const puntos = useMemo(
    () => bars.map((b) => ({ lat: b.lat, lng: b.lng })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firma],
  );

  /**
   * `animar` solo cuando lo pide el usuario ("Ver toda la ruta"). Los encuadres
   * automaticos (al montar, al llegar la primera medida) son instantaneos: dos
   * animaciones seguidas al abrir la pestana marean.
   */
  const encuadrar = useCallback(
    (animar = false) => {
      if (!mapa) return;
      mapa.invalidateSize();
      const alto = mapa.getSize().y;
      if (!control.pedir(alto)) return;

      const encuadre = encuadreDe(puntos);
      if (!encuadre) return;
      if (encuadre.tipo === 'punto') {
        const { lat, lng } = encuadre.centro;
        const desplazamiento = desplazamientoCentroPx(alto, tapado.current);
        mapa.setView(centroParaHueco(mapa, lat, lng, ZOOM_PARADA, desplazamiento), ZOOM_PARADA, {
          animate: animar,
        });
      } else {
        const { arriba, abajo } = margenesEncuadre(alto, tapado.current);
        mapa.fitBounds(encuadre.limites, {
          paddingTopLeft: [MARGEN_LATERAL_PX, arriba],
          paddingBottomRight: [MARGEN_LATERAL_PX, abajo],
          maxZoom: ZOOM_PARADA,
          animate: animar,
        });
      }
    },
    [mapa, puntos, control],
  );

  // Al montar y al cambiar las posiciones.
  useEffect(() => {
    encuadrar();
  }, [encuadrar]);

  // La primera medida valida de cabecera y carrusel encuadra una vez con los
  // valores reales; ocultar y mostrar la pestana no (ver crearControlEncuadre).
  useEffect(() => {
    if (control.medir(hayMedida)) encuadrar();
  }, [hayMedida, encuadrar, control]);

  useEffect(() => {
    if (!mapa) return undefined;
    setEnPantalla(mapa.getContainer().clientHeight > 0);
    return observarTamano(mapa, (tieneTamano) => {
      setEnPantalla(tieneTamano);
      if (tieneTamano && control.recuperarTamano()) encuadrar();
    });
  }, [mapa, encuadrar, control]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const alCambiar = () => setPaginaVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);

  // "Estas aqui" solo con el permiso de ubicacion YA concedido: abrir el mapa
  // no debe lanzar la pregunta, se pide al sellar, que es cuando el usuario
  // entiende para que. Se escucha el cambio de permiso para que el punto
  // aparezca en cuanto se conceda (al sellar en Sellos) sin recargar, y la
  // vigilancia se suelta en cuanto el mapa deja de verse.
  // Sin Permissions API (Safari anterior a 16) no se pinta: la unica forma de
  // saber si hay permiso seria preguntar.
  const gpsActivo = enPantalla && paginaVisible;
  useEffect(() => {
    if (!gpsActivo) {
      // Al volver no debe asomar la posicion de hace un rato.
      setYo(null);
      return undefined;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions) return undefined;
    let vivo = true;
    let vigilancia: number | null = null;
    let permiso: PermissionStatus | null = null;

    const aplicar = () => {
      if (!vivo || !permiso) return;
      if (permiso.state === 'granted') {
        if (vigilancia === null) {
          vigilancia = navigator.geolocation.watchPosition(
            (p) => setYo([p.coords.latitude, p.coords.longitude]),
            // Un fallo puntual (tunel, timeout) no borra el ultimo punto conocido.
            () => {},
            OPCIONES_GPS,
          );
        }
      } else {
        if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
        vigilancia = null;
        setYo(null);
      }
    };

    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((estado) => {
        if (!vivo) return;
        permiso = estado;
        permiso.onchange = aplicar;
        aplicar();
      })
      .catch(() => {});

    return () => {
      vivo = false;
      if (permiso) permiso.onchange = null;
      if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
    };
  }, [gpsActivo]);

  useImperativeHandle(
    ref,
    () => ({
      encuadrar() {
        encuadrar(true);
      },
      irA(bar) {
        if (!mapa) return;
        const alto = mapa.getSize().y;
        if (alto === 0) return;
        // Al centro del hueco libre real, no al centro de la pantalla: en una
        // pantalla baja el centro de la pantalla queda debajo del carrusel.
        const desplazamiento = desplazamientoCentroPx(alto, tapado.current);
        mapa.flyTo(centroParaHueco(mapa, bar.lat, bar.lng, ZOOM_PARADA, desplazamiento), ZOOM_PARADA, {
          duration: 0.35,
        });
      },
    }),
    [mapa, encuadrar],
  );

  // Memorizados: cada lectura del GPS repinta el componente, y sin esto se
  // regeneraria el HTML de todos los pines y se reengancharian sus eventos.
  const marcadores = useMemo(
    () =>
      bars.map((bar, indice) => (
        <Marker
          key={bar.id}
          position={[bar.lat, bar.lng]}
          icon={iconoParada(indice + 1, sellados.has(bar.id), bar.id === seleccionado)}
          eventHandlers={{ click: () => onSeleccionar(bar.id) }}
        >
          <Popup>
            <strong>{`${indice + 1}. ${bar.name}`}</strong>
            <br />
            {ventana(new Date(bar.opens_at), new Date(bar.closes_at))}
          </Popup>
        </Marker>
      )),
    [bars, sellados, seleccionado, onSeleccionar],
  );

  const primero = bars[0];
  const barSeleccionado = bars.find((b) => b.id === seleccionado) ?? null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapContainer
        ref={setMapa}
        className="rb-mapa"
        center={primero ? [primero.lat, primero.lng] : CENTRO_VACIO}
        zoom={15}
        minZoom={ZOOM_MINIMO}
        zoomControl={false}
        attributionControl={false}
        maxBounds={LIMITES_MUNDO}
        maxBoundsViscosity={1}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={OSM_TILES} maxZoom={OSM_MAX_ZOOM} noWrap />

        {puntos.length > 1 ? (
          <Polyline
            positions={puntos.map((p) => [p.lat, p.lng] as L.LatLngTuple)}
            interactive={false}
            pathOptions={{ color: colors.stamp, weight: 4, dashArray: '12 8' }}
          />
        ) : null}

        {barSeleccionado ? (
          <Circle
            center={[barSeleccionado.lat, barSeleccionado.lng]}
            radius={barSeleccionado.radius_m}
            interactive={false}
            pathOptions={{ color: colors.stamp, weight: 1, fillColor: colors.stamp, fillOpacity: 0.12 }}
          />
        ) : null}

        {marcadores}

        {yo ? <Marker position={yo} icon={ICONO_YO} interactive={false} /> : null}
      </MapContainer>
    </View>
  );
});

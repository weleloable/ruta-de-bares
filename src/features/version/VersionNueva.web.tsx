import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { recargaBloqueada } from '../../lib/bloqueoRecarga';
import { colors, fonts, radius, space } from '../../lib/theme';
import { INTERVALO_SONDEO_MS, decidirVersion, leerVersionRemota, urlVersion } from '../../lib/versionApp';
import { useAuth } from '../auth/AuthProvider';

// La incrusta Expo al exportar (deploy-web.yml la pone con el commit). En
// desarrollo no existe y todo esto se queda quieto.
const VERSION_LOCAL = process.env.EXPO_PUBLIC_APP_VERSION;

// Con tope: una peticion que no acaba nunca (iOS congela la PWA a mitad y el
// socket vuelve medio abierto) dejaria la comprobacion apagada toda la sesion.
const TOPE_PETICION_MS = 8000;

async function versionPublicada(): Promise<string | null> {
  const corte = new AbortController();
  const id = setTimeout(() => corte.abort(), TOPE_PETICION_MS);
  try {
    const res = await fetch(urlVersion(Constants.expoConfig?.experiments?.baseUrl, Date.now()), {
      cache: 'no-store',
      signal: corte.signal,
    });
    if (!res.ok) return null;
    return leerVersionRemota(await res.json());
  } catch {
    // Sin red, tope agotado o Pages contestando HTML: "no se sabe", nunca "recarga".
    return null;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Avisa de una version nueva (la decision vive en lib/versionApp.ts): barra
 * para los admins, recarga silenciosa al volver del segundo plano para el resto.
 * Va encima del Stack para verse desde cualquier pantalla.
 */
export function VersionNueva() {
  const { isAdmin } = useAuth();
  const insets = useSafeAreaInsets();
  // La version nueva que se ha visto y la que el admin ha cerrado: por commit y
  // no un booleano, para que cerrar la de un despliegue no esconda la del siguiente.
  const [nueva, setNueva] = useState<string | null>(null);
  const [cerrada, setCerrada] = useState<string | null>(null);
  // La comprobacion vive dentro del efecto; esto deja relanzarla desde fuera.
  const comprobarYa = useRef<(() => void) | null>(null);
  // Referencia y no el valor del closure: el perfil (y con el isAdmin) llega
  // despues de montar, y los listeners se registran una sola vez.
  const esAdmin = useRef(isAdmin);
  esAdmin.current = isAdmin;

  useEffect(() => {
    if (!VERSION_LOCAL || typeof document === 'undefined') return undefined;
    let ocultaDesde: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    let preguntando = false;
    // Una vuelta del segundo plano que llega con otra pregunta en vuelo no se
    // tira: se guarda y se repite al acabar (si no, esa vuelta no recargaria).
    let repetirCon: number | null = null;

    const comprobar = async (ocultaMs: number): Promise<void> => {
      if (preguntando) {
        repetirCon = Math.max(repetirCon ?? 0, ocultaMs);
        return;
      }
      preguntando = true;
      try {
        const remota = await versionPublicada();
        const decision = decidirVersion({
          local: VERSION_LOCAL,
          remota,
          esAdmin: esAdmin.current,
          ocultaMs,
          bloqueada: recargaBloqueada(),
        });
        if (decision === 'recargar') window.location.reload();
        else if (decision === 'aviso') setNueva(remota);
      } finally {
        preguntando = false;
      }
      if (repetirCon !== null) {
        const siguiente = repetirCon;
        repetirCon = null;
        await comprobar(siguiente);
      }
    };
    comprobarYa.current = () => void comprobar(0);

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        ocultaDesde = Date.now();
        return;
      }
      const ocultaMs = ocultaDesde === null ? 0 : Date.now() - ocultaDesde;
      ocultaDesde = null;
      void comprobar(ocultaMs);
    };

    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    // El sondeo solo le sirve a un admin que deja la app delante mucho rato: con
    // ocultaMs = 0 nunca recarga a nadie.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void comprobar(0);
    }, INTERVALO_SONDEO_MS);
    void comprobar(0);
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      clearInterval(id);
      comprobarYa.current = null;
    };
  }, []);

  // La primera comprobacion corre al montar, cuando el perfil (y con el isAdmin)
  // aun no ha llegado: sin esto, un admin esperaba 5 min al sondeo para ver la barra.
  useEffect(() => {
    if (isAdmin) comprobarYa.current?.();
  }, [isAdmin]);

  if (!nueva || nueva === cerrada || !isAdmin) return null;

  return (
    <View pointerEvents="box-none" style={[styles.capa, { top: insets.top + space.sm }]}>
      <View accessibilityRole="alert" style={styles.barra}>
        <Text style={styles.texto}>Hay una versión nueva</Text>
        <Pressable accessibilityRole="button" onPress={() => window.location.reload()} style={styles.boton} hitSlop={8}>
          <Text style={styles.textoBoton}>Actualizar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ahora no"
          onPress={() => setCerrada(nueva)}
          style={styles.cerrar}
          hitSlop={10}
        >
          <Text style={styles.textoCerrar}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  capa: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.lg,
    zIndex: 1000,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    maxWidth: 480,
    width: '100%',
    paddingVertical: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  texto: { flex: 1, color: colors.paper, fontFamily: fonts.body, fontSize: 15, fontWeight: '600' },
  boton: { backgroundColor: colors.beer, borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: space.lg },
  textoBoton: { color: colors.white, fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  cerrar: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  textoCerrar: { color: colors.paper, fontSize: 16 },
});

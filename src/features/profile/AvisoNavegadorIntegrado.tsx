import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, typography } from '../../lib/theme';
import { useInstalarApp } from '../../lib/pwaInstalar';
import { GuiaInstalarModal } from './GuiaInstalarModal';

/**
 * Aviso fijo, arriba, para quien abre la web DENTRO de otra app (WhatsApp,
 * Instagram, Facebook...), que es donde se reparten los enlaces de invitacion.
 * Desde ahi: no se puede instalar la app, "Continuar con Google" no funciona, y
 * lo que se haga no viaja al navegador de verdad (la invitacion pendiente y la
 * sesion viven en el `localStorage` de cada navegador; ver docs/SETUP.md,
 * "Con sesion"). Mejor enterarse ANTES de crear la cuenta que despues, por eso
 * sale en la invitacion, la entrada, el registro y Sellos.
 *
 * Solo sale si `guia` dice 'abrir-en-navegador' (guiaInstalar.ts); en cualquier
 * otro sitio no pinta nada. No se puede abrir el navegador de verdad desde aqui
 * (iOS no lo permite), asi que explica como en vez de prometer un boton.
 * Se puede cerrar y no vuelve a salir en ese navegador.
 */
const CLAVE_CERRADO = 'aviso-navegador-integrado-cerrado';

function leerCerrado(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(CLAVE_CERRADO) === '1';
  } catch {
    return false; // sin almacenamiento (ventana privada, bloqueado): sale cada vez
  }
}

function guardarCerrado() {
  try {
    window.localStorage.setItem(CLAVE_CERRADO, '1');
  } catch {
    // Sin almacenamiento: se cierra solo hasta recargar, que es lo mejor que hay.
  }
}

export function AvisoNavegadorIntegrado() {
  const { guia } = useInstalarApp();
  const [cerrado, setCerrado] = useState(leerCerrado);
  const [verPasos, setVerPasos] = useState(false);

  if (guia !== 'abrir-en-navegador' || cerrado) return null;

  return (
    <>
      <View style={styles.aviso} accessibilityRole="alert">
        <Ionicons name="open-outline" size={22} color={colors.beerDark} style={styles.icono} />
        <View style={styles.texto}>
          <Text style={styles.titulo}>Estás en el navegador de otra app</Text>
          <Text style={[typography.body, styles.cuerpo]}>
            Desde aquí no se puede instalar la app ni entrar con Google, y lo que hagas no pasa a tu navegador.
            Ábrela en Safari o en Chrome.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setVerPasos(true)} style={styles.enlace}>
            <Text style={styles.enlaceTexto}>Cómo abrirla</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.beerDark} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar aviso"
          hitSlop={10}
          onPress={() => {
            guardarCerrado();
            setCerrado(true);
          }}
        >
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <GuiaInstalarModal guia={verPasos ? guia : null} onCerrar={() => setVerPasos(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.beerSoft,
    borderWidth: 1,
    borderColor: colors.beer,
  },
  icono: { marginTop: 1 },
  texto: { flex: 1, gap: space.xs },
  titulo: { fontSize: 15, fontWeight: '800', color: colors.ink },
  cuerpo: { fontSize: 14, lineHeight: 20 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: space.xs },
  enlaceTexto: { fontSize: 14, fontWeight: '800', color: colors.beerDark, textDecorationLine: 'underline' },
});

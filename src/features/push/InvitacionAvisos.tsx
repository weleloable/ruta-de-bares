import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { colors, radius, space } from '../../lib/theme';
import { useAuth } from '../auth/AuthProvider';
import { useMiCasa } from '../casas/MiCasa';
import { queHacerConAviso } from '../legal/cambiosPolitica';
import { VERSION_POLITICA } from '../legal/responsable';
import { useActiveRoute } from '../routes/ActiveRouteProvider';
import { activarAvisos, estadoAvisos, sincronizarAvisos } from './push';

const YA_PREGUNTADO = 'rb-avisos-preguntado';

function yaPreguntado(): boolean {
  try {
    return globalThis.localStorage?.getItem(YA_PREGUNTADO) === '1';
  } catch {
    return false;
  }
}

function marcarPreguntado() {
  try {
    globalThis.localStorage?.setItem(YA_PREGUNTADO, '1');
  } catch {
    // Sin almacenamiento (modo privado): se volvera a preguntar, nada mas.
  }
}

/**
 * "¿Te avisamos?" (0064): sale una vez, cuando ya estas en una ruta y el
 * navegador puede pedir permiso, explicando para que antes de que salga el
 * permiso del sistema (pedirlo sin mas hace que casi todo el mundo diga que
 * no). Espera a que se cierren la animacion de la casa y el aviso de
 * politica. Al abrir la app, ademas, refresca la suscripcion si ya la hay.
 */
export function InvitacionAvisos() {
  const { session, profile } = useAuth();
  const { activeRoute } = useActiveRoute();
  const { casa, vista: casaVista } = useMiCasa();
  const [puede, setPuede] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!session) return;
    void sincronizarAvisos();
    void estadoAvisos().then((e) => setPuede(e === 'pendiente' && !yaPreguntado()));
  }, [session]);

  const politicaPendiente = profile ? queHacerConAviso(profile.politica_vista, VERSION_POLITICA, profile.created_at) === 'avisar' : true;
  const visible = puede && !!activeRoute && !(casa && !casaVista) && !politicaPendiente;

  function cerrar() {
    marcarPreguntado();
    setPuede(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <View style={styles.fondo}>
        <View style={styles.hoja}>
          <Text style={styles.icono}>🔔</Text>
          <Text style={styles.titulo}>¿Te avisamos?</Text>
          <Text style={styles.cuerpo}>Solo de lo importante, aunque tengas la app cerrada:</Text>
          <View style={styles.lista}>
            <Text style={styles.punto}>🍺  10 minutos antes de cada parada</Text>
            <Text style={styles.punto}>🎽  Si te falta un bar para el sorteo, y quién lo gana</Text>
            <Text style={styles.punto}>🍻  Conexiones y mensajes de La Caña</Text>
          </View>
          <Text style={styles.nota}>Puedes cambiarlo cuando quieras en Mi perfil.</Text>
          <Button
            title="Activar avisos"
            loading={ocupado}
            onPress={async () => {
              setOcupado(true);
              try {
                await activarAvisos();
              } catch {
                // Si falla, se puede activar desde Mi perfil, que ensena el error.
              } finally {
                setOcupado(false);
                cerrar();
              }
            }}
          />
          <Button title="Ahora no" variant="ghost" onPress={cerrar} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: space.lg },
  hoja: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
  },
  icono: { fontSize: 40, textAlign: 'center' },
  titulo: { fontSize: 22, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  cuerpo: { fontSize: 15, color: colors.inkSoft, textAlign: 'center' },
  lista: { gap: space.xs },
  punto: { fontSize: 15, lineHeight: 21, color: colors.ink },
  nota: { fontSize: 13, color: colors.inkFaint, textAlign: 'center' },
});

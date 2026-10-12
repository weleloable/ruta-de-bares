import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useAuth } from '../auth/AuthProvider';
import { useMiCasa } from '../casas/MiCasa';
import { CAMBIOS_POLITICA, queHacerConAviso } from './cambiosPolitica';
import { VERSION_POLITICA } from './responsable';

/**
 * "Hemos actualizado la política" (0063): sale una vez al abrir la app si la
 * version que viste es mas vieja que la actual. Espera a que se cierre la
 * animacion de tu casa, para no salir una encima de otra.
 */
export function AvisoPolitica() {
  const { profile, refreshProfile } = useAuth();
  const { casa, vista: casaVista } = useMiCasa();
  const [cerrado, setCerrado] = useState(false);

  const accion = profile ? queHacerConAviso(profile.politica_vista, VERSION_POLITICA, profile.created_at) : 'nada';

  async function marcar() {
    setCerrado(true);
    // Si falla (sin red), vuelve a salir la proxima vez: mejor que perderlo.
    const { error } = await supabase.rpc('politica_marcar_vista', { p_version: VERSION_POLITICA });
    if (!error) await refreshProfile();
  }

  // Quien se dio de alta con esta version ya la acepto: se marca sin decir nada.
  useEffect(() => {
    if (accion === 'marcar' && !cerrado) void marcar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accion]);

  const visible = accion === 'avisar' && !cerrado && !(casa && !casaVista);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void marcar()}>
      <View style={styles.fondo}>
        <View style={styles.hoja}>
          <Text style={styles.icono}>🔒</Text>
          <Text style={styles.titulo}>Hemos actualizado la política de privacidad</Text>
          <Text style={styles.cuerpo}>Desde la última vez, esto es lo nuevo:</Text>
          <View style={styles.lista}>
            {CAMBIOS_POLITICA.map((c) => (
              <Text key={c} style={styles.punto}>{`•  ${c}`}</Text>
            ))}
          </View>
          <Button
            title="Leer la política"
            variant="secondary"
            onPress={() => {
              void marcar();
              router.push('/privacidad');
            }}
          />
          <Button title="Entendido" onPress={() => void marcar()} />
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
    maxWidth: 440,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
  },
  icono: { fontSize: 36, textAlign: 'center' },
  titulo: { fontSize: 19, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  cuerpo: { fontSize: 15, color: colors.inkSoft },
  lista: { gap: space.xs },
  punto: { fontSize: 14, lineHeight: 20, color: colors.ink },
});

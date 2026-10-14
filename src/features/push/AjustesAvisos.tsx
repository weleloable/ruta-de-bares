import { useEffect, useState } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { Banner, Button, Card } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { Casilla } from '../match/piezas';
import { guardarAvisoAdmin, guardarPreferenciasAvisos, leerPreferenciasAvisos, type PreferenciasAvisos } from './api';
import { textoEstado, type EstadoAvisos } from './estado';
import { activarAvisos, desactivarAvisos, estadoAvisos } from './push';

/**
 * "Avisos en el móvil" en Mi perfil (0064): activarlos o quitarlos en este
 * dispositivo y elegir de que (paradas, sorteo, La Caña). Las preferencias son
 * de la cuenta: valen para todos tus dispositivos. En la app nativa no sale.
 */
export function AjustesAvisos({ estiloTitulo }: { estiloTitulo?: StyleProp<TextStyle> }) {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const [prefs, setPrefs] = useState<PreferenciasAvisos | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void estadoAvisos().then(setEstado);
    void leerPreferenciasAvisos().then(setPrefs);
  }, []);

  if (estado === null || estado === 'no-soportado') return null;

  async function cambiarPref(clave: keyof PreferenciasAvisos, valor: boolean) {
    if (!prefs) return;
    const nuevas = { ...prefs, [clave]: valor };
    setPrefs(nuevas);
    setError(null);
    try {
      // `admin` va por su propia funcion (0066): la de siempre no lo conoce.
      if (clave === 'admin') await guardarAvisoAdmin(valor);
      else await guardarPreferenciasAvisos(nuevas);
    } catch (e) {
      setPrefs(prefs);
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  }

  async function alternar() {
    setOcupado(true);
    setError(null);
    try {
      if (estado === 'activo') {
        await desactivarAvisos();
        setEstado(await estadoAvisos());
      } else {
        setEstado(await activarAvisos());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron activar los avisos.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card style={styles.tarjeta}>
      <Text style={estiloTitulo ?? typography.sectionTitle}>Avisos en el móvil</Text>
      <Text style={typography.muted}>{textoEstado(estado)}</Text>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {estado === 'pendiente' || estado === 'activo' ? (
        <Button
          title={estado === 'activo' ? 'Quitar avisos de este dispositivo' : 'Activar avisos'}
          variant={estado === 'activo' ? 'secondary' : 'primary'}
          loading={ocupado}
          onPress={() => void alternar()}
        />
      ) : null}
      {estado === 'activo' && prefs ? (
        <>
          <Casilla marcada={prefs.paradas} texto="10 min antes de cada parada" onCambiar={(m) => void cambiarPref('paradas', m)} />
          <Casilla marcada={prefs.sorteo} texto="El sorteo (y si te falta un bar)" onCambiar={(m) => void cambiarPref('sorteo', m)} />
          <Casilla marcada={prefs.cana} texto="La Caña: conexiones y mensajes" onCambiar={(m) => void cambiarPref('cana', m)} />
          {/* Solo para admins: el servidor solo manda `admin` a quien lo es. */}
          {prefs.admin !== undefined ? (
            <Casilla
              marcada={prefs.admin}
              texto="Moderación pendiente: denuncias, fotos y mensajes"
              onCambiar={(m) => void cambiarPref('admin', m)}
            />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tarjeta: { gap: space.sm },
});

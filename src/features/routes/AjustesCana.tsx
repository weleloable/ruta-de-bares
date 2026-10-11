import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui';
import { colors, radius, space, typography } from '../../lib/theme';
import { AJUSTES_CANA, ajustarHoras, ajustarRadio, textoRadio } from '../match/reglas';
import { Casilla } from '../match/piezas';
import type { RouteRow } from '../../types/database';

type Cambio = Partial<Pick<RouteRow, 'cana_horas_antes' | 'cana_radio_km'>>;

/**
 * Las dos reglas para activar La Caña en esta ruta (0042), en el editor: cuantas
 * horas antes del primer bar se abre y a que distancia de el hay que estar. Cada
 * toque se guarda al momento. A los admins no les aplican.
 */
export function AjustesCana({
  ruta,
  ocupado,
  onCambiar,
}: {
  ruta: RouteRow;
  ocupado: boolean;
  onCambiar(cambio: Cambio): void;
}) {
  const horas = ruta.cana_horas_antes ?? AJUSTES_CANA.horas.porDefecto;
  const radio = ruta.cana_radio_km;
  const sinLimite = radio === null;

  return (
    <Card>
      <Text style={typography.sectionTitle}>La Caña en esta ruta</Text>
      <Text style={typography.muted}>
        Cuándo y desde dónde se puede activar. A los administradores no les aplica.
      </Text>

      <Paso
        etiqueta="Se abre antes del primer bar"
        valor={horas === 0 ? 'Al abrir' : `${horas} h antes`}
        puedeBajar={!ocupado && horas > AJUSTES_CANA.horas.min}
        puedeSubir={!ocupado && horas < AJUSTES_CANA.horas.max}
        onBajar={() => onCambiar({ cana_horas_antes: ajustarHoras(horas, -1) })}
        onSubir={() => onCambiar({ cana_horas_antes: ajustarHoras(horas, 1) })}
      />

      <Paso
        etiqueta="Distancia máxima al primer bar"
        valor={textoRadio(radio)}
        puedeBajar={!ocupado && !sinLimite && (radio ?? 0) > AJUSTES_CANA.radioKm.min}
        puedeSubir={!ocupado && !sinLimite && (radio ?? 0) < AJUSTES_CANA.radioKm.max}
        onBajar={() => onCambiar({ cana_radio_km: ajustarRadio(radio ?? AJUSTES_CANA.radioKm.porDefecto, -AJUSTES_CANA.radioKm.paso) })}
        onSubir={() => onCambiar({ cana_radio_km: ajustarRadio(radio ?? AJUSTES_CANA.radioKm.porDefecto, AJUSTES_CANA.radioKm.paso) })}
      />
      <Casilla
        marcada={sinLimite}
        desactivada={ocupado}
        texto="Sin límite de distancia (no se pide la ubicación)"
        onCambiar={(marcada) => onCambiar({ cana_radio_km: marcada ? null : AJUSTES_CANA.radioKm.porDefecto })}
      />
    </Card>
  );
}

export function Paso({
  etiqueta,
  valor,
  puedeBajar,
  puedeSubir,
  onBajar,
  onSubir,
}: {
  etiqueta: string;
  valor: string;
  puedeBajar: boolean;
  puedeSubir: boolean;
  onBajar(): void;
  onSubir(): void;
}) {
  return (
    <View style={styles.paso}>
      <Text style={[typography.body, styles.etiqueta]}>{etiqueta}</Text>
      <View style={styles.mando}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Menos: ${etiqueta}`}
          disabled={!puedeBajar}
          onPress={onBajar}
          style={[styles.boton, !puedeBajar && styles.inactivo]}
        >
          <Ionicons name="remove" size={22} color={colors.white} />
        </Pressable>
        <Text style={styles.valor}>{valor}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Más: ${etiqueta}`}
          disabled={!puedeSubir}
          onPress={onSubir}
          style={[styles.boton, !puedeSubir && styles.inactivo]}
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paso: { gap: space.xs },
  etiqueta: { fontWeight: '700' },
  mando: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  boton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.beer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactivo: { opacity: 0.35 },
  valor: { minWidth: 110, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink },
});

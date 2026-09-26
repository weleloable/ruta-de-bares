import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../../../../components/ui';
import { colors, radius, space, typography } from '../../../../lib/theme';
import type { PropsJuego } from '../../tipos';
import { buscarMalta, LEVADURAS, MALTAS } from './datos';
import { anterior, numeroPaso, PASOS, puedeAvanzar, RECETA_VACIA, siguiente, type Paso, type Receta } from './pasos';
import { PasoLupulo } from './PasoLupulo';
import { PasoMaceracion } from './PasoMaceracion';
import { VasoCerveza } from './VasoCerveza';

const TITULOS: Record<Paso, string> = {
  malta: 'Elige la malta',
  maceracion: 'Maceración',
  lupulo: 'Lúpulo',
  fermentacion: 'Elige la levadura',
  resultado: 'Tu cerveza',
};

// Color del vaso mientras aun no se ha elegido malta.
const COLOR_NEUTRO = '#E9B54B';

// Datos fijos de la fase 1 (la fase 3 los calcula).
const NOMBRE_FIJO = 'Ale Complutense';

/**
 * Estructura de pasos y navegacion. Malta y levadura se eligen; maceracion y
 * lupulo son de habilidad. El resultado lleva datos FIJOS hasta la fase 3, que
 * los calcula, y la puntuacion que sale es provisional: 0.
 */
export function MaestroCervecero({ onFinish }: PropsJuego) {
  const [paso, setPaso] = useState<Paso>('malta');
  const [receta, setReceta] = useState<Receta>(RECETA_VACIA);

  const n = numeroPaso(paso);
  const atras = anterior(paso);
  const malta = buscarMalta(receta.malta);

  return (
    <View style={styles.raiz}>
      <View style={styles.progreso}>
        {PASOS.map((p, i) => (
          <View key={p} style={[styles.punto, (n === null || i < n) && styles.puntoHecho]} />
        ))}
      </View>
      <Text style={typography.overline}>{n === null ? 'Listo' : `Paso ${n} de ${PASOS.length}`}</Text>
      <Text style={typography.sectionTitle}>{TITULOS[paso]}</Text>

      <ScrollView contentContainerStyle={styles.cuerpo} showsVerticalScrollIndicator={false}>
        {paso === 'malta' ? (
          <View style={styles.rejilla}>
            {MALTAS.map((m) => (
              <Opcion
                key={m.id}
                seleccionada={receta.malta === m.id}
                titulo={m.nombre}
                descripcion={m.descripcion}
                onPress={() => setReceta({ ...receta, malta: m.id })}
                muestra={<VasoCerveza color={m.color} alto={56} ancho={36} />}
              />
            ))}
          </View>
        ) : null}

        {paso === 'maceracion' ? (
          <PasoMaceracion onTerminar={(maceracion) => setReceta((r) => ({ ...r, maceracion }))} />
        ) : null}

        {paso === 'lupulo' ? <PasoLupulo onTerminar={(lupulo) => setReceta((r) => ({ ...r, lupulo }))} /> : null}

        {paso === 'fermentacion' ? (
          <View style={styles.rejilla}>
            {LEVADURAS.map((l) => (
              <Opcion
                key={l.id}
                seleccionada={receta.levadura === l.id}
                titulo={l.nombre}
                descripcion={l.descripcion}
                onPress={() => setReceta({ ...receta, levadura: l.id })}
              />
            ))}
          </View>
        ) : null}

        {paso === 'resultado' ? <TarjetaResultado color={malta?.color ?? COLOR_NEUTRO} /> : null}
      </ScrollView>

      <View style={styles.botones}>
        {paso === 'resultado' ? (
          <Button
            title="Terminar"
            onPress={() =>
              onFinish({
                juego: 'maestro-cervecero',
                puntuacion: 0,
                detalles: {
                  nombre: NOMBRE_FIJO,
                  malta: receta.malta ?? '',
                  levadura: receta.levadura ?? '',
                  provisional: true,
                },
              })
            }
          />
        ) : (
          <Button
            title={paso === 'fermentacion' ? 'Ver mi cerveza' : 'Siguiente'}
            disabled={!puedeAvanzar(paso, receta)}
            onPress={() => setPaso(siguiente(paso))}
          />
        )}
        {atras ? <Button title="Atrás" variant="secondary" onPress={() => setPaso(atras)} /> : null}
      </View>
    </View>
  );
}

function TarjetaResultado({ color }: { color: string }) {
  return (
    <Card style={styles.tarjeta}>
      <VasoCerveza color={color} alto={150} ancho={92} />
      <Text style={[typography.sectionTitle, styles.centrado]}>{NOMBRE_FIJO}</Text>
      <Text style={typography.muted}>Ale · 5,0 % vol · 25 IBU</Text>
      <Text style={styles.nota}>Puntuación: 0 (provisional)</Text>
    </Card>
  );
}

function Opcion({
  titulo,
  descripcion,
  seleccionada,
  onPress,
  muestra,
}: {
  titulo: string;
  descripcion: string;
  seleccionada: boolean;
  onPress: () => void;
  muestra?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: seleccionada }}
      accessibilityLabel={`${titulo}. ${descripcion}`}
      onPress={onPress}
      style={[styles.opcion, seleccionada && styles.opcionElegida]}
    >
      {muestra}
      <View style={styles.opcionTextos}>
        <Text style={typography.cardTitle}>{titulo}</Text>
        <Text style={typography.muted}>{descripcion}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, gap: space.sm },
  progreso: { flexDirection: 'row', gap: space.xs },
  punto: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.border },
  puntoHecho: { backgroundColor: colors.beer },
  cuerpo: { gap: space.md, paddingVertical: space.sm },
  rejilla: { gap: space.md },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 84,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  opcionElegida: { borderColor: colors.beer, backgroundColor: colors.beerSoft },
  opcionTextos: { flex: 1, gap: 2 },
  tarjeta: { alignItems: 'center' },
  centrado: { textAlign: 'center' },
  nota: { fontSize: 13, fontWeight: '700', color: colors.beerDark },
  botones: { gap: space.sm },
});

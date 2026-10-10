import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../../../../components/ui';
import { colors, radius, space, typography } from '../../../../lib/theme';
import { useAuth } from '../../../auth/AuthProvider';
import type { PropsJuego } from '../../tipos';
import { elegirDato } from './curiosidades';
import { MALTAS } from './datos';
import { calcularCerveza } from './estilo';
import { PasoLupulo } from './PasoLupulo';
import { PasoMaceracion } from './PasoMaceracion';
import { PasoSiembra } from './PasoSiembra';
import {
  anterior,
  numeroPaso,
  PASOS,
  puedeAvanzar,
  RECETA_VACIA,
  recetaCompleta,
  siguiente,
  type Paso,
  type PasoJuego,
  type Receta,
} from './pasos';
import { ResultadoCerveza } from './ResultadoCerveza';
import { VasoCerveza } from './VasoCerveza';

const TITULOS: Record<Paso, string> = {
  malta: 'Elige la malta',
  maceracion: 'Maceración',
  lupulo: 'Lúpulo',
  fermentacion: 'Enfría y siembra',
  resultado: 'Tu cerveza',
};

const pct = (x: number) => Math.round(x * 100);

/**
 * Cuatro microjuegos encadenados que acaban en "tu cerveza". Entre paso y paso
 * sale un dato curioso (una frase) que se salta con un toque. `onFinish` se
 * llama al pulsar "Terminar" en la tarjeta final, con el nombre elegido.
 */
export function MaestroCervecero({ onFinish }: PropsJuego) {
  const { profile } = useAuth();
  const [paso, setPaso] = useState<Paso>('malta');
  const [receta, setReceta] = useState<Receta>(RECETA_VACIA);
  // Dato curioso que se ve ENTRE dos pasos; null = se esta en un paso.
  const [dato, setDato] = useState<string | null>(null);

  const n = numeroPaso(paso);
  const atras = anterior(paso);
  const completa = recetaCompleta(receta);
  const cerveza = useMemo(() => (completa ? calcularCerveza(completa) : null), [receta]);

  const avanzar = () => {
    if (paso === 'resultado') return;
    setDato(elegirDato(paso as PasoJuego, Math.random));
  };
  const seguir = () => {
    setDato(null);
    setPaso(siguiente(paso));
  };

  const terminar = (nombre: string) => {
    if (!completa || !cerveza) return;
    onFinish({
      juego: 'maestro-cervecero',
      puntuacion: cerveza.puntuacion,
      detalles: {
        nombre,
        estilo: cerveza.estilo,
        malta: completa.malta,
        levadura: completa.levadura,
        graduacion: cerveza.abv,
        ibu: cerveza.ibu,
        cuerpo: cerveza.cuerpo,
        maceracion: pct(completa.maceracion),
        amargor: pct(completa.lupulo.amargor),
        aroma: pct(completa.lupulo.aroma),
        siembra: pct(completa.siembra),
      },
    });
  };

  return (
    <View style={styles.raiz}>
      <View style={styles.progreso}>
        {PASOS.map((p, i) => (
          <View key={p} style={[styles.punto, (n === null || i < n) && styles.puntoHecho]} />
        ))}
      </View>
      <Text style={typography.overline}>{n === null ? 'Listo' : `Paso ${n} de ${PASOS.length}`}</Text>
      <Text style={typography.sectionTitle}>{dato !== null ? '¿Sabías que…?' : TITULOS[paso]}</Text>

      {dato !== null ? (
        <View style={styles.cuerpoFijo}>
          <Card>
            <Text style={styles.dato}>{dato}</Text>
          </Card>
          <Button title="Seguir" onPress={seguir} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.cuerpo}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {paso === 'malta' ? (
              <View style={styles.rejilla}>
                {MALTAS.map((m) => (
                  <Opcion
                    key={m.id}
                    seleccionada={receta.malta === m.id}
                    titulo={m.nombre}
                    descripcion={m.descripcion}
                    onPress={() => setReceta({ ...receta, malta: m.id })}
                    muestra={<VasoCerveza malta={m.id} alto={64} ancho={40} />}
                  />
                ))}
              </View>
            ) : null}

            {paso === 'maceracion' ? (
              <PasoMaceracion onTerminar={(maceracion) => setReceta((r) => ({ ...r, maceracion }))} />
            ) : null}

            {paso === 'lupulo' ? <PasoLupulo onTerminar={(lupulo) => setReceta((r) => ({ ...r, lupulo }))} /> : null}

            {paso === 'fermentacion' ? (
              <PasoSiembra
                levadura={receta.levadura}
                // Otra levadura es otra ventana: lo sembrado con la anterior ya no vale.
                onElegirLevadura={(levadura) => setReceta((r) => ({ ...r, levadura, siembra: null }))}
                // Repetir el paso (volviendo con Atras) anula la siembra de antes hasta sembrar otra vez.
                onEmpezar={() => setReceta((r) => ({ ...r, siembra: null }))}
                onTerminar={(siembra) => setReceta((r) => ({ ...r, siembra }))}
              />
            ) : null}

            {paso === 'resultado' && cerveza ? (
              <ResultadoCerveza
                cerveza={cerveza}
                malta={receta.malta ?? MALTAS[0].id}
                siembra={completa?.siembra ?? 0}
                jugador={profile?.display_name ?? ''}
                onTerminar={terminar}
              />
            ) : null}
          </ScrollView>

          <View style={styles.botones}>
            {paso !== 'resultado' ? (
              <Button
                title={paso === 'fermentacion' ? 'Ver mi cerveza' : 'Siguiente'}
                disabled={!puedeAvanzar(paso, receta)}
                onPress={avanzar}
              />
            ) : null}
            {atras ? <Button title="Atrás" variant="secondary" onPress={() => setPaso(atras)} /> : null}
          </View>
        </>
      )}
    </View>
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
  cuerpoFijo: { flex: 1, gap: space.md, paddingVertical: space.sm },
  dato: { fontSize: 18, lineHeight: 26, color: colors.ink },
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
  botones: { gap: space.sm },
});

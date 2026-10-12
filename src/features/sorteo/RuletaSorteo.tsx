import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space } from '../../lib/theme';
import { pasosRuleta, type ResultadoSorteo } from './sorteo';

/**
 * La ruleta del sorteo (0061), a pantalla completa para ensenarla en el bar:
 * los nombres de quienes entran pasan cada vez mas despacio y se para en el
 * ganador. El ganador ya lo eligio el servidor antes de empezar: esto es solo
 * el espectaculo, no se puede "parar a mano".
 */
export function RuletaSorteo({
  resultado,
  premio,
  onCerrar,
}: {
  resultado: ResultadoSorteo | null;
  premio: string;
  onCerrar: () => void;
}) {
  const pasos = useMemo(
    () => (resultado ? pasosRuleta(resultado.nombres, resultado.ganador, Math.random) : []),
    [resultado],
  );
  const [paso, setPaso] = useState(0);
  const terminado = resultado !== null && paso >= pasos.length - 1;

  useEffect(() => {
    setPaso(0);
  }, [pasos]);

  useEffect(() => {
    if (!resultado || paso >= pasos.length - 1) return undefined;
    const id = setTimeout(() => setPaso((p) => p + 1), pasos[paso]!.ms);
    return () => clearTimeout(id);
  }, [resultado, paso, pasos]);

  if (!resultado) return null;
  const nombre = pasos[paso]?.nombre ?? resultado.ganador;

  return (
    <Modal visible animationType="fade" onRequestClose={onCerrar}>
      <View style={styles.fondo}>
        <Text style={styles.antes}>{`Sorteo de ${premio.trim() || 'el premio'}`}</Text>
        <Text style={styles.cuenta}>{`Entre ${resultado.participantes} ${resultado.participantes === 1 ? 'persona' : 'personas'}`}</Text>

        <View style={[styles.marco, terminado && styles.marcoGanador]}>
          <Text style={[styles.nombre, terminado && styles.nombreGanador]} numberOfLines={2} adjustsFontSizeToFit>
            {nombre}
          </Text>
        </View>

        {terminado ? (
          <View style={styles.final}>
            <Text style={styles.enhorabuena}>🎉 ¡Enhorabuena!</Text>
            {resultado.suplentes.length > 0 ? (
              <Text style={styles.suplentes}>{`Suplentes, por si no está: ${resultado.suplentes.join(' y ')}`}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={onCerrar}
              style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
            >
              <Text style={styles.botonTexto}>Cerrar</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.girando}>Sorteando…</Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg, backgroundColor: colors.ink },
  antes: { fontSize: 16, fontWeight: '800', letterSpacing: 1.2, color: colors.beerSoft, textTransform: 'uppercase', textAlign: 'center' },
  cuenta: { fontSize: 14, color: colors.inkFaint },
  marco: {
    width: '100%',
    maxWidth: 480,
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.beer,
    backgroundColor: '#3A2A1A',
  },
  marcoGanador: { borderColor: colors.white, backgroundColor: colors.stamp },
  nombre: { fontFamily: fonts.title, fontSize: 40, color: colors.white, textAlign: 'center' },
  nombreGanador: { fontSize: 46 },
  girando: { fontSize: 16, color: colors.beerSoft },
  final: { alignItems: 'center', gap: space.md },
  enhorabuena: { fontSize: 26, fontWeight: '900', color: colors.white },
  suplentes: { fontSize: 14, color: colors.beerSoft, textAlign: 'center' },
  boton: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill, backgroundColor: colors.beer },
  pulsado: { opacity: 0.8 },
  botonTexto: { fontSize: 16, fontWeight: '900', color: colors.white },
});

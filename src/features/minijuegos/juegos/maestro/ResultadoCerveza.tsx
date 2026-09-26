import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card } from '../../../../components/ui';
import { colors, radius, space, typography } from '../../../../lib/theme';
import { veredicto, type Cerveza } from './estilo';
import { NOMBRE_MAX, nombreFinal, sugerirNombre } from './nombres';
import { VasoCerveza } from './VasoCerveza';

/**
 * Tarjeta final: el vaso, el nombre (editable), los datos y la nota. La
 * sugerencia automatica se guarda aparte del campo: si la persona lo deja vacio
 * se recupera la ULTIMA sugerencia, no la primera.
 */
export function ResultadoCerveza({
  cerveza,
  color,
  jugador,
  onTerminar,
}: {
  cerveza: Cerveza;
  /** Color del liquido: el de la malta. */
  color: string;
  jugador: string;
  onTerminar: (nombre: string) => void;
}) {
  const [sugerencia, setSugerencia] = useState(() => sugerirNombre(cerveza.estilo, jugador, Math.random));
  const [nombre, setNombre] = useState(sugerencia);

  const otra = () => {
    const nueva = sugerirNombre(cerveza.estilo, jugador, Math.random, sugerencia);
    setSugerencia(nueva);
    setNombre(nueva);
  };

  return (
    <View style={styles.raiz}>
      <Card style={styles.tarjeta}>
        <VasoCerveza color={color} alto={150} ancho={92} />

        <View style={styles.campoFila}>
          <Ionicons name="pencil" size={18} color={colors.inkFaint} />
          <TextInput
            value={nombre}
            onChangeText={setNombre}
            // Si se deja vacio, vuelve la ultima sugerencia automatica.
            onBlur={() => setNombre(nombreFinal(nombre, sugerencia))}
            maxLength={NOMBRE_MAX}
            accessibilityLabel="Nombre de tu cerveza"
            placeholder={sugerencia}
            placeholderTextColor={colors.inkFaint}
            style={styles.campo}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Otra sugerencia de nombre"
            onPress={otra}
            hitSlop={8}
            style={styles.dado}
          >
            <Ionicons name="dice" size={26} color={colors.beerDark} />
          </Pressable>
        </View>
        <Text style={typography.muted}>{nombre.length}/{NOMBRE_MAX}</Text>

        <Text style={styles.estilo}>{cerveza.estilo}</Text>
        <View style={styles.datos}>
          <Dato valor={`${cerveza.abv.toString().replace('.', ',')} %`} etiqueta="Graduación" />
          <Dato valor={`${cerveza.ibu} IBU`} etiqueta="Amargor" />
          <Dato valor={cerveza.cuerpo} etiqueta="Cuerpo" />
        </View>

        <View style={styles.nota}>
          <Text style={styles.notaNumero}>{cerveza.puntuacion}</Text>
          <Text style={typography.muted}>de 100 · {veredicto(cerveza.puntuacion)}</Text>
        </View>
      </Card>

      <Button title="Terminar" onPress={() => onTerminar(nombreFinal(nombre, sugerencia))} />
    </View>
  );
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoValor}>{valor}</Text>
      <Text style={typography.overline}>{etiqueta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.md },
  tarjeta: { alignItems: 'center' },
  campoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.paper,
  },
  campo: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.ink, paddingVertical: space.sm },
  dado: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  estilo: { fontSize: 15, fontWeight: '800', color: colors.beerDark, letterSpacing: 0.4 },
  datos: { flexDirection: 'row', gap: space.lg, alignSelf: 'stretch', justifyContent: 'space-around' },
  dato: { alignItems: 'center', gap: 2 },
  datoValor: { fontSize: 17, fontWeight: '800', color: colors.ink },
  nota: { alignItems: 'center' },
  notaNumero: { fontSize: 48, fontWeight: '800', color: colors.beerDark },
});

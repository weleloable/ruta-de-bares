import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { colors, radius, space, typography } from '../../lib/theme';
import { parseHora } from './horas';
import { componerHora, marcasDeHoras, marcasDeMinutos, type MarcaReloj } from './reloj';

const TAMANO = 248;
const BURBUJA = 36;
const RADIO_EXTERIOR = 98;
const RADIO_INTERIOR = 62;

/** Boton que enseña la hora elegida y abre el reloj. Mismo aspecto que un Field. */
export function CampoHora({
  etiqueta,
  valor,
  activo,
  onPress,
}: {
  etiqueta: string;
  valor: string;
  activo: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.campo}>
      <Text style={typography.overline}>{etiqueta}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${etiqueta} ${valor}. Cambiar la hora`}
        accessibilityState={{ expanded: activo }}
        onPress={onPress}
        style={[styles.campoCaja, activo && styles.campoCajaActivo]}
      >
        <Text style={styles.campoHora}>{valor}</Text>
        <Text style={styles.campoIcono}>◔</Text>
      </Pressable>
    </View>
  );
}

/**
 * Selector de hora con forma de reloj: primero se toca la hora, luego los
 * minutos (de 5 en 5). Se puede volver a la hora tocando el numero grande de
 * arriba. Solo toques, sin arrastre: funciona igual con dedo y con raton.
 *
 * Es un componente controlado: `valor` y `onCambiar` van en 'HH:MM', el mismo
 * texto que ya consume construirVentana, asi que la validacion no cambia.
 * Quien lo use pone `key` distinta por cada campo para que arranque en horas.
 */
export function RelojHora({
  titulo,
  valor,
  onCambiar,
  onListo,
}: {
  titulo: string;
  valor: string;
  onCambiar: (nuevo: string) => void;
  onListo: () => void;
}) {
  const [modo, setModo] = useState<'horas' | 'minutos'>('horas');
  // Un valor a medio escribir o vacio no debe romper el reloj: se pinta sin
  // aguja y el primer toque lo arregla.
  const actual = parseHora(valor);

  const marcas = modo === 'horas' ? marcasDeHoras(TAMANO, RADIO_EXTERIOR, RADIO_INTERIOR) : marcasDeMinutos(TAMANO, RADIO_EXTERIOR);
  const seleccionada = actual ? (modo === 'horas' ? actual.horas : actual.minutos) : null;
  const marcaActiva = marcas.find((m) => m.valor === seleccionada);

  function elegir(marca: MarcaReloj) {
    if (modo === 'horas') {
      onCambiar(componerHora(marca.valor, actual?.minutos ?? 0));
      setModo('minutos');
    } else {
      onCambiar(componerHora(actual?.horas ?? 0, marca.valor));
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={typography.overline}>{titulo}</Text>

      <View style={styles.cabecera}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Elegir la hora"
          onPress={() => setModo('horas')}
          style={[styles.numeroGrande, modo === 'horas' && styles.numeroGrandeActivo]}
        >
          <Text style={[styles.numeroTexto, modo === 'horas' && styles.numeroTextoActivo]}>
            {actual ? String(actual.horas).padStart(2, '0') : '--'}
          </Text>
        </Pressable>
        <Text style={styles.dosPuntos}>:</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Elegir los minutos"
          onPress={() => setModo('minutos')}
          style={[styles.numeroGrande, modo === 'minutos' && styles.numeroGrandeActivo]}
        >
          <Text style={[styles.numeroTexto, modo === 'minutos' && styles.numeroTextoActivo]}>
            {actual ? String(actual.minutos).padStart(2, '0') : '--'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.esfera}>
        {marcaActiva ? (
          // La aguja es una barra vertical que llega del borde al centro; se gira
          // el cuadrado entero alrededor de su centro, que es el del reloj.
          <View
            pointerEvents="none"
            style={[
              styles.aguja,
              {
                left: TAMANO / 2 - marcaActiva.radio,
                top: TAMANO / 2 - marcaActiva.radio,
                width: marcaActiva.radio * 2,
                height: marcaActiva.radio * 2,
                transform: [{ rotate: `${marcaActiva.angulo}deg` }],
              },
            ]}
          >
            <View style={[styles.agujaBarra, { left: marcaActiva.radio - 1, top: BURBUJA / 2, height: marcaActiva.radio - BURBUJA / 2 }]} />
          </View>
        ) : null}
        <View pointerEvents="none" style={styles.centro} />

        {marcas.map((marca) => {
          const elegida = marca.valor === seleccionada;
          const interior = modo === 'horas' && marca.radio === RADIO_INTERIOR;
          return (
            <Pressable
              key={`${modo}-${marca.valor}-${marca.radio}`}
              accessibilityRole="button"
              accessibilityLabel={modo === 'horas' ? `${marca.valor} horas` : `${marca.valor} minutos`}
              accessibilityState={{ selected: elegida }}
              onPress={() => elegir(marca)}
              style={[
                styles.marca,
                { left: marca.x - BURBUJA / 2, top: marca.y - BURBUJA / 2 },
                elegida && styles.marcaElegida,
              ]}
            >
              <Text style={[styles.marcaTexto, interior && styles.marcaTextoInterior, elegida && styles.marcaTextoElegida]}>
                {marca.etiqueta}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Button title="Listo" onPress={onListo} />
    </View>
  );
}

const styles = StyleSheet.create({
  campo: { flex: 1, gap: space.xs },
  campoCaja: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  campoCajaActivo: { borderColor: colors.beer, borderWidth: 2 },
  campoHora: { fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  campoIcono: { fontSize: 20, color: colors.inkSoft },

  panel: {
    gap: space.md,
    alignItems: 'center',
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  numeroGrande: { borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.xs, backgroundColor: colors.paperDeep },
  numeroGrandeActivo: { backgroundColor: colors.beer },
  numeroTexto: { fontSize: 36, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  numeroTextoActivo: { color: colors.white },
  dosPuntos: { fontSize: 36, fontWeight: '700', color: colors.ink },

  esfera: {
    width: TAMANO,
    height: TAMANO,
    borderRadius: radius.pill,
    backgroundColor: colors.paperDeep,
  },
  aguja: { position: 'absolute' },
  agujaBarra: { position: 'absolute', top: 0, width: 2, backgroundColor: colors.beer },
  centro: {
    position: 'absolute',
    left: TAMANO / 2 - 4,
    top: TAMANO / 2 - 4,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.beer,
  },
  marca: {
    position: 'absolute',
    width: BURBUJA,
    height: BURBUJA,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcaElegida: { backgroundColor: colors.beer },
  marcaTexto: { fontSize: 15, fontWeight: '600', color: colors.ink },
  marcaTextoInterior: { fontSize: 13, color: colors.inkSoft },
  marcaTextoElegida: { color: colors.white },
});

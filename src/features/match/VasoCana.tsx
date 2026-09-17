import { View } from 'react-native';

import { colors } from '../../lib/theme';

/**
 * El vaso que marca el estado de una persona en Tirate una cana: media caña es
 * tu Me gusta, caña llena es una conexion (los dos) y vaso vacio es Visto (la
 * abriste y no le diste Me gusta). Es el icono en color y en forma a la vez:
 * se lee tambien en gris.
 *
 * Dibujado con Views y no con SVG: react-native-svg es un modulo nativo nuevo
 * y obligaria a recompilar el development build solo por tres iconos.
 */
export type NivelVaso = 'vacio' | 'media' | 'llena';

export function VasoCana({
  nivel,
  tamano = 18,
  trazo = colors.beerDark,
  liquido = colors.beer,
  espuma = colors.card,
}: {
  nivel: NivelVaso;
  tamano?: number;
  trazo?: string;
  liquido?: string;
  espuma?: string;
}) {
  const ancho = tamano * 0.56;
  const alto = tamano * 0.68;
  const grosor = Math.max(1.5, tamano / 11);
  const burbuja = tamano * 0.3;
  // Arriba del vaso: donde apoya la espuma.
  const bocaY = tamano - tamano * 0.06 - alto;

  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'flex-end' }}
    >
      <View
        style={{
          width: ancho,
          height: alto,
          marginBottom: tamano * 0.06,
          borderWidth: grosor,
          borderTopWidth: 0,
          borderColor: trazo,
          borderBottomLeftRadius: tamano * 0.12,
          borderBottomRightRadius: tamano * 0.12,
          overflow: 'hidden',
        }}
      >
        {nivel !== 'vacio' ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: nivel === 'llena' ? '88%' : '48%',
              backgroundColor: liquido,
            }}
          />
        ) : null}
      </View>

      {nivel === 'llena' ? (
        <View
          style={{
            position: 'absolute',
            top: bocaY - burbuja * 0.55,
            flexDirection: 'row',
          }}
        >
          {/* Burbujas muy juntas: separadas parecen una huella, no espuma. */}
          {[0, 1, 2].map((indice) => (
            <View
              key={indice}
              style={{
                width: burbuja,
                height: burbuja,
                marginHorizontal: -burbuja * 0.26,
                marginTop: indice === 1 ? -burbuja * 0.22 : 0,
                borderRadius: burbuja,
                borderWidth: grosor * 0.7,
                borderColor: trazo,
                backgroundColor: espuma,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

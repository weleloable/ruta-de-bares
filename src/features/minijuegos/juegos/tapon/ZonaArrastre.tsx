import type { ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

export type PropsZonaArrastre = {
  /** El dedo toca en (x, y), en px de la zona. Devuelve false para no quedarse este toque. */
  onInicio: (x: number, y: number) => boolean;
  onMover: (x: number, y: number) => void;
  onSoltar: (x: number, y: number) => void;
  /** El sistema se llevo el toque: no se lanza. */
  onCancelar: () => void;
  /**
   * La zona se pinta girada 90 grados (movil en vertical, juego tumbado). En
   * web hay que deshacer el giro a mano; en nativo `locationX` ya viene en las
   * coordenadas de la zona, giro incluido.
   */
  girado?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  children?: ReactNode;
};

/**
 * Zona de tirachinas, en nativo. Usa el sistema de "responder" de React Native
 * y NO un Pressable: hace falta seguir el dedo, y Pressable cancela al moverse.
 *
 * `onResponderTerminationRequest` devuelve false: mientras se apunta, ningun
 * padre (un ScrollView, la navegacion) puede quitarle el toque. Lo que el
 * sistema se lleva igual (el gesto de atras de Android, una llamada) llega como
 * `onResponderTerminate` y el tiro se anula, no se dispara a medias.
 *
 * Coordenadas: `locationX/Y`, que son las de la vista TOCADA en su propio
 * sistema (con sus transformaciones, asi que el giro del juego tumbado no hay
 * que deshacerlo). Para que la vista tocada sea siempre esta zona, los hijos van
 * con `pointerEvents="none"`. SIN PROBAR en un movil de verdad.
 *
 * La variante web (ZonaArrastre.web.tsx) usa Pointer Events con captura.
 */
export function ZonaArrastre({ onInicio, onMover, onSoltar, onCancelar, onLayout, style, accessibilityLabel, children }: PropsZonaArrastre) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      style={style}
      onStartShouldSetResponder={(e) => onInicio(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onMoveShouldSetResponder={() => false}
      onResponderTerminationRequest={() => false}
      onResponderMove={(e) => onMover(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onResponderRelease={(e) => onSoltar(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onResponderTerminate={onCancelar}
    >
      <View pointerEvents="none" style={{ flex: 1 }}>
        {children}
      </View>
    </View>
  );
}

import { useRef, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

export type PropsZonaArrastre = {
  /** El dedo toca en (x, y), en px de la zona. Devuelve false para no quedarse este toque. */
  onInicio: (x: number, y: number) => boolean;
  onMover: (x: number, y: number) => void;
  onSoltar: (x: number, y: number) => void;
  /** El sistema se llevo el toque: no se lanza. */
  onCancelar: () => void;
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
 * Las coordenadas salen de `pageX - origen`, con el origen tomado al empezar:
 * `locationX` es relativo al elemento que hay bajo el dedo en cada momento, y
 * al pasar por encima de un hijo cambia de referencia. Por eso tambien los
 * hijos van con `pointerEvents="none"`.
 *
 * La variante web (ZonaArrastre.web.tsx) usa Pointer Events con captura.
 */
export function ZonaArrastre({ onInicio, onMover, onSoltar, onCancelar, onLayout, style, accessibilityLabel, children }: PropsZonaArrastre) {
  // Ref y no variable: cada movimiento repinta al padre, y una variable volveria a 0.
  const origen = useRef({ x: 0, y: 0 });
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      style={style}
      onStartShouldSetResponder={(e) => {
        const { locationX, locationY, pageX, pageY } = e.nativeEvent;
        if (!onInicio(locationX, locationY)) return false;
        origen.current = { x: pageX - locationX, y: pageY - locationY };
        return true;
      }}
      onMoveShouldSetResponder={() => false}
      onResponderTerminationRequest={() => false}
      onResponderMove={(e) => onMover(e.nativeEvent.pageX - origen.current.x, e.nativeEvent.pageY - origen.current.y)}
      onResponderRelease={(e) => onSoltar(e.nativeEvent.pageX - origen.current.x, e.nativeEvent.pageY - origen.current.y)}
      onResponderTerminate={onCancelar}
    >
      <View pointerEvents="none" style={{ flex: 1 }}>
        {children}
      </View>
    </View>
  );
}

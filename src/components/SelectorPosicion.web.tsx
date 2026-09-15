import { useState } from 'react';

import { describirPunto, estadoCampoCoordenadas, formatCoordenadas } from '../lib/coordenadas';
import type { SelectorPosicionProps } from './SelectorPosicion.types';
import { Field } from './ui';

const AYUDA = 'En Google Maps, clic derecho sobre el bar y pulsa las coordenadas para copiarlas.';

/**
 * Variante web del selector de posicion: sin mapa (react-native-maps no tiene
 * build web), las coordenadas se pegan desde Google Maps.
 *
 * Cada cambio de texto manda su punto, o null si el texto no es valido: la
 * pantalla nunca se queda con una posicion anterior, y sin punto no deja
 * guardar. Bajo el campo se ensena como se va a guardar (hemisferios en
 * claro) para que un signo equivocado salte a la vista.
 *
 * El texto inicial sale de `punto` al montar; la pantalla solo monta esto tras
 * cargar el bar y le da un `key` por bar, asi que no hace falta resincronizar.
 */
export function SelectorPosicion({ punto, onCambiar }: SelectorPosicionProps) {
  const [texto, setTexto] = useState(punto ? formatCoordenadas(punto) : '');
  const estado = estadoCampoCoordenadas(texto);

  function onCambiarTexto(nuevo: string) {
    setTexto(nuevo);
    onCambiar(estadoCampoCoordenadas(nuevo).punto);
  }

  return (
    <Field
      label="Coordenadas"
      value={texto}
      onChangeText={onCambiarTexto}
      placeholder="40.41680, -3.70380"
      hint={estado.punto ? `Se guardara en ${describirPunto(estado.punto)}` : AYUDA}
      error={estado.error}
    />
  );
}

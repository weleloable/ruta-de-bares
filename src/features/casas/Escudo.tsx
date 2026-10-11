import { Image } from 'expo-image';
import { memo } from 'react';

import { CASAS, escudoUri, type IdCasa } from './casas';

/** El escudo de una casa, a `tamano` px de ancho (el alto sale de su proporcion). */
export const Escudo = memo(function Escudo({ casa, tamano = 48 }: { casa: IdCasa; tamano?: number }) {
  return (
    <Image
      source={{ uri: escudoUri(casa) }}
      style={{ width: tamano, height: (tamano * 140) / 120 }}
      contentFit="contain"
      accessibilityLabel={`Escudo de la casa ${CASAS[casa].nombre}`}
    />
  );
});

import { useState } from 'react';

import { Banner } from '../../components/ui';
import { leerInvitacionPendiente } from './pendiente';

/**
 * "Vienes de una invitacion": en registro y login, para que quien abrio el
 * enlace de una ruta vea que sigue en pie y que lo siguiente que pasa es
 * entrar en ella. Sin esto, tras pedirle crear la cuenta, la pantalla parecia
 * un registro cualquiera y nada decia que la invitacion no se habia perdido.
 *
 * Se lee UNA vez al montar: no hace falta que se actualice, y asi no parpadea
 * cuando /invitacion borra el pendiente al canjear.
 */
export function AvisoInvitacionPendiente() {
  const [hay] = useState(() => leerInvitacionPendiente() !== null);
  if (!hay) return null;
  return <Banner tone="info">Te han invitado a una ruta. En cuanto entres, te llevamos a la invitación para que te unas.</Banner>;
}

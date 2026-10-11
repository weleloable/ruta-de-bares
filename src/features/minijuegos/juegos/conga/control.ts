import AsyncStorage from '@react-native-async-storage/async-storage';

import { CLAVE_CONTROL, leerControl, type Control } from './controlReglas';

export async function cargarControl(): Promise<Control> {
  try {
    return leerControl(await AsyncStorage.getItem(CLAVE_CONTROL));
  } catch {
    return 'deslizar';
  }
}

export async function guardarControl(control: Control): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE_CONTROL, control);
  } catch {
    // Sin almacen (modo privado): se juega igual, solo que no se recuerda.
  }
}

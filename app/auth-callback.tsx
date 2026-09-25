import { Redirect } from 'expo-router';

/**
 * Destino de rutadebares://auth-callback, a donde vuelve el navegador tras
 * Google en el movil. Quien canjea el codigo es features/auth/google.ts, que
 * recibe la URL del propio navegador; esta ruta existe solo para que Android,
 * que ademas entrega el enlace a la app, no pinte una pantalla "no encontrada".
 * AuthGate decide despues a donde va cada quien.
 */
export default function AuthCallbackScreen() {
  return <Redirect href="/" />;
}

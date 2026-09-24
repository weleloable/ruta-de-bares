import type { ExpoConfig } from 'expo/config';

/**
 * app.config.ts (no app.json): la API key de Google Maps se lee de process.env
 * para que nunca acabe en git. Ver .env.example y docs/SETUP.md.
 */
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

/**
 * Subruta de la web publicada en GitHub Pages (/ruta-de-bares). Solo la define
 * el workflow .github/workflows/deploy-web.yml al exportar.
 *
 * Por que una variable y no `experiments.baseUrl` fijo: Expo usa ese valor
 * tambien en `npx expo start --web` (el servidor de desarrollo pasaria a vivir
 * en http://localhost:8081/ruta-de-bares/) y en los exports nativos. Con la
 * variable, el desarrollo local y los builds de movil no cambian y solo el
 * export de Pages lleva el prefijo en los assets y en los enlaces del router.
 * No lleva prefijo EXPO_PUBLIC_ porque no hace falta dentro del bundle: Expo
 * ya incrusta el baseUrl por su cuenta.
 */
const webBaseUrl = process.env.WEB_BASE_URL?.trim() ?? '';
if (webBaseUrl !== '' && !/^(\/[A-Za-z0-9._-]+)+$/.test(webBaseUrl)) {
  // Sin barra inicial Expo carga los assets relativos a la pagina y se rompen
  // en cuanto la ruta tiene dos segmentos. Mejor fallar al exportar.
  throw new Error(`WEB_BASE_URL invalido: "${webBaseUrl}". Formato: /subruta, sin barra final.`);
}

const config: ExpoConfig = {
  name: 'Ruta de Bares',
  slug: 'ruta-de-bares',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'rutadebares',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.weleloable.rutadebares',
  },
  android: {
    package: 'com.weleloable.rutadebares',
    adaptiveIcon: {
      // El crema del logo (CREMA en scripts/generar-iconos.py), que es de donde
      // salen estos tres pngs.
      backgroundColor: '#FBF7EB',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
    output: 'single',
  },
  experiments: {
    typedRoutes: true,
    ...(webBaseUrl !== '' ? { baseUrl: webBaseUrl } : {}),
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-secure-store',
    'expo-image',
    'expo-dev-client',
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
        iosGoogleMapsApiKey: googleMapsApiKey,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Ruta de Bares usa tu ubicacion para comprobar que estas en el bar cuando sellas.',
        locationAlwaysAndWhenInUsePermission:
          'Ruta de Bares usa tu ubicacion para comprobar que estas en el bar cuando sellas.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Ruta de Bares accede a tus fotos para tu imagen de perfil.',
        cameraPermission: 'Ruta de Bares usa la camara para tu imagen de perfil.',
      },
    ],
  ],
};

export default config;

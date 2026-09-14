import type { ExpoConfig } from 'expo/config';

/**
 * app.config.ts (no app.json): la API key de Google Maps se lee de process.env
 * para que nunca acabe en git. Ver .env.example y docs/SETUP.md.
 */
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

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
      backgroundColor: '#2B1B10',
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

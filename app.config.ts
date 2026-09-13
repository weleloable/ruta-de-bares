import type { ExpoConfig } from 'expo/config';

// app.json no puede leer variables de entorno; app.config.ts sí, y hace
// falta para inyectar la API key de Google Maps en Android (ver README ->
// "Configurar Google Maps"). iOS usa Apple Maps por defecto y no necesita
// ninguna key.
const LOCATION_PERMISSION_TEXT =
  'Se usa tu ubicación para sellar automáticamente los bares de la ruta cuando estás a menos de 10 metros de uno, dentro de su horario.';

const config: ExpoConfig = {
  name: 'ruta-de-bares',
  slug: 'ruta-de-bares',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: LOCATION_PERMISSION_TEXT,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_PERMISSION_TEXT,
      },
    ],
  ],
};

export default config;

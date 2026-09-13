import type { ExpoConfig } from 'expo/config';

// app.json no puede leer variables de entorno; app.config.ts sí, y hace
// falta para inyectar la API key de Google Maps en Android (ver README ->
// "Configurar Google Maps"). iOS usa Apple Maps por defecto y no necesita
// ninguna key.
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
      NSCameraUsageDescription: 'Se usa la cámara para escanear el QR de cada bar y sellar tu compostelana.',
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
    permissions: ['CAMERA'],
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
      'expo-camera',
      {
        cameraPermission: 'Se usa la cámara para escanear el QR de cada bar y sellar tu compostelana.',
      },
    ],
  ],
};

export default config;

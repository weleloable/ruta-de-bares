# Ruta de Bares 🍻

App móvil (React Native + Expo) para la ruta de bares anual: un mapa con los
bares y sus horarios, y una "compostelana" que se sella escaneando el QR de
cada bar.

## Funcionalidad

- **Mapa**: todos los bares de la ruta activa, en orden, con su horario.
- **Compostelana**: tus sellos y el progreso del resto del grupo.
- **Sellar**: escanea el QR físico de cada bar para sellarlo (una vez por
  bar y persona).
- **Admin**: crea la ruta de cada año, añade bares (nombre, horario,
  ubicación en el mapa) y genera el QR de cada uno para imprimirlo.

## Stack

- [Expo](https://expo.dev/) (SDK 57) + React Native + TypeScript
- [Supabase](https://supabase.com) — Postgres + Auth + Row Level Security,
  ver [`supabase/README.md`](supabase/README.md) para el porqué y cómo montarlo
- `react-native-maps`, `expo-camera` (escaneo de QR), `react-native-qrcode-svg`
- `@react-navigation` (tabs + stacks), Jest para los tests

## Empezar

1. Backend: sigue [`supabase/README.md`](supabase/README.md) para crear el
   proyecto de Supabase y aplicar el esquema.
2. Copia `.env.example` a `.env` y rellena las claves de tu proyecto:
   ```bash
   cp .env.example .env
   ```
3. Instala dependencias y arranca:
   ```bash
   npm install
   npm start
   ```
   Luego escanea el QR con la app **Expo Go** (Android/iOS), o usa:
   ```bash
   npm run android
   npm run ios
   ```
   El mapa en Android usa Google Maps: rellena `GOOGLE_MAPS_API_KEY` en
   `.env` (ver comentario en el propio archivo) o los marcadores no se
   verán en un build nativo (en Expo Go con SDK 57 puede funcionar sin key
   en modo de pruebas, pero no lo des por sentado en producción).

## Tests

```bash
npm test
```

17 tests sobre la lógica pura de dominio (`src/lib/`): decodificación y
validación del payload del QR, cálculo de progreso individual y de grupo, y
formato de horarios. Deliberadamente no dependen de React Native ni de red,
así que corren igual de rápido sin emulador ni Supabase.

## Estructura

```
src/
  lib/            lógica pura (qr, seals, format) + capa de acceso a datos (api/)
  types/domain.ts contrato compartido con el esquema de supabase/
  contexts/       AuthContext (sesión + perfil + rol)
  hooks/          useActiveRoute (ruta activa + bares + sellos + perfiles)
  navigation/     tabs de usuario + stack de admin
  screens/        Mapa, Compostelana, Sellar, Login, y screens/admin/
supabase/
  migrations/     esquema, RLS y la función redeem_stamp
  README.md       cómo montar el backend y por qué Supabase
__tests__/        tests de src/lib/
```

## Estado

✅ MVP funcional: auth, ruta anual gestionada por admins, mapa, sellado por
QR y compostelana con progreso de grupo. Pendiente de credenciales reales de
Supabase/Google Maps para probarlo en un dispositivo (ver checklist en el PR).

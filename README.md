# Ruta de Bares 🍻

App móvil (React Native + Expo) para la ruta de bares anual: un mapa con los
bares y sus horarios, y una "compostelana" que se sella sola por GPS cuando
estás en el bar que toca, a la hora que toca.

## Funcionalidad

- **Mapa**: entre 5 y 20 bares de la ruta activa, en orden, con su horario.
- **Compostelana**: tus sellos y el progreso del resto del grupo.
- **Sellar**: con la pestaña "Sellar" abierta, se sella solo cuando estás a
  menos de 10 metros de un bar, dentro de su horario asignado en la ruta.
- **Admin**: crea la ruta de cada año, añade bares (nombre, horario,
  ubicación tocando el mapa) y activa la ruta cuando tenga al menos 5.

## Stack

- [Expo](https://expo.dev/) (SDK 57) + React Native + TypeScript
- [Supabase](https://supabase.com) — Postgres + Auth + Row Level Security,
  ver [`supabase/README.md`](supabase/README.md) para el porqué y cómo montarlo
- `react-native-maps`, `expo-location` (check-in por GPS)
- `@react-navigation` (tabs + stacks), Jest para los tests

## Empezar

1. Backend: sigue [`supabase/README.md`](supabase/README.md) para crear el
   proyecto de Supabase y aplicar el esquema.
2. Copia `.env.example` a `.env` y rellena las claves de tu proyecto:
   ```bash
   cp .env.example .env
   ```
   Sin esto la app arranca igual, pero muestra una pantalla de "falta
   configurar el backend" en vez de crashear.
3. Instala dependencias y arranca:
   ```bash
   npm install
   npm start
   ```
   Luego escanea el QR con la app **Expo Go** (Android/iOS), o usa:
   ```bash
   npm run android
   npm run ios
   npm run web    # previsualización en el navegador, ver limitaciones abajo
   ```
   El mapa en Android usa Google Maps: rellena `GOOGLE_MAPS_API_KEY` en
   `.env` (ver comentario en el propio archivo) o los marcadores no se
   verán en un build nativo.

### Previsualizar en el navegador (`npm run web`)

Sirve para comprobar rápido pantallas de login, admin y la compostelana sin
un móvil a mano. Dos cosas no funcionan igual que en el móvil:

- **Mapa**: `react-native-maps` no tiene soporte web; en el navegador
  `MapScreen` muestra la ruta como lista en vez de mapa interactivo.
- **Sellar por GPS**: si el navegador da permiso de ubicación sí que
  funciona (usa la geolocalización del propio navegador), pero la precisión
  del GPS de un portátil es mucho peor que la de un móvil, así que no es
  representativo del check-in real.

## Tests

```bash
npm test
```

30 tests sobre la lógica pura de dominio (`src/lib/`): distancia GPS
(`geo.ts`), si una hora cae dentro del turno de un bar incluyendo turnos que
cruzan medianoche (`schedule.ts`), progreso individual y de grupo
(`seals.ts`), y formato de horarios (`format.ts`). Deliberadamente no
dependen de React Native ni de red, así que corren igual de rápido sin
emulador ni Supabase.

## Estructura

```
src/
  lib/            lógica pura (geo, schedule, seals, format) + acceso a datos (api/)
  types/domain.ts contrato compartido con el esquema de supabase/
  contexts/       AuthContext (sesión + perfil + rol)
  hooks/          useActiveRoute (ruta activa + bares + sellos + perfiles)
  navigation/     tabs de usuario + stack de admin
  screens/        Mapa, Compostelana, Sellar (CheckIn), Login, y screens/admin/
supabase/
  migrations/     esquema, RLS y la función check_in
  README.md       cómo montar el backend y por qué Supabase
__tests__/        tests de src/lib/
```

## Estado

✅ MVP funcional: auth, ruta anual gestionada por admins (5-20 bares), mapa,
sellado automático por GPS+horario y compostelana con progreso de grupo.
Pendiente de credenciales reales de Supabase/Google Maps para probarlo en un
dispositivo (ver checklist en el PR).

/**
 * Imports de CSS (solo web, p. ej. `import 'leaflet/dist/leaflet.css'`).
 *
 * Metro los resuelve y en nativo los ignora, pero TypeScript 6 exige que todo
 * import de efecto lateral resuelva a algo con tipos. `expo-env.d.ts` trae esta
 * declaracion, pero se genera al arrancar Expo y esta en .gitignore: en CI y en
 * un clon limpio no existe.
 */
declare module '*.css';

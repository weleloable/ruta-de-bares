import { Platform, StyleSheet } from 'react-native';

/**
 * Paleta "compostelana": papel de credencial, tinta, tinta de sello y cerveza.
 * Un solo modo claro a proposito; la app se usa de noche en la calle y el
 * contraste alto sobre papel se lee mejor que un gris sobre gris.
 */
export const colors = {
  paper: '#F6EFE2',
  paperDeep: '#EDE2CE',
  card: '#FFFDF8',
  ink: '#241A12',
  inkSoft: '#6B5B4B',
  inkFaint: '#A2907C',
  beer: '#C67A1E',
  beerDark: '#9A5A11',
  stamp: '#A82C24',
  stampSoft: '#F0D6D2',
  green: '#2F6B4F',
  greenSoft: '#DCEBE1',
  // Conexion de Tirate una cana: lo bastante lejos del verde de "Me gusta"
  // para distinguirlos, y siempre acompanado de icono (daltonismo).
  teal: '#127A80',
  tealSoft: '#DDEFF0',
  border: '#D9C9AE',
  borderStrong: '#B8A183',
  danger: '#A82C24',
  white: '#FFFFFF',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const fonts = {
  title: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
} as const;

export const typography = StyleSheet.create({
  screenTitle: {
    fontFamily: fonts.title,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: 0.3,
  },
  sectionTitle: {
    fontFamily: fonts.title,
    fontSize: 19,
    color: colors.ink,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  body: {
    fontSize: 15,
    color: colors.ink,
    lineHeight: 21,
  },
  muted: {
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  overline: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkFaint,
    fontWeight: '700',
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
});

export const shadow = Platform.select({
  ios: {
    shadowColor: '#3A2A1A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 2 },
  default: {},
});

/** Estilo de mapa de Google en tonos papel, para que el mapa no desentone. */
export const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#F6EFE2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B5B4B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F6EFE2' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#DDE6D0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFDF8' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E3D5BC' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F2E2C4' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BFD4DA' }] },
];

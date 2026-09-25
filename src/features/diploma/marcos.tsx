import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DIPLOMA_ANCHO } from './textoDiploma';

/**
 * Marcos del diploma, dibujados solo con Views (sin imagenes ni SVG), todos de
 * temática cervecera. Cada uno se pinta sobre una mitad del diploma
 * (DIPLOMA_ANCHO x ALTO_MITAD) y dice cuanto espacio se come:
 * `relleno` (lo que el contenido debe dejar libre arriba y abajo) y `margenMapa`
 * (el hueco entre el borde y el mapa del reverso).
 */
export const ALTO_MITAD = 320;

export type VarianteMarco = 'clasico' | 'tercios' | 'chapas' | 'espuma' | 'cebada' | 'etiqueta' | 'nueve';

export const VARIANTES_MARCO: readonly VarianteMarco[] = [
  'clasico',
  'tercios',
  'chapas',
  'espuma',
  'cebada',
  'etiqueta',
  'nueve',
];

export const MEDIDAS_MARCO: Record<VarianteMarco, { relleno: number; margenMapa: number; fondo: number }> = {
  clasico: { relleno: 20, margenMapa: 23, fondo: 10 },
  tercios: { relleno: 38, margenMapa: 38, fondo: 30 },
  chapas: { relleno: 30, margenMapa: 32, fondo: 24 },
  espuma: { relleno: 32, margenMapa: 26, fondo: 24 },
  cebada: { relleno: 26, margenMapa: 30, fondo: 12 },
  etiqueta: { relleno: 28, margenMapa: 30, fondo: 10 },
  nueve: { relleno: 26, margenMapa: 32, fondo: 12 },
};

const TINTA = '#3B2A17';
const ORO = '#A9802A';
const AMBAR = '#C98A1B';
const AMBAR_OSCURO = '#8A5A12';
const ESPUMA = '#FFF9EA';
const ROJO = '#7A1F1A';
const VERDE = '#2F6B4F';

const W = DIPLOMA_ANCHO;
const H = ALTO_MITAD;
const abs = StyleSheet.absoluteFill;

/** Un tercio de cerveza (botella de 33 cl) de pie: cuerpo, cuello y chapa. */
function Tercio({ alto, color = AMBAR_OSCURO }: { alto: number; color?: string }) {
  const ancho = alto * 0.38;
  return (
    <View style={{ width: ancho, height: alto, alignItems: 'center' }}>
      <View style={{ width: ancho * 0.5, height: alto * 0.07, backgroundColor: TINTA, borderRadius: 1 }} />
      <View style={{ width: ancho * 0.36, height: alto * 0.3, backgroundColor: color }} />
      <View
        style={{
          width: ancho,
          height: alto * 0.63,
          backgroundColor: color,
          borderTopLeftRadius: ancho * 0.45,
          borderTopRightRadius: ancho * 0.45,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        }}
      >
        <View style={{ position: 'absolute', left: ancho * 0.16, top: alto * 0.14, width: ancho * 0.12, height: alto * 0.36, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 2 }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: alto * 0.28, height: alto * 0.2, backgroundColor: ESPUMA, opacity: 0.85 }} />
      </View>
    </View>
  );
}

/** Una chapa de botellin vista desde arriba: disco con aro y corona. */
function ChapaMini({ d, color = AMBAR, texto }: { d: number; color?: string; texto?: string }) {
  return (
    <View
      style={{
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: color,
        borderWidth: Math.max(1.5, d * 0.1),
        borderColor: AMBAR_OSCURO,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: d * 0.56, height: d * 0.56, borderRadius: d * 0.28, borderWidth: 1, borderColor: ESPUMA, alignItems: 'center', justifyContent: 'center' }}>
        {texto ? <Text style={{ fontSize: d * 0.42, fontWeight: '900', color: ESPUMA }}>{texto}</Text> : null}
      </View>
    </View>
  );
}

function Rombo({ lado = 10, color = ORO, style }: { lado?: number; color?: string; style?: object }) {
  return <View style={[{ position: 'absolute', width: lado, height: lado, backgroundColor: color, transform: [{ rotate: '45deg' }] }, style]} />;
}

function Rect({ inset, grosor, color, radio = 0 }: { inset: number; grosor: number; color: string; radio?: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: inset, left: inset, right: inset, bottom: inset, borderWidth: grosor, borderColor: color, borderRadius: radio }}
    />
  );
}

/** N elementos repartidos a lo largo de una linea horizontal, centrados en cada hueco. */
function Fila({ n, desde, hasta, y, children }: { n: number; desde: number; hasta: number; y: number; children: (i: number) => ReactNode }) {
  const paso = (hasta - desde) / n;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ position: 'absolute', left: desde + paso * (i + 0.5), top: y, transform: [{ translateX: '-50%' }] }}>
          {children(i)}
        </View>
      ))}
    </>
  );
}

function Columna({ n, desde, hasta, x, children }: { n: number; desde: number; hasta: number; x: number; children: (i: number) => ReactNode }) {
  const paso = (hasta - desde) / n;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ position: 'absolute', top: desde + paso * (i + 0.5), left: x, transform: [{ translateY: '-50%' }, { translateX: '-50%' }] }}>
          {children(i)}
        </View>
      ))}
    </>
  );
}

function Clasico() {
  return (
    <>
      <Rect inset={10} grosor={2.5} color={TINTA} />
      <Rect inset={16} grosor={1} color={ORO} />
      <Rombo style={{ top: 8, left: 8 }} />
      <Rombo style={{ top: 8, right: 8 }} />
      <Rombo style={{ bottom: 8, left: 8 }} />
      <Rombo style={{ bottom: 8, right: 8 }} />
    </>
  );
}

/** Friso de tercios de pie sobre el borde de arriba y de abajo; chapas en las esquinas. */
function Tercios() {
  const alto = 26;
  return (
    <>
      <Rect inset={30} grosor={2.5} color={TINTA} />
      <Rect inset={36} grosor={1} color={ORO} />
      <Fila n={12} desde={40} hasta={W - 40} y={30 - alto + 1}>
        {(i) => <Tercio alto={alto} color={i % 2 ? AMBAR_OSCURO : '#4A6B2A'} />}
      </Fila>
      <Fila n={12} desde={40} hasta={W - 40} y={H - 30 + 2}>
        {(i) => <Tercio alto={alto} color={i % 2 ? '#4A6B2A' : AMBAR_OSCURO} />}
      </Fila>
      {[
        { top: 14, left: 14 },
        { top: 14, right: 14 },
        { bottom: 14, left: 14 },
        { bottom: 14, right: 14 },
      ].map((pos, i) => (
        <View key={i} style={[{ position: 'absolute' }, pos]}>
          <ChapaMini d={22} />
        </View>
      ))}
    </>
  );
}

/** Todo el perimetro rematado con chapas, como una guirnalda de corcholatas. */
function Chapas() {
  const d = 15;
  return (
    <>
      <Rect inset={24} grosor={1.5} color={AMBAR_OSCURO} />
      <Rect inset={12 + d / 2 + 4} grosor={0} color="transparent" />
      <Fila n={11} desde={16} hasta={W - 16} y={12 - d / 2 + 4}>
        {(i) => <ChapaMini d={d} color={i % 2 ? AMBAR : '#E3B04A'} />}
      </Fila>
      <Fila n={11} desde={16} hasta={W - 16} y={H - 12 - d / 2 - 4}>
        {(i) => <ChapaMini d={d} color={i % 2 ? '#E3B04A' : AMBAR} />}
      </Fila>
      <Columna n={9} desde={26} hasta={H - 26} x={19}>
        {(i) => <ChapaMini d={d} color={i % 2 ? AMBAR : '#E3B04A'} />}
      </Columna>
      <Columna n={9} desde={26} hasta={H - 26} x={W - 19}>
        {(i) => <ChapaMini d={d} color={i % 2 ? '#E3B04A' : AMBAR} />}
      </Columna>
    </>
  );
}

/** Un vaso: borde ambar grueso con espuma desbordando por arriba. */
function Espuma() {
  // Semilla fija: la espuma no cambia de forma entre pintados ni en el PNG.
  let s = 11;
  const azar = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const burbujas = Array.from({ length: 26 }, (_, i) => ({ x: 10 + (i * (W - 20)) / 25, r: 6 + azar() * 6, y: 2 + azar() * 5 }));
  return (
    <>
      <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 8, right: 8, bottom: 8, backgroundColor: AMBAR, borderRadius: 8 }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 8, right: 8, bottom: 8, borderRadius: 8, borderWidth: 2, borderColor: AMBAR_OSCURO }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 24, left: 20, right: 20, bottom: 20, backgroundColor: '#FBF3DF', borderRadius: 3, borderWidth: 1, borderColor: AMBAR_OSCURO }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 24, left: 12, width: 2.5, bottom: 26, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2 }} />
      {burbujas.map((b, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: 'absolute', left: b.x - b.r, top: b.y, width: b.r * 2, height: b.r * 2, borderRadius: b.r, backgroundColor: ESPUMA, borderWidth: 1, borderColor: '#EBDDB4' }}
        />
      ))}
    </>
  );
}

/** Una espiga de cebada: tallo y granos a los dos lados. */
function Espiga({ rotar, style }: { rotar: number; style: object }) {
  const granos = [0, 1, 2, 3, 4];
  return (
    <View style={[{ position: 'absolute', width: 40, height: 56, alignItems: 'center', transform: [{ rotate: `${rotar}deg` }] }, style]}>
      <View style={{ position: 'absolute', bottom: 0, width: 2, height: 52, backgroundColor: ORO, borderRadius: 1 }} />
      {granos.map((g) => (
        <View key={g} style={{ position: 'absolute', top: g * 8, width: 40, height: 12, alignItems: 'center' }}>
          <View style={{ position: 'absolute', left: 8, width: 8, height: 15, borderRadius: 8, backgroundColor: AMBAR, transform: [{ rotate: '-32deg' }] }} />
          <View style={{ position: 'absolute', right: 8, width: 8, height: 15, borderRadius: 8, backgroundColor: AMBAR, transform: [{ rotate: '32deg' }] }} />
        </View>
      ))}
      <View style={{ position: 'absolute', top: -6, width: 6, height: 14, borderRadius: 6, backgroundColor: AMBAR_OSCURO }} />
    </View>
  );
}

/** Doble marco con una espiga de cebada en cada esquina. */
function Cebada() {
  return (
    <>
      <Rect inset={12} grosor={2} color={TINTA} />
      <Rect inset={18} grosor={1} color={ORO} />
      <Espiga rotar={135} style={{ top: -8, left: -6 }} />
      <Espiga rotar={-135} style={{ top: -8, right: -6 }} />
      <Espiga rotar={45} style={{ bottom: -8, left: -6 }} />
      <Espiga rotar={-45} style={{ bottom: -8, right: -6 }} />
    </>
  );
}

/** Marco de etiqueta de cerveza: filete rojo, perlas y esquinas achaflanadas. */
function Etiqueta() {
  const perlasX = Array.from({ length: 33 }, (_, i) => 22 + (i * (W - 44)) / 32);
  const perlasY = Array.from({ length: 27 }, (_, i) => 22 + (i * (H - 44)) / 26);
  return (
    <>
      <Rect inset={10} grosor={3} color={ROJO} radio={4} />
      <Rect inset={15} grosor={1} color={ROJO} radio={2} />
      {perlasX.flatMap((x, i) => [
        <View key={`a${i}`} pointerEvents="none" style={{ position: 'absolute', left: x - 1.5, top: 19.5, width: 3, height: 3, borderRadius: 2, backgroundColor: ORO }} />,
        <View key={`b${i}`} pointerEvents="none" style={{ position: 'absolute', left: x - 1.5, bottom: 19.5, width: 3, height: 3, borderRadius: 2, backgroundColor: ORO }} />,
      ])}
      {perlasY.flatMap((y, i) => [
        <View key={`c${i}`} pointerEvents="none" style={{ position: 'absolute', top: y - 1.5, left: 19.5, width: 3, height: 3, borderRadius: 2, backgroundColor: ORO }} />,
        <View key={`d${i}`} pointerEvents="none" style={{ position: 'absolute', top: y - 1.5, right: 19.5, width: 3, height: 3, borderRadius: 2, backgroundColor: ORO }} />,
      ])}
      {[
        { top: 3, left: 3 },
        { top: 3, right: 3 },
        { bottom: 3, left: 3 },
        { bottom: 3, right: 3 },
      ].map((pos, i) => (
        <View key={i} style={[{ position: 'absolute' }, pos]}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FBF3DF', borderWidth: 2.5, borderColor: ROJO, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, color: ORO, fontWeight: '900', lineHeight: 14 }}>★</Text>
          </View>
        </View>
      ))}
    </>
  );
}

/** Nueve chapas numeradas sobre el borde de abajo: una por cada bar de la ruta. */
function Nueve() {
  return (
    <>
      <Rect inset={12} grosor={2.5} color={TINTA} />
      <Rect inset={18} grosor={1} color={ORO} />
      <Rombo style={{ top: 10, left: 10 }} />
      <Rombo style={{ top: 10, right: 10 }} />
      <Fila n={9} desde={26} hasta={W - 26} y={H - 12 - 10}>
        {(i) => <ChapaMini d={20} color={VERDE} texto={String(i + 1)} />}
      </Fila>
    </>
  );
}

const FIGURAS: Record<VarianteMarco, () => ReactNode> = {
  clasico: Clasico,
  tercios: Tercios,
  chapas: Chapas,
  espuma: Espuma,
  cebada: Cebada,
  etiqueta: Etiqueta,
  nueve: Nueve,
};

/** El marco de una mitad del diploma. Ocupa toda la mitad y no recibe toques. */
export function MarcoDiploma({ variante }: { variante: VarianteMarco }) {
  const Figura = FIGURAS[variante];
  return (
    <View pointerEvents="none" style={abs}>
      <Figura />
    </View>
  );
}

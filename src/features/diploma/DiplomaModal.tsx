import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Banner, Button } from '../../components/ui';
import { space } from '../../lib/theme';
import { Diploma } from './Diploma';
import type { ParadaMapa } from './MapaEstatico';
import {
  PUEDE_EXPORTAR,
  compartirImagen,
  descargarImagen,
  diplomaABlob,
  puedeCompartirFicheros,
} from './exportar';
import { DIPLOMA_ALTO, DIPLOMA_ANCHO, nombreFicheroDiploma } from './textoDiploma';

/**
 * Enseña el diploma a pantalla casi completa sobre un fondo oscuro y, donde se
 * puede (la web y la PWA), lo comparte o descarga como PNG de 1080 x 1920.
 *
 * La vista previa se escala con un transform en un contenedor PADRE del
 * diploma: el nodo que se exporta (`ref`) queda a su tamano de diseno.
 */
const ESPACIO_BOTONES = 150;

export function DiplomaModal({
  visible,
  onClose,
  nombre,
  ruta,
  foto,
  paradas,
}: {
  visible: boolean;
  onClose: () => void;
  nombre: string;
  ruta: string;
  foto: string | null;
  paradas: readonly ParadaMapa[];
}) {
  const { width, height } = useWindowDimensions();
  const diplomaRef = useRef<View>(null);
  const [preparando, setPreparando] = useState<'compartir' | 'guardar' | null>(null);
  // Donde hay hoja de compartir con ficheros (el movil), compartir es lo principal
  // y guardar queda de apoyo; en escritorio lo unico util es guardar.
  const puedeCompartir = PUEDE_EXPORTAR && puedeCompartirFicheros();
  const [aviso, setAviso] = useState<{ tono: 'error' | 'success'; texto: string } | null>(null);

  const escala = Math.max(
    0.3,
    Math.min((width - 32) / DIPLOMA_ANCHO, (height - ESPACIO_BOTONES) / DIPLOMA_ALTO, 1.6),
  );

  async function generarYHacer(accion: 'compartir' | 'guardar') {
    if (preparando) return;
    setPreparando(accion);
    setAviso(null);
    try {
      const blob = await diplomaABlob(diplomaRef.current);
      const nombreFichero = nombreFicheroDiploma(ruta);
      if (accion === 'compartir') {
        await compartirImagen(blob, nombreFichero);
      } else {
        descargarImagen(blob, nombreFichero);
        setAviso({ tono: 'success', texto: 'Imagen guardada en tu dispositivo.' });
      }
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof Error ? e.message : 'No se pudo generar la imagen.' });
    } finally {
      setPreparando(null);
    }
  }

  function cerrar() {
    setAviso(null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <View style={styles.fondo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cerrar} accessibilityLabel="Cerrar" />
        <View style={styles.centro} pointerEvents="box-none">
          {/* Caja del tamano ya escalado; dentro, el diploma a su tamano de diseno
              con el zoom aplicado desde su centro. */}
          <View
            style={{ width: DIPLOMA_ANCHO * escala, height: DIPLOMA_ALTO * escala }}
            accessibilityLabel={`Diploma de ${nombre}: ${ruta}`}
          >
            <View
              style={{
                position: 'absolute',
                left: (-DIPLOMA_ANCHO * (1 - escala)) / 2,
                top: (-DIPLOMA_ALTO * (1 - escala)) / 2,
                transform: [{ scale: escala }],
              }}
            >
              <Diploma ref={diplomaRef} nombre={nombre} ruta={ruta} foto={foto} paradas={paradas} />
            </View>
          </View>

          <View style={styles.acciones}>
            {aviso ? <Banner tone={aviso.tono}>{aviso.texto}</Banner> : null}
            {puedeCompartir ? (
              <Button
                title="Compartir imagen"
                icon="share-outline"
                onPress={() => generarYHacer('compartir')}
                loading={preparando === 'compartir'}
                disabled={preparando !== null}
              />
            ) : null}
            {PUEDE_EXPORTAR ? (
              <Button
                title="Guardar imagen"
                icon="download-outline"
                variant={puedeCompartir ? 'secondary' : 'primary'}
                onPress={() => generarYHacer('guardar')}
                loading={preparando === 'guardar'}
                disabled={preparando !== null}
              />
            ) : null}
            <Button title="Cerrar" variant="ghost" textStyle={styles.textoCerrar} onPress={cerrar} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(20, 14, 8, 0.86)' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.md },
  acciones: { gap: space.sm, alignItems: 'stretch', minWidth: 220 },
  textoCerrar: { color: '#F3E1C6' },
});

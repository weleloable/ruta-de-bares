import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Banner, Button } from '../../components/ui';
import { space } from '../../lib/theme';
import { Diploma } from './Diploma';
import type { ParadaMapa } from './MapaEstatico';
import {
  PUEDE_EXPORTAR,
  abrirCamaraDeStories,
  compartirImagen,
  copiarTexto,
  descargarImagen,
  diplomaABlob,
  puedeCompartirFicheros,
  puedeStory,
} from './exportar';
import { CUENTA_INSTAGRAM, DIPLOMA_ALTO, DIPLOMA_ANCHO, nombreFicheroDiploma } from './textoDiploma';

/**
 * Ensena el diploma a pantalla casi completa sobre un fondo oscuro y, donde se
 * puede (la web y la PWA), lo comparte, descarga como PNG de 1080 x 1920 o lo
 * lleva a una historia de Instagram.
 *
 * La vista previa se escala con un transform en un contenedor PADRE del
 * diploma: el nodo que se exporta (`ref`) queda a su tamano de diseno.
 */
const ESPACIO_BOTONES = 190;
/** Lo que se espera tras abrir para preparar la imagen (deja pintar el diploma y las teselas). */
const ESPERA_PREPARAR_MS = 1200;

type Accion = 'compartir' | 'guardar' | 'story';

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
  const [preparando, setPreparando] = useState<Accion | null>(null);
  // Donde hay hoja de compartir con ficheros (el movil), compartir es lo principal
  // y guardar queda de apoyo; en escritorio lo unico util es guardar.
  const puedeCompartir = PUEDE_EXPORTAR && puedeCompartirFicheros();
  const conStory = PUEDE_EXPORTAR && puedeStory();
  const [aviso, setAviso] = useState<{ texto: string } | null>(null);

  // La imagen se genera al abrir y se guarda: el menu de compartir del sistema
  // exige que se abra INMEDIATAMENTE tras el toque (Safari lo rechaza si antes
  // hay una espera de un segundo generando el PNG).
  const imagen = useRef<Blob | null>(null);
  useEffect(() => {
    if (!visible || !PUEDE_EXPORTAR) return undefined;
    let vivo = true;
    const temporizador = setTimeout(() => {
      diplomaABlob(diplomaRef.current)
        .then((blob) => {
          if (vivo) imagen.current = blob;
        })
        .catch(() => {
          // Sin preparar: al pulsar se genera en el momento, solo que mas lento.
        });
    }, ESPERA_PREPARAR_MS);
    return () => {
      vivo = false;
      clearTimeout(temporizador);
      imagen.current = null;
    };
  }, [visible]);

  const escala = Math.max(
    0.3,
    Math.min((width - 32) / DIPLOMA_ANCHO, (height - ESPACIO_BOTONES) / DIPLOMA_ALTO, 1.6),
  );

  async function hacer(accion: Accion) {
    if (preparando) return;
    setPreparando(accion);
    setAviso(null);
    // Story deja @rutadebaresoficial en el portapapeles por si se quiere pegar como
    // pegatina de texto (el diploma ya lo lleva escrito). Solo se deja tocar el
    // portapapeles dentro del propio toque: se pide ANTES de esperar a nada.
    if (accion === 'story') void copiarTexto(CUENTA_INSTAGRAM);
    try {
      const blob = imagen.current ?? (await diplomaABlob(diplomaRef.current));
      imagen.current = blob;
      const nombreFichero = nombreFicheroDiploma(ruta);

      // Sin globos de exito: el propio sistema ya lo muestra (menu de compartir,
      // descarga, Instagram abriendose) y el texto no daba tiempo a leerlo.
      if (accion === 'compartir') {
        await compartirImagen(blob, nombreFichero);
      } else if (accion === 'guardar') {
        descargarImagen(blob, nombreFichero);
      } else if (puedeCompartir) {
        await compartirImagen(blob, nombreFichero);
      } else {
        descargarImagen(blob, nombreFichero);
        setTimeout(abrirCamaraDeStories, 700);
      }
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : 'No se pudo generar la imagen.' });
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
            {/* Solo errores: un fallo hay que verlo, un exito ya se nota. */}
            {aviso ? <Banner tone="error">{aviso.texto}</Banner> : null}
            {PUEDE_EXPORTAR ? (
              <View style={styles.fila}>
                {puedeCompartir ? (
                  <Button
                    title="Compartir"
                    icon="share-outline"
                    style={styles.enFila}
                    textStyle={styles.textoEnFila}
                    onPress={() => hacer('compartir')}
                    loading={preparando === 'compartir'}
                    disabled={preparando !== null}
                  />
                ) : null}
                {conStory ? (
                  <Button
                    title="Story"
                    icon="logo-instagram"
                    variant={puedeCompartir ? 'secondary' : 'primary'}
                    style={styles.enFila}
                    textStyle={styles.textoEnFila}
                    onPress={() => hacer('story')}
                    loading={preparando === 'story'}
                    disabled={preparando !== null}
                  />
                ) : (
                  // Guardar solo donde no hay Story: en el movil Story ya guarda la
                  // imagen (o abre el menu de compartir, que tambien la guarda).
                  <Button
                    title="Guardar imagen"
                    icon="download-outline"
                    variant={puedeCompartir ? 'secondary' : 'primary'}
                    style={styles.enFila}
                    textStyle={styles.textoEnFila}
                    onPress={() => hacer('guardar')}
                    loading={preparando === 'guardar'}
                    disabled={preparando !== null}
                  />
                )}
              </View>
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
  acciones: { gap: space.sm, alignItems: 'stretch', minWidth: 260, maxWidth: 380 },
  // Guardar y Story lado a lado, del mismo ancho.
  fila: { flexDirection: 'row', gap: space.sm },
  enFila: { flex: 1, paddingHorizontal: space.sm },
  // Mas pequena que la de un boton entero, para que "Guardar imagen" no se parta en dos lineas.
  textoEnFila: { fontSize: 14 },
  textoCerrar: { color: '#F3E1C6' },
});

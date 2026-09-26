import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, EmptyState, Loading } from '../../components/ui';
import { colors, space, typography } from '../../lib/theme';
import type { MaestroBeerRow } from '../../types/database';
import { borrarCerveza, listarCervezas } from './api';
import { buscarMalta, type MaltaId } from './juegos/maestro/datos';
import { VasoCerveza } from './juegos/maestro/VasoCerveza';

const POR_PAGINA = 30;

/**
 * Las cervezas de Maestro Cervecero de UNA ruta: las de toda la gente, o solo
 * las tuyas. Borrar pide una segunda pulsacion: es una accion sin vuelta atras
 * y en web `Alert` no tiene botones.
 */
export function ListaCervezas({ rutaId }: { rutaId: string }) {
  const [soloMias, setSoloMias] = useState(false);
  const [cervezas, setCervezas] = useState<MaestroBeerRow[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const cargar = useCallback(
    async (desde: number) => {
      setCargando(true);
      setError(null);
      try {
        const nuevas = await listarCervezas(rutaId, { limite: POR_PAGINA, desplazamiento: desde, soloMias });
        setCervezas((previas) => (desde === 0 ? nuevas : [...(previas ?? []), ...nuevas]));
        setHayMas(nuevas.length === POR_PAGINA);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudieron cargar las cervezas.');
      } finally {
        setCargando(false);
      }
    },
    [rutaId, soloMias],
  );

  useEffect(() => {
    setCervezas(null);
    void cargar(0);
  }, [cargar]);

  const borrar = async (id: string) => {
    setConfirmando(null);
    try {
      await borrarCerveza(id);
      setCervezas((previas) => (previas ?? []).filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.');
    }
  };

  return (
    <View style={styles.raiz}>
      <View style={styles.pestanas}>
        <View style={styles.pestana}>
          <Button title="De la ruta" variant={soloMias ? 'secondary' : 'primary'} onPress={() => setSoloMias(false)} />
        </View>
        <View style={styles.pestana}>
          <Button title="Mías" variant={soloMias ? 'primary' : 'secondary'} onPress={() => setSoloMias(true)} />
        </View>
      </View>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {cervezas === null && !error ? <Loading label="Cargando las cervezas..." /> : null}

      {cervezas && cervezas.length === 0 ? (
        <EmptyState
          title={soloMias ? 'Aún no has hecho ninguna' : 'Todavía no hay cervezas'}
          body="Las que se hagan en Maestro Cervecero saldrán aquí."
        />
      ) : null}

      {cervezas?.map((c) => (
        <Card key={c.id} style={styles.tarjeta}>
          <View style={styles.fila}>
            <VasoCerveza color={buscarMalta(c.malta as MaltaId)?.color ?? colors.beer} alto={64} ancho={40} />
            <View style={styles.textos}>
              <Text style={typography.cardTitle} numberOfLines={2}>{c.name}</Text>
              <Text style={typography.muted}>
                {c.estilo} · {String(c.abv).replace('.', ',')} % · {c.ibu} IBU · {c.cuerpo}
              </Text>
              <Text style={typography.muted}>{c.is_mine ? 'Tuya' : `De ${c.display_name}`}</Text>
            </View>
            <Text style={styles.nota}>{c.score}</Text>
          </View>
          {c.is_mine ? (
            confirmando === c.id ? (
              <View style={styles.confirmar}>
                <View style={styles.pestana}>
                  <Button title="Sí, borrar" variant="danger" onPress={() => void borrar(c.id)} />
                </View>
                <View style={styles.pestana}>
                  <Button title="Cancelar" variant="secondary" onPress={() => setConfirmando(null)} />
                </View>
              </View>
            ) : (
              <Button title="Borrar" variant="ghost" onPress={() => setConfirmando(c.id)} />
            )
          ) : null}
        </Card>
      ))}

      {hayMas ? (
        <Button title="Ver más" variant="secondary" loading={cargando} onPress={() => void cargar(cervezas?.length ?? 0)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.sm },
  pestanas: { flexDirection: 'row', gap: space.sm },
  pestana: { flex: 1 },
  tarjeta: { gap: space.sm },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  textos: { flex: 1, gap: 2 },
  nota: { fontSize: 24, fontWeight: '800', color: colors.beerDark },
  confirmar: { flexDirection: 'row', gap: space.sm },
});

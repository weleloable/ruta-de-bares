import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, EmptyState, Loading } from '../../src/components/ui';
import {
  listarModeraciones,
  reactivarCuenta,
  retirarVetoCana,
  retirarVetoRuta,
} from '../../src/features/admin/api';
import { hace } from '../../src/features/admin/alertas';
import {
  agruparModeraciones,
  etiquetaAccion,
  filtrarModeraciones,
  type FiltroModeracion,
  type Moderacion,
} from '../../src/features/admin/moderaciones';
import { DialogoConfirmar } from '../../src/features/profile/DialogoConfirmar';
import { colors, radius, space, typography } from '../../src/lib/theme';

/**
 * Que veto se esta retirando. Un miembro por `que` y no `'cana' | 'cuenta'`
 * juntos: asi TypeScript estrecha la union y sabe que solo la de ruta trae
 * `routeId`.
 */
type Retirada =
  | { que: 'cana'; persona: Moderacion }
  | { que: 'cuenta'; persona: Moderacion }
  | { que: 'ruta'; persona: Moderacion; routeId: string; routeName: string };

/**
 * A quien se ha moderado: lo que sigue puesto y lo que se hizo en su dia.
 *
 * Existe porque un veto solo se podia levantar desde el ticket de la denuncia
 * que lo origino, y ese ticket puede estar cerrado hace meses o haber
 * desaparecido con la cuenta. El art. 20 del DSA da seis meses para reclamar:
 * tiene que haber siempre un sitio desde el que deshacer una sancion.
 *
 * Solo para admins, y lo protege el servidor (`match_admin_require`), no esta
 * pantalla.
 */
export default function ModeracionAdmin() {
  const [moderaciones, setModeraciones] = useState<Moderacion[]>([]);
  const [filtro, setFiltro] = useState<FiltroModeracion>('vigentes');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [retirando, setRetirando] = useState<Retirada | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setModeraciones(agruparModeraciones(await listarModeraciones()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la moderación.');
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const retirar = useCallback(async () => {
    if (!retirando) return;
    setOcupado(true);
    try {
      if (retirando.que === 'ruta') {
        // El veto de ruta se retira aunque la cuenta ya no exista: la fila
        // guarda el id de entonces (0017), que es lo que se le pasa.
        await retirarVetoRuta(retirando.persona.userId ?? '', retirando.routeId);
      } else if (retirando.persona.userId) {
        if (retirando.que === 'cana') await retirarVetoCana(retirando.persona.userId);
        else await reactivarCuenta(retirando.persona.userId);
      }
      setAviso('Veto retirado. Se le ha avisado.');
      setError(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo retirar el veto.');
    } finally {
      setOcupado(false);
      setRetirando(null);
    }
  }, [retirando, cargar]);

  const visibles = filtrarModeraciones(moderaciones, filtro);
  // Fuera del JSX para que TypeScript estreche la union por `que`.
  const mensajeRetirar = !retirando
    ? ''
    : retirando.que === 'cuenta'
      ? `${retirando.persona.nombre} podrá volver a entrar en rutas. Necesitará que le inviten otra vez.`
      : retirando.que === 'cana'
        ? `${retirando.persona.nombre} podrá volver a activar su caña. No se le activa sola.`
        : `${retirando.persona.nombre} podrá volver a entrar en «${retirando.routeName}» si le invitan.`;

  if (cargando && moderaciones.length === 0) return <Loading label="Buscando moderaciones..." />;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colors.beer} />}
      >
        {error ? <Banner tone="error">{error}</Banner> : null}
        {aviso ? <Banner tone="success">{aviso}</Banner> : null}

        <View style={styles.filtros}>
          {([
            ['vigentes', 'Con algo puesto'],
            ['todas', 'Todas'],
          ] as const).map(([id, etiqueta]) => {
            const elegido = id === filtro;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: elegido }}
                onPress={() => setFiltro(id)}
                style={[styles.filtro, elegido && styles.filtroElegido]}
              >
                <Text style={[styles.filtroTexto, elegido && styles.filtroTextoElegido]}>
                  {etiqueta} {filtrarModeraciones(moderaciones, id).length}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {visibles.length === 0 ? (
          <EmptyState
            title={filtro === 'vigentes' ? 'Nada puesto ahora mismo' : 'Aquí no ha pasado nada'}
            body="Aparecerá quien tenga un veto puesto y quien haya recibido alguna medida, aunque ya se le haya levantado."
          />
        ) : (
          visibles.map((persona) => (
            <FichaPersona
              key={persona.clave}
              persona={persona}
              ocupado={ocupado}
              onRetirar={setRetirando}
            />
          ))
        )}
      </ScrollView>

      <DialogoConfirmar
        visible={retirando !== null}
        titulo="¿Retirar el veto?"
        mensaje={mensajeRetirar}
        textoConfirmar="Retirar"
        ocupado={ocupado}
        onConfirmar={() => void retirar()}
        onCancelar={() => setRetirando(null)}
      />
    </SafeAreaView>
  );
}

function FichaPersona({
  persona,
  ocupado,
  onRetirar,
}: {
  persona: Moderacion;
  ocupado: boolean;
  onRetirar(retirada: Retirada): void;
}) {
  return (
    <Card>
      <View style={styles.cabecera}>
        <Text style={styles.nombre}>{persona.nombre}</Text>
        <Text style={styles.cuando}>{hace(persona.ultima, new Date())}</Text>
      </View>
      {persona.userId ? null : (
        <Text style={typography.muted}>Ha borrado su cuenta. Solo queda lo que se le dejó puesto.</Text>
      )}

      {persona.suspension ? (
        <View style={styles.veto}>
          <Text style={styles.vetoTitulo}>Cuenta suspendida</Text>
          <Text style={styles.vetoMotivo}>«{persona.suspension.motivo}»</Text>
          <Button
            title="Levantar la suspensión"
            variant="secondary"
            disabled={ocupado || !persona.userId}
            onPress={() => onRetirar({ que: 'cuenta', persona })}
          />
        </View>
      ) : null}

      {persona.vetoCana ? (
        <View style={styles.veto}>
          <Text style={styles.vetoTitulo}>Caña desactivada</Text>
          <Text style={styles.vetoMotivo}>«{persona.vetoCana.motivo}»</Text>
          <Button
            title="Retirar el veto de la caña"
            variant="secondary"
            disabled={ocupado || !persona.userId}
            onPress={() => onRetirar({ que: 'cana', persona })}
          />
        </View>
      ) : null}

      {persona.vetosRuta.map((veto) => (
        <View key={veto.routeId} style={styles.veto}>
          <Text style={styles.vetoTitulo}>Expulsada de «{veto.routeName}»</Text>
          <Text style={styles.vetoMotivo}>«{veto.motivo}»</Text>
          <Button
            title="Retirar el veto de la ruta"
            variant="secondary"
            disabled={ocupado}
            onPress={() =>
              onRetirar({ que: 'ruta', persona, routeId: veto.routeId, routeName: veto.routeName })
            }
          />
        </View>
      ))}

      {persona.historial.length > 0 ? (
        <View style={styles.historial}>
          <Text style={typography.overline}>Lo que se hizo</Text>
          {persona.historial.map((apunte, indice) => (
            <Text key={`${apunte.accion}-${indice}`} style={styles.apunte}>
              {etiquetaAccion(apunte.accion)} · {hace(apunte.cuando, new Date())}
              {apunte.nota ? ` · «${apunte.nota}»` : ''}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  filtros: { flexDirection: 'row', gap: space.sm },
  filtro: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filtroElegido: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  filtroTexto: { color: colors.inkSoft, fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'] },
  filtroTextoElegido: { color: colors.white },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nombre: { ...typography.cardTitle },
  cuando: { fontSize: 12, color: colors.inkFaint },
  veto: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.paperDeep,
    gap: space.sm,
  },
  vetoTitulo: { fontSize: 14, fontWeight: '800', color: colors.ink },
  vetoMotivo: { fontSize: 14, color: colors.inkSoft, fontStyle: 'italic' },
  historial: { marginTop: space.sm, gap: 2 },
  apunte: { fontSize: 12, color: colors.inkFaint },
});

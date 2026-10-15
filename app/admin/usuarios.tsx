import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Card, EmptyState, Field, Loading } from '../../src/components/ui';
import { listarCuentasBorradas, listarUsuarios, type CuentaBorrada, type Usuario } from '../../src/features/admin/usuarios';
import { agruparPorCasa } from '../../src/features/casas/agruparPorCasa';
import { CASAS, esCasa, ORDEN_CASAS } from '../../src/features/casas/casas';
import { Escudo } from '../../src/features/casas/Escudo';
import { diaCorto } from '../../src/lib/fechas';
import { colors, radius, space, typography } from '../../src/lib/theme';

/**
 * Todas las cuentas, con su correo (0068), agrupadas por casa. Desde la ficha
 * de cada una se sella a mano y se borra la cuenta, sin abrir Supabase.
 *
 * Solo para admins, y lo protege el servidor (`match_admin_require`), no esta
 * pantalla.
 */
export default function UsuariosAdmin() {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [borradas, setBorradas] = useState<CuentaBorrada[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Solo cuenta la respuesta de la ULTIMA busqueda: una lenta que llega tarde
  // pisaria la lista de lo que se esta escribiendo ahora.
  const ultima = useRef(0);
  const buscar = useCallback(async (texto: string) => {
    const esta = ++ultima.current;
    try {
      const lista = await listarUsuarios(texto);
      if (esta !== ultima.current) return;
      setUsuarios(lista);
      setError(null);
    } catch (e) {
      if (esta !== ultima.current) return;
      setError(e instanceof Error ? e.message : 'No se pudo leer la lista.');
    }
  }, []);

  // `vuelta` sube al volver de una ficha (donde se pudo borrar la cuenta o
  // sellar): la lista se rehace con la busqueda que hubiera.
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => void buscar(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda, buscar, vuelta]);

  useFocusEffect(
    useCallback(() => {
      setVuelta((v) => v + 1);
      listarCuentasBorradas()
        .then(setBorradas)
        .catch(() => setBorradas([]));
    }, []),
  );

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
        <Field
          label="Buscar"
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Nombre o correo"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {error ? <Banner tone="error">{error}</Banner> : null}

        {usuarios === null ? (
          <Loading />
        ) : usuarios.length === 0 ? (
          <EmptyState title="Nadie" body="Ninguna cuenta coincide con la búsqueda." />
        ) : (
          <>
            <Text style={typography.muted}>
              {usuarios.length >= 300
                ? 'Salen las 300 primeras: busca por nombre o correo para encontrar el resto.'
                : `${usuarios.length} ${usuarios.length === 1 ? 'cuenta' : 'cuentas'}`}
            </Text>
            {agruparPorCasa(usuarios, ORDEN_CASAS).map((grupo) => (
              <View key={grupo.casa ?? 'sin-casa'} style={styles.grupo}>
                <View style={styles.grupoCabecera}>
                  {grupo.casa && esCasa(grupo.casa) ? <Escudo casa={grupo.casa} tamano={20} /> : null}
                  <Text style={styles.grupoTitulo}>
                    {grupo.casa && esCasa(grupo.casa) ? CASAS[grupo.casa].nombre : 'Sin casa'}
                  </Text>
                  <Text style={styles.grupoCuenta}>{grupo.personas.length}</Text>
                </View>
                {grupo.personas.map((u) => (
                  <Pressable
                    key={u.user_id}
                    accessibilityRole="button"
                    // Solo el id en la URL: el correo acabaria en el historial del navegador.
                    onPress={() => router.push({ pathname: '/admin/usuario/[userId]', params: { userId: u.user_id } })}
                    style={({ pressed }) => [styles.fila, pressed && styles.pulsada]}
                  >
                    <View style={styles.filaTextos}>
                      <Text style={styles.nombre}>
                        {u.nombre}
                        {u.rol === 'admin' ? <Text style={styles.admin}>{'  ADMIN'}</Text> : null}
                      </Text>
                      <Text style={styles.email} numberOfLines={1}>
                        {u.email ?? 'sin correo'}
                      </Text>
                    </View>
                    <Text style={styles.sub}>{`${u.rutas} ${u.rutas === 1 ? 'ruta' : 'rutas'}\ndesde ${diaCorto(new Date(u.alta))}`}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </>
        )}

        {borradas.length > 0 ? (
          <Card style={styles.tarjeta}>
            <Text style={typography.sectionTitle}>Cuentas borradas desde aquí</Text>
            {borradas.map((b, i) => (
              <Text key={i} style={styles.borrada}>
                {`${diaCorto(new Date(b.el))} · ${b.nombre}: «${b.motivo}»${b.por ? ` (${b.por})` : ''}`}
              </Text>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  grupo: { gap: space.xs, marginTop: space.sm },
  grupoCabecera: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  grupoTitulo: { ...typography.sectionTitle, flex: 1 },
  grupoCuenta: { fontSize: 12, color: colors.inkSoft, fontWeight: '700' },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pulsada: { opacity: 0.7 },
  filaTextos: { flex: 1, minWidth: 0 },
  nombre: { fontSize: 15, fontWeight: '700', color: colors.ink },
  admin: { fontSize: 10, fontWeight: '900', color: colors.beerDark, letterSpacing: 0.5 },
  email: { fontSize: 13, color: colors.inkSoft },
  sub: { fontSize: 11, color: colors.inkSoft, textAlign: 'right' },
  tarjeta: { gap: space.sm, marginTop: space.lg },
  borrada: { fontSize: 12, color: colors.ink },
});

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field, Loading } from '../../../src/components/ui';
import { Chips } from '../../../src/features/casas/panel/piezas';
import {
  borrarCuenta,
  meterEnRuta,
  obtenerUsuario,
  sellarAMano,
  sellosDeUsuario,
  type Usuario,
} from '../../../src/features/admin/usuarios';
import { estadoPlazo, type RutaConSellos, type SelloFila } from '../../../src/features/admin/usuariosReglas';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { CASAS, esCasa } from '../../../src/features/casas/casas';
import { DialogoConfirmar } from '../../../src/features/profile/DialogoConfirmar';
import { listRoutes } from '../../../src/features/routes/api';
import { desdeFechaISO, diaCorto, hora, ventana } from '../../../src/lib/fechas';
import { colors, radius, space, typography } from '../../../src/lib/theme';
import type { RouteRow } from '../../../src/types/database';

/**
 * Ficha de una cuenta para admins (0068): quien es (con su correo), sus sellos
 * en cada ruta con la opcion de sellar a mano, y borrar la cuenta.
 *
 * Sellar a mano se salta horario y radio, no la pertenencia: lo decide
 * `admin_sellar` en el servidor. Borrar NO es sancionar (para eso esta
 * suspender, que deja leer el motivo y reclamar): es para cuentas de prueba o
 * cuando la persona lo pide.
 */
export default function UsuarioAdmin() {
  const router = useRouter();
  const { session } = useAuth();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [rutas, setRutas] = useState<RutaConSellos[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const [sellando, setSellando] = useState<SelloFila | null>(null);
  const [motivoSello, setMotivoSello] = useState('');
  const [motivoBorrar, setMotivoBorrar] = useState('');
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  // Meter en una ruta (0069): las rutas que hay y la elegida.
  const [rutasTodas, setRutasTodas] = useState<RouteRow[]>([]);
  const [rutaElegida, setRutaElegida] = useState<string | null>(null);
  const [confirmarMeter, setConfirmarMeter] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [cuenta, sellos] = await Promise.all([obtenerUsuario(userId), sellosDeUsuario(userId)]);
      setUsuario(cuenta);
      setRutas(sellos);
      setError(null);
    } catch (e) {
      setUsuario(null);
      setRutas(null);
      setError(e instanceof Error ? e.message : 'No se pudo leer la cuenta.');
    }
  }, [userId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useEffect(() => {
    listRoutes()
      .then(setRutasTodas)
      .catch(() => setRutasTodas([]));
  }, []);

  async function meter() {
    const ruta = rutasTodas.find((r) => r.id === rutaElegida);
    if (!ruta || !usuario) return;
    setOcupado(true);
    setError(null);
    // Sin esto, un fallo tras un exito dejaba el aviso verde viejo junto al rojo nuevo.
    setHecho(null);
    try {
      const r = await meterEnRuta(userId, ruta.id);
      setHecho(
        r.yaEstaba
          ? `${usuario.nombre} ya estaba en ${ruta.name}.`
          : `${usuario.nombre} ya está en ${ruta.name}${r.casa ? ` y es de ${CASAS[r.casa as keyof typeof CASAS]?.nombre ?? r.casa}` : ''}.`,
      );
      setRutaElegida(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo meter en la ruta.');
    } finally {
      setConfirmarMeter(false);
      setOcupado(false);
    }
  }

  async function sellar() {
    if (!sellando) return;
    setOcupado(true);
    setError(null);
    try {
      await sellarAMano(userId, sellando.route_bar_id, motivoSello);
      setHecho(`Sellado ${sellando.bar} en ${sellando.ruta}.`);
      setSellando(null);
      setMotivoSello('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo sellar.');
    } finally {
      setOcupado(false);
    }
  }

  async function borrar() {
    setOcupado(true);
    setError(null);
    try {
      await borrarCuenta(userId, motivoBorrar);
      setConfirmarBorrar(false);
      // Abierta por enlace directo en la web no hay a donde volver.
      if (router.canGoBack()) router.back();
      else router.replace('/admin/usuarios');
    } catch (e) {
      setConfirmarBorrar(false);
      setError(e instanceof Error ? e.message : 'No se pudo borrar la cuenta.');
    } finally {
      setOcupado(false);
    }
  }

  if (!usuario && !error) return <Loading />;
  const esYo = session?.user.id === userId;
  const ahora = new Date();

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {hecho ? <Banner tone="success">{hecho}</Banner> : null}

        {usuario ? (
          <Card style={styles.tarjeta}>
            <Text style={typography.screenTitle}>{usuario.nombre}</Text>
            {/* Seleccionable: se copia para escribirle o buscarle en Supabase. */}
            <Text style={styles.email} selectable>
              {usuario.email ?? 'sin correo'}
            </Text>
            <Text style={typography.muted}>
              {[
                usuario.rol === 'admin' ? 'Admin' : null,
                usuario.house && esCasa(usuario.house) ? CASAS[usuario.house].nombre : 'Sin casa',
                `${usuario.rutas} ${usuario.rutas === 1 ? 'ruta' : 'rutas'}`,
                `cuenta desde el ${diaCorto(new Date(usuario.alta))}`,
                usuario.ultima_entrada ? `entró el ${diaCorto(new Date(usuario.ultima_entrada))}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Card>
        ) : null}

        {usuario ? (
          <Card style={styles.tarjeta}>
            <Text style={typography.sectionTitle}>Meter en una ruta</Text>
            <Text style={typography.muted}>
              {usuario.rutas === 0
                ? 'No está en ninguna ruta: no ve nada. Si la mete aquí, entra sin enlace.'
                : 'Para una ruta más a la que no llegó con su enlace.'}{' '}
              {usuario.house
                ? 'Ya tiene casa y se la queda.'
                : 'Al entrar se le asigna casa en el acto: la que menos gente tiene en esa ruta, y si hay empate, al azar. Verá la animación la próxima vez que abra la app.'}
            </Text>
            {rutasTodas.length === 0 ? (
              <Text style={typography.muted}>No hay rutas.</Text>
            ) : (
              <>
                <Chips<string>
                  opciones={rutasTodas.map((r) => ({ id: r.id, texto: etiquetaRuta(r) }))}
                  elegida={rutaElegida}
                  onElegir={setRutaElegida}
                />
                <Button
                  title="Meter en la ruta"
                  disabled={!rutaElegida}
                  loading={ocupado}
                  onPress={() => setConfirmarMeter(true)}
                />
              </>
            )}
          </Card>
        ) : null}

        {usuario ? <Text style={typography.sectionTitle}>Sellos</Text> : null}
        {rutas === null ? null : rutas.length === 0 ? (
          <Text style={typography.muted}>No está en ninguna ruta.</Text>
        ) : (
          rutas.map((r) => (
            <Card key={r.routeId} style={styles.tarjeta}>
              <View style={styles.rutaCabecera}>
                <Text style={styles.ruta}>{r.ruta}</Text>
                <Text style={styles.cuenta}>{`${r.sellados}/${r.bares.length}`}</Text>
              </View>
              {r.bares.map((b) => {
                const plazo = estadoPlazo(b, ahora);
                return (
                  <View key={b.route_bar_id} style={styles.bar}>
                    <View style={styles.barTextos}>
                      <Text style={styles.barNombre}>{`${b.sellado_at ? '✓ ' : ''}${b.bar}`}</Text>
                      <Text style={styles.barSub}>
                        {b.sellado_at
                          ? `Sellado a las ${hora(new Date(b.sellado_at))}${
                              b.sellado_por ? ` · a mano por ${b.sellado_por}: «${b.sellado_motivo ?? ''}»` : ''
                            }`
                          : `${ventana(new Date(b.opens_at), new Date(b.closes_at))}${
                              plazo === 'cerrado' ? ' · ya cerró' : plazo === 'sin-abrir' ? ' · aún no abre' : ''
                            }`}
                      </Text>
                    </View>
                    {b.sellado_at || esYo ? null : (
                      <Button
                        title="Sellar"
                        variant="secondary"
                        onPress={() => {
                          setHecho(null);
                          setMotivoSello('');
                          setSellando(b);
                        }}
                        style={styles.botonSellar}
                      />
                    )}
                  </View>
                );
              })}
              {sellando && sellando.route_id === r.routeId ? (
                <View style={styles.formSello}>
                  <Text style={styles.barNombre}>{`Sellar ${sellando.bar} a mano`}</Text>
                  <Text style={typography.muted}>
                    Cuenta como un sello normal: da sus puntos y cuenta para completar la ruta y el sorteo. Queda apuntado
                    quién lo puso y por qué.
                  </Text>
                  <Field
                    label="Motivo"
                    value={motivoSello}
                    onChangeText={setMotivoSello}
                    placeholder="Sin batería, el GPS no iba..."
                    maxLength={300}
                  />
                  <View style={styles.acciones}>
                    <Button title="Cancelar" variant="ghost" onPress={() => setSellando(null)} disabled={ocupado} />
                    <Button
                      title="Sellar"
                      onPress={() => void sellar()}
                      loading={ocupado}
                      disabled={motivoSello.trim().length < 3}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          ))
        )}

        {usuario && !esYo && usuario.rol !== 'admin' ? (
          <Card style={[styles.tarjeta, styles.peligro]}>
            <Text style={typography.sectionTitle}>Borrar la cuenta</Text>
            <Text style={typography.muted}>
              Se borra para siempre: su cuenta, sus sellos, su sitio en las rutas y La Caña. Los puntos que dio a su casa se quedan.
              Es para cuentas de prueba o si la persona lo pide. Para sancionar, mejor suspender desde Alertas: así
              puede leer por qué y reclamar.
            </Text>
            <Field
              label="Motivo"
              value={motivoBorrar}
              onChangeText={setMotivoBorrar}
              placeholder="Cuenta de prueba, lo ha pedido..."
              maxLength={300}
            />
            <Button
              title="Borrar cuenta"
              variant="danger"
              disabled={motivoBorrar.trim().length < 3}
              onPress={() => setConfirmarBorrar(true)}
            />
          </Card>
        ) : null}
      </ScrollView>

      <DialogoConfirmar
        visible={confirmarMeter}
        titulo={`¿Meter a ${usuario?.nombre ?? ''} en ${rutasTodas.find((r) => r.id === rutaElegida)?.name ?? 'la ruta'}?`}
        mensaje={[
          usuario?.house ? 'Verá la ruta en su app.' : 'Verá la ruta en su app y se le asignará una casa.',
          rutasTodas.find((r) => r.id === rutaElegida)?.is_published === false
            ? 'Esa ruta aún es un borrador: no la verá hasta que la publiques, y su casa se asignaría contra una ruta todavía vacía.'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        textoConfirmar="Meter en la ruta"
        ocupado={ocupado}
        onConfirmar={() => void meter()}
        onCancelar={() => setConfirmarMeter(false)}
      />
      <DialogoConfirmar
        visible={confirmarBorrar}
        titulo={`¿Borrar la cuenta de ${usuario?.nombre ?? ''}?`}
        mensaje="No se puede deshacer."
        textoConfirmar="Borrar para siempre"
        destructivo
        ocupado={ocupado}
        onConfirmar={() => void borrar()}
        onCancelar={() => setConfirmarBorrar(false)}
      />
    </SafeAreaView>
  );
}

/** Nombre, fecha y si es borrador: dos rutas con el mismo nombre tienen que poder distinguirse. */
function etiquetaRuta(r: RouteRow): string {
  const dia = desdeFechaISO(r.event_date);
  return `${r.name}${dia ? ` · ${diaCorto(dia)}` : ''}${r.is_published ? '' : ' (borrador)'}`;
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  tarjeta: { gap: space.sm },
  email: { fontSize: 16, color: colors.ink },
  rutaCabecera: { flexDirection: 'row', alignItems: 'center' },
  ruta: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  cuenta: { fontSize: 14, fontWeight: '900', color: colors.ink },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  barTextos: { flex: 1, minWidth: 0 },
  barNombre: { fontSize: 14, fontWeight: '700', color: colors.ink },
  barSub: { fontSize: 12, color: colors.inkSoft },
  botonSellar: { minHeight: 36, paddingHorizontal: space.md },
  formSello: { gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.beerSoft },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  peligro: { borderColor: colors.danger },
});

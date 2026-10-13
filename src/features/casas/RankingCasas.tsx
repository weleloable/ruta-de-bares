import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useActiveRoute } from '../routes/ActiveRouteProvider';
import { AportesCasa } from './AportesCasa';
import { InfoPuntos } from './InfoPuntos';
import type { IdCasa } from './casas';
import { useMiCasa } from './MiCasa';
import { TablaCasas } from './TablaCasas';
import { useRankingCasas } from './useRankingCasas';

export function RankingCasas({ rutaId, pie, retos }: { rutaId: string; pie?: ReactNode; retos?: ReactNode }) {
  const { filas, error, recargar } = useRankingCasas(rutaId);
  const { casa: miCasa } = useMiCasa();
  const router = useRouter();
  const { session } = useAuth();
  const { routes, activeRoute, refresh } = useActiveRoute();
  const ruta = routes.find((r) => r.id === rutaId) ?? activeRoute;
  const [abierta, setAbierta] = useState<IdCasa | null>(null);
  const [info, setInfo] = useState(false);
  const [actualizando, setActualizando] = useState(false);

  async function actualizar() {
    if (actualizando) return;
    setActualizando(true);
    try {
      await Promise.all([recargar(), refresh()]);
    } finally {
      setActualizando(false);
    }
  }

  return (
    <>
      <TablaCasas
        filas={filas}
        miCasa={miCasa}
        error={error}
        actualizando={actualizando}
        onActualizar={() => void actualizar()}
        onHistorico={() => router.push('/casas/historico')}
        onCasa={(casa) => { setInfo(false); setAbierta(casa); }}
        pie={pie}
      />
      {info ? <Pressable accessibilityLabel="Cerrar formas de conseguir puntos" onPress={() => setInfo(false)} style={StyleSheet.absoluteFill} /> : null}
      <InfoPuntos ruta={ruta} visible={info} onCambiar={setInfo} retos={retos} />
      <AportesCasa rutaId={rutaId} casa={abierta} miId={session?.user.id ?? null} onCerrar={() => setAbierta(null)} />
    </>
  );
}

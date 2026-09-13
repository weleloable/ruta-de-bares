import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useActiveRoute } from '../hooks/useActiveRoute';
import { checkIn } from '../lib/api/stamps';
import { formatSchedule } from '../lib/format';
import { CHECK_IN_RADIUS_METERS, haversineMeters, isWithinCheckInRadius } from '../lib/geo';
import { currentLocalTime, isWithinTimeWindow } from '../lib/schedule';
import type { Bar } from '../types/domain';

type PermissionState = 'checking' | 'granted' | 'denied';

interface BarStatus {
  bar: Bar;
  distanceMeters: number;
  inWindow: boolean;
  sealed: boolean;
}

/** Cada cuánto se vuelve a evaluar el GPS contra los bares (ms). */
const WATCH_TIME_INTERVAL_MS = 4000;
const WATCH_DISTANCE_INTERVAL_M = 5;

export default function CheckInScreen() {
  const { profile } = useAuth();
  const { route, bars, seals, refresh } = useActiveRoute();
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [position, setPosition] = useState<Location.LocationObject | null>(null);
  const [justSealed, setJustSealed] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  // Evita mandar dos check-in a la vez para el mismo bar mientras el
  // primero sigue en vuelo.
  const inFlightRef = useRef<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let subscription: Location.LocationSubscription | null = null;
      let cancelled = false;

      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setPermission('denied');
          return;
        }
        setPermission('granted');
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: WATCH_TIME_INTERVAL_MS,
            distanceInterval: WATCH_DISTANCE_INTERVAL_M,
          },
          (loc) => {
            if (!cancelled) setPosition(loc);
          }
        );
      })();

      return () => {
        cancelled = true;
        subscription?.remove();
      };
    }, [])
  );

  const mySealedBarIds = new Set(seals.filter((s) => s.userId === profile?.id).map((s) => s.barId));

  const statuses: BarStatus[] = position
    ? [...bars]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((bar) => {
          const distanceMeters = haversineMeters(
            position.coords.latitude,
            position.coords.longitude,
            bar.latitude,
            bar.longitude
          );
          return {
            bar,
            distanceMeters,
            inWindow: isWithinTimeWindow(currentLocalTime(), bar.startTime, bar.endTime),
            sealed: mySealedBarIds.has(bar.id),
          };
        })
    : [];

  // Intenta sellar automáticamente cualquier bar que cumpla las tres
  // condiciones a la vez. Se repite en cada actualización de posición.
  useEffect(() => {
    if (!route || !profile) return;
    for (const status of statuses) {
      if (status.sealed) continue;
      if (!isWithinCheckInRadius(status.distanceMeters)) continue;
      if (!status.inWindow) continue;
      if (inFlightRef.current.has(status.bar.id)) continue;

      inFlightRef.current.add(status.bar.id);
      checkIn({
        routeId: route.id,
        barId: status.bar.id,
        latitude: position!.coords.latitude,
        longitude: position!.coords.longitude,
      })
        .then((result) => {
          if (result.ok && !result.alreadySealed) {
            setJustSealed(result.barName);
            setCheckInError(null);
            refresh();
          } else if (!result.ok && result.error !== 'too_far' && result.error !== 'outside_schedule') {
            setCheckInError(`No se pudo sellar ${status.bar.name}: ${result.error}`);
          }
        })
        .catch((e) => setCheckInError(e instanceof Error ? e.message : String(e)))
        .finally(() => inFlightRef.current.delete(status.bar.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, route?.id, profile?.id]);

  useEffect(() => {
    if (!justSealed) return;
    const t = setTimeout(() => setJustSealed(null), 4000);
    return () => clearTimeout(t);
  }, [justSealed]);

  if (permission === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (permission === 'denied') {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          Necesitamos tu ubicación para sellar los bares automáticamente cuando estés en uno de
          ellos, dentro de su horario. Actívala en los ajustes del sistema para esta app.
        </Text>
      </View>
    );
  }

  if (!route || bars.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Todavía no hay una ruta activa.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {justSealed && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>🎉 ¡Sello conseguido en {justSealed}!</Text>
        </View>
      )}
      {checkInError && (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={styles.bannerText}>{checkInError}</Text>
        </View>
      )}
      {!position && (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.hint}>Buscando tu posición…</Text>
        </View>
      )}
      <FlatList
        data={statuses}
        keyExtractor={(s) => s.bar.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          position ? (
            <Text style={styles.headerHint}>
              Sella solo: si estás a menos de {CHECK_IN_RADIUS_METERS}m de un bar dentro de su
              horario, se marca automáticamente.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.row, item.sealed && styles.rowSealed]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.barName}>
                {item.bar.orderIndex + 1}. {item.bar.name}
              </Text>
              <Text style={styles.schedule}>
                {formatSchedule(item.bar.startTime, item.bar.endTime)}
                {item.inWindow ? ' · en horario' : ' · fuera de horario'}
              </Text>
            </View>
            <Text style={[styles.distance, item.sealed && styles.distanceSealed]}>
              {item.sealed ? '✓ sellado' : `${Math.round(item.distanceMeters)} m`}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  permissionText: { textAlign: 'center', fontSize: 15, color: '#333' },
  emptyText: { color: '#555', textAlign: 'center' },
  hint: { marginTop: 8, color: '#888' },
  headerHint: { color: '#888', fontSize: 12, padding: 16, paddingBottom: 8 },
  list: { paddingBottom: 16 },
  banner: { backgroundColor: '#fff8e7', padding: 12, alignItems: 'center' },
  bannerError: { backgroundColor: '#fde8e8' },
  bannerText: { fontWeight: '700', color: '#333' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowSealed: { backgroundColor: '#fff8e7' },
  barName: { fontWeight: '700', fontSize: 15 },
  schedule: { color: '#888', fontSize: 12, marginTop: 2 },
  distance: { fontWeight: '700', color: '#333' },
  distanceSealed: { color: '#b8860b' },
});

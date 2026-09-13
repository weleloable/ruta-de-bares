// Combina la lista de bares de la ruta con los sellos del usuario para
// construir la "compostelana". Puro: nada de red aquí, así se testea sin
// Supabase.
import type { Bar, Seal, StampEntry } from '../types/domain';

export function buildStampEntries(bars: Bar[], mySeals: Seal[]): StampEntry[] {
  const sealedAtByBar = new Map(mySeals.map((s) => [s.barId, s.sealedAt]));
  return [...bars]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((bar) => ({
      bar,
      sealedAt: sealedAtByBar.get(bar.id) ?? null,
    }));
}

export interface Progress {
  sealed: number;
  total: number;
  complete: boolean;
}

export function computeProgress(entries: StampEntry[]): Progress {
  const total = entries.length;
  const sealed = entries.filter((e) => e.sealedAt !== null).length;
  return { sealed, total, complete: total > 0 && sealed === total };
}

/** Progreso de cada miembro del grupo, para la vista compartida. */
export interface GroupMemberProgress {
  userId: string;
  sealed: number;
}

export function computeGroupProgress(
  totalBars: number,
  allSeals: Pick<Seal, 'userId' | 'barId'>[]
): GroupMemberProgress[] {
  const byUser = new Map<string, Set<string>>();
  for (const seal of allSeals) {
    const set = byUser.get(seal.userId) ?? new Set<string>();
    set.add(seal.barId);
    byUser.set(seal.userId, set);
  }
  return [...byUser.entries()]
    .map(([userId, bars]) => ({ userId, sealed: Math.min(bars.size, totalBars) }))
    .sort((a, b) => b.sealed - a.sealed);
}

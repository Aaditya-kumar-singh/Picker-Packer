// UI-facing sync status: one observable snapshot for badges/banners.
// Screens read via useSyncStatus(); the runtime refreshes it after ops,
// connectivity changes and sync runs.
import type { ConnectivityState } from "./connectivity";

export interface SyncUiStatus {
  connectivity: ConnectivityState;
  pending: number;
  failed: number;
  lastSyncAt: string | null;
  syncing: boolean;
  conflicts: Array<{ clientEventId: string; message: string | null }>;
}

export const IDLE_STATUS: SyncUiStatus = {
  connectivity: "CHECKING",
  pending: 0,
  failed: 0,
  lastSyncAt: null,
  syncing: false,
  conflicts: [],
};

export class SyncStatusStore {
  private current: SyncUiStatus = { ...IDLE_STATUS };
  private listeners = new Set<() => void>();

  get(): SyncUiStatus {
    return this.current;
  }

  set(patch: Partial<SyncUiStatus>): void {
    this.current = { ...this.current, ...patch };
    for (const cb of this.listeners) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

// Runtime factory with zero react-native imports (safe for Node harnesses).
// The app wires Expo specifics (SQLite file, AppState) via setup.ts;
// tests inject file stores and manual connectivity.
import type { RowStore } from "@/storage/store";
import { Connectivity, defaultProbe, type ConnectivityDeps } from "./connectivity";
import { consoleSyncLogger, type SyncLogger } from "./logger";
import { OfflineFirstPickerApi } from "./offlineApi";
import { SyncStatusStore } from "./status";
import { NetworkDownError, SyncEngine, type SyncTransport } from "./syncEngine";
import type { OfflineEvent, SyncBatchResponse } from "./events";
import type { IPickerApi } from "@/services/pickerApi";

export interface SyncRuntime {
  store: RowStore;
  engine: SyncEngine;
  status: SyncStatusStore;
  api: OfflineFirstPickerApi;
  connectivity: Connectivity;
  refreshStatus: () => Promise<void>;
  syncNow: () => Promise<void>;
}

export interface RuntimeDeps {
  store: RowStore;
  deviceId: string;
  /** Online transport for both direct calls and sync uploads. */
  online: IPickerApi;
  uploadBatch: (batch: {
    deviceId: string;
    syncTimestamp: string;
    events: OfflineEvent[];
  }) => Promise<
    | { ok: true; data: SyncBatchResponse }
    | { ok: false; apiError: { error: string; message: string } }
  >;
  connectivity?: Connectivity;
  probe?: ConnectivityDeps["probe"];
  pollMs?: number;
  onForeground?: (cb: () => void) => () => void;
  log?: SyncLogger;
}

export function resultToTransport(
  call: (batch: { deviceId: string; syncTimestamp: string; events: OfflineEvent[] }) => Promise<
    | { ok: true; data: SyncBatchResponse }
    | { ok: false; apiError: { error: string; message: string } }
  >,
): SyncTransport {
  return {
    uploadBatch: async (batch) => {
      const r = await call(batch);
      if (!r.ok) {
        if (r.apiError.error === "NETWORK_ERROR") throw new NetworkDownError();
        if (
          r.apiError.error === "RATE_LIMITED" ||
          r.apiError.error === "SERVICE_UNAVAILABLE" ||
          r.apiError.error === "INTERNAL_ERROR"
        ) {
          throw new Error(`${r.apiError.error}: ${r.apiError.message}`);
        }
        throw new Error(`${r.apiError.error}: ${r.apiError.message}`);
      }
      return r.data;
    },
  };
}

export async function createSyncRuntime(deps: RuntimeDeps): Promise<SyncRuntime> {
  const log = deps.log ?? consoleSyncLogger("[sync]");
  const connectivity =
    deps.connectivity ??
    new Connectivity({
      probe: deps.probe ?? (async () => "ONLINE" as const),
      pollMs: deps.pollMs,
      onForeground: deps.onForeground,
    });
  const status = new SyncStatusStore();
  const engine = new SyncEngine({
    store: deps.store,
    transport: resultToTransport(deps.uploadBatch),
    connectivity,
    deviceId: deps.deviceId,
    log,
  });
  const api = new OfflineFirstPickerApi({
    online: deps.online,
    store: deps.store,
    connectivity,
    deviceId: deps.deviceId,
    log,
  });

  async function refreshStatus(): Promise<void> {
    const [pending, failed, lastSyncAt, failedRows] = await Promise.all([
      engine.pendingCount(),
      deps.store.countByStatus("FAILED"),
      engine.lastSuccessfulSync(),
      engine.failedList(),
    ]);
    status.set({
      connectivity: connectivity.get(),
      pending,
      failed,
      lastSyncAt,
      conflicts: failedRows.filter((f) => (f.message ?? "").startsWith("CONFLICT")),
    });
  }

  async function syncNow(): Promise<void> {
    status.set({ syncing: true });
    try {
      await engine.syncNow();
    } finally {
      status.set({ syncing: false });
      await refreshStatus();
    }
  }

  connectivity.subscribe(() => {
    void refreshStatus().then(() => {
      if (connectivity.get() === "ONLINE") void syncNow();
    });
  });
  connectivity.start();
  await refreshStatus();
  return { store: deps.store, engine, status, api, connectivity, refreshStatus, syncNow };
}

export { defaultProbe };

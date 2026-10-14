import { AppState } from "react-native";
import { getAuthToken, API_BASE_URL } from "@/api/http";
import { getDeviceId } from "@/repositories/deviceId";
import { supabasePickerApi } from "@/services/supabasePickerApi";
import { openExpoStore } from "@/storage/drivers/expoStore";
import { createSyncRuntime, type SyncRuntime } from "./runtime";

let runtime: SyncRuntime | null = null;
let initPromise: Promise<SyncRuntime> | null = null;

async function probeBackend(): Promise<"ONLINE" | "OFFLINE" | "SERVER_UNREACHABLE"> {
  try {
    const token = await getAuthToken();
    if (!token) return "OFFLINE";

    const res = await fetch(`${API_BASE_URL}/api/picker-app/stats`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (res.status === 401) return "OFFLINE";
    if (res.ok) return "ONLINE";
    return "SERVER_UNREACHABLE";
  } catch {
    return "SERVER_UNREACHABLE";
  }
}

async function create(): Promise<SyncRuntime> {
  const deviceId = getDeviceId();
  return createSyncRuntime({
    store: await openExpoStore(),
    deviceId,
    online: supabasePickerApi,
    uploadBatch: async (batch) => ({ ok: true as const, data: await supabasePickerApi.syncEvents(batch) }),
    probe: probeBackend,
    pollMs: 30000,
    onForeground: (cb) => {
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") cb();
      });
      return () => sub.remove();
    },
  });
}

export function getSyncRuntime(): Promise<SyncRuntime> {
  if (runtime) return Promise.resolve(runtime);
  if (!initPromise) {
    initPromise = create()
      .then((r) => {
        runtime = r;
        return r;
      })
      .catch((error) => {
        initPromise = null;
        runtime = null;
        throw error;
      });
  }
  return initPromise;
}

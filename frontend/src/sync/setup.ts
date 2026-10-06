import { AppState } from "react-native";
import { supabase } from "@/api/supabase";
import { getDeviceId } from "@/repositories/deviceId";
import { supabasePickerApi } from "@/services/supabasePickerApi";
import { openExpoStore } from "@/storage/drivers/expoStore";
import { createSyncRuntime, type SyncRuntime } from "./runtime";

let runtime: SyncRuntime | null = null;
let initPromise: Promise<SyncRuntime> | null = null;

async function probeSupabase(): Promise<"ONLINE" | "OFFLINE" | "SERVER_UNREACHABLE"> {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return "SERVER_UNREACHABLE";
    if (!sessionData.session) return "OFFLINE";

    const { error } = await supabase.from("orders").select("id").limit(1);
    if (!error) return "ONLINE";
    if (error.code === "PGRST301" || /fetch|network|timeout|connection/i.test(error.message)) {
      return "SERVER_UNREACHABLE";
    }
    // Authenticated Supabase is reachable even when an RLS/query error occurs.
    return "ONLINE";
  } catch {
    return "OFFLINE";
  }
}

async function create(): Promise<SyncRuntime> {
  const deviceId = getDeviceId();
  return createSyncRuntime({
    store: await openExpoStore(),
    deviceId,
    online: supabasePickerApi,
    uploadBatch: async batch => ({ ok: true as const, data: await supabasePickerApi.syncEvents(batch) }),
    probe: probeSupabase,
    pollMs: 30000,
    onForeground: cb => {
      const sub = AppState.addEventListener("change", s => {
        if (s === "active") cb();
      });
      return () => sub.remove();
    },
  });
}

export function getSyncRuntime(): Promise<SyncRuntime> {
  if (runtime) return Promise.resolve(runtime);
  if (!initPromise) {
    initPromise = create().then(r => {
      runtime = r;
      return r;
    });
  }
  return initPromise;
}

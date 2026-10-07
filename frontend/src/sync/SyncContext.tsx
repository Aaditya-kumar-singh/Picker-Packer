// React bindings for sync status. Sync starts only after authenticated profile
// restoration so the first connectivity probe has the user's Supabase session.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/navigation/AppProvider";
import { getSyncRuntime } from "./setup";
import type { SyncRuntime } from "./runtime";
import { IDLE_STATUS, type SyncUiStatus } from "./status";

const Ctx = createContext<{ status: SyncUiStatus; syncNow: () => Promise<void> }>({
  status: IDLE_STATUS,
  syncNow: () => Promise.resolve(),
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const { picker, ready } = useAuth();
  const [status, setStatus] = useState<SyncUiStatus>(IDLE_STATUS);
  const [runtime, setRuntime] = useState<SyncRuntime | null>(null);

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | null = null;

    if (!ready || !picker) {
      setRuntime(null);
      setStatus({ ...IDLE_STATUS });
      return () => {
        alive = false;
      };
    }

    void getSyncRuntime()
      .then((r) => {
        if (!alive) return;
        setRuntime(r);
        unsub = r.status.subscribe(() => setStatus({ ...r.status.get() }));
        setStatus({ ...r.status.get() });
      })
      .catch(() => {
        // Online Picker reads continue through the direct Supabase API.
        // SQLite/sync availability must not blank or block the dashboard.
        if (alive) setStatus({ ...IDLE_STATUS });
      });

    return () => {
      alive = false;
      unsub?.();
    };
  }, [picker, ready]);

  const syncNow = useCallback(() => {
    if (!runtime) return Promise.resolve();
    return runtime.syncNow();
  }, [runtime]);

  return <Ctx.Provider value={{ status, syncNow }}>{children}</Ctx.Provider>;
}

export function useSyncStatus(): { status: SyncUiStatus; syncNow: () => Promise<void> } {
  return useContext(Ctx);
}

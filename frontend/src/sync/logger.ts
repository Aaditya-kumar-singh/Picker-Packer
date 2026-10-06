// Structured client-side sync logging hooks. No auth secrets, no tokens,
// no OTP values — event ids and counts only.
export type SyncLogKind =
  | "event_queued"
  | "sync_started"
  | "event_uploaded"
  | "event_applied"
  | "event_duplicate"
  | "event_conflict"
  | "event_failed"
  | "sync_completed";

export interface SyncLog {
  kind: SyncLogKind;
  at: string;
  clientEventId?: string;
  detail?: string;
}

export type SyncLogger = (entry: SyncLog) => void;

export function consoleSyncLogger(prefix = "[sync]"): SyncLogger {
  return (e: SyncLog) => {
    // eslint-disable-next-line no-console
    console.log(
      `${prefix} ${e.kind}${e.clientEventId ? ` ${e.clientEventId.slice(0, 8)}` : ""}${e.detail ? ` ${e.detail}` : ""}`,
    );
  };
}

export function silentLogger(): SyncLogger {
  return () => undefined;
}

export function memoryLogger(): { log: SyncLogger; entries: SyncLog[] } {
  const entries: SyncLog[] = [];
  return { log: (e: SyncLog) => entries.push(e), entries };
}

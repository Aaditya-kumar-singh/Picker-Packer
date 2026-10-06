// SyncEngine: drain the durable outbox in occurredAt order.
// - Marks rows SYNCING, uploads one batch (≤ batchSize), applies per-event
//   results: ACCEPTED/DUPLICATE → SYNCED; CONFLICT/REJECTED → FAILED (kept
//   for review, never auto-retried); network/5xx → rows stay PENDING with
//   bounded attempts + exponential backoff eligibility.
// - Retries always reuse the stored client_event_id (never regenerated).
import type { RowStore } from "@/storage/store";
import type { Connectivity } from "./connectivity";
import type { OfflineEvent, SyncBatchResponse } from "./events";
import type { SyncLogger } from "./logger";

export interface SyncTransport {
  uploadBatch(batch: {
    deviceId: string;
    syncTimestamp: string;
    events: OfflineEvent[];
  }): Promise<SyncBatchResponse>;
}

export class NetworkDownError extends Error {
  constructor() {
    super("NETWORK_ERROR");
  }
}

export class TransientSyncError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface SyncReport {
  ran: boolean;
  reason?: string;
  uploaded?: number;
  synced?: number;
  duplicates?: number;
  conflicts?: number;
  rejected?: number;
  failed?: number;
}

export interface SyncEngineDeps {
  store: RowStore;
  transport: SyncTransport;
  connectivity: Connectivity;
  deviceId: string;
  log?: SyncLogger;
  batchSize?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export class SyncEngine {
  // NOTE: no TS parameter properties (Node strip-only mode must load this).
  private readonly deps: SyncEngineDeps;
  private running = false;
  private log: SyncLogger;

  constructor(deps: SyncEngineDeps) {
    this.deps = deps;
    this.log = deps.log ?? (() => undefined);
  }

  private emit(kind: Parameters<SyncLogger>[0]["kind"], clientEventId?: string, detail?: string): void {
    this.log({ kind, at: new Date().toISOString(), clientEventId, detail });
  }

  private backoffEligible(attemptCount: number, lastAttemptAt: string | null): boolean {
    if (!lastAttemptAt) return true;
    const base = this.deps.baseDelayMs ?? 1000;
    const wait = base * 2 ** Math.min(attemptCount, 6);
    return Date.now() - new Date(lastAttemptAt).getTime() >= wait;
  }

  async syncNow(): Promise<SyncReport> {
    if (this.running) return { ran: false, reason: "already running" };
    // Always re-probe: a stale cached state must never skip or force a sync.
    const conn = await this.deps.connectivity.checkNow();
    if (conn !== "ONLINE") return { ran: false, reason: conn };
    this.running = true;
    try {
      const maxAttempts = this.deps.maxAttempts ?? 5;
      const batchSize = this.deps.batchSize ?? 100;
      const all = await this.deps.store.listByStatuses(["PENDING"]);
      const due = all
        .filter((r) => r.attemptCount < maxAttempts && this.backoffEligible(r.attemptCount, r.lastAttemptAt))
        .slice(0, batchSize);
      if (due.length === 0) {
        return { ran: true, uploaded: 0, synced: 0, duplicates: 0, conflicts: 0, rejected: 0, failed: 0 };
      }
      this.emit("sync_started", undefined, `batch=${due.length}`);
      for (const r of due) {
        await this.deps.store.updateOutbox(r.id, { status: "SYNCING" });
      }
      const events: OfflineEvent[] = due.map((r) => ({
        clientEventId: r.clientEventId,
        eventType: r.eventType as OfflineEvent["eventType"],
        occurredAt: r.occurredAt,
        ...(r.orderId ? { orderId: r.orderId } : {}),
        ...(r.lineId ? { lineId: r.lineId } : {}),
        payload: JSON.parse(r.payloadJson) as Record<string, unknown>,
      }));
      let res: SyncBatchResponse;
      try {
        res = await this.deps.transport.uploadBatch({
          deviceId: this.deps.deviceId,
          syncTimestamp: new Date().toISOString(),
          events,
        });
      } catch (e) {
        // Transport failure: roll rows back to PENDING (attempts bounded).
        for (const r of due) {
          const attempts = r.attemptCount + 1;
          await this.deps.store.updateOutbox(r.id, {
            status: attempts >= maxAttempts ? "FAILED" : "PENDING",
            attemptCount: attempts,
            lastAttemptAt: new Date().toISOString(),
            lastError: e instanceof Error ? e.message : "upload failed",
          });
          this.emit("event_failed", r.clientEventId, e instanceof Error ? e.message : "upload failed");
        }
        if (e instanceof NetworkDownError) return { ran: false, reason: "OFFLINE" };
        this.emit("sync_completed", undefined, "transient failure");
        return { ran: true, uploaded: due.length, synced: 0, duplicates: 0, conflicts: 0, rejected: 0, failed: due.length };
      }
      const byId = new Map(res.results.map((x) => [x.clientEventId, x]));
      let synced = 0;
      let duplicates = 0;
      let conflicts = 0;
      let rejected = 0;
      const now = new Date().toISOString();
      for (const r of due) {
        const one = byId.get(r.clientEventId);
        this.emit("event_uploaded", r.clientEventId);
        if (!one) {
          await this.deps.store.updateOutbox(r.id, { status: "PENDING", lastError: "missing from batch response" });
          continue;
        }
        if (one.status === "ACCEPTED" || one.status === "DUPLICATE") {
          await this.deps.store.updateOutbox(r.id, {
            status: "SYNCED",
            syncedAt: now,
            lastError: null,
          });
          this.emit(one.status === "ACCEPTED" ? "event_applied" : "event_duplicate", r.clientEventId);
          if (one.status === "ACCEPTED") synced += 1;
          else duplicates += 1;
        } else if (one.status === "CONFLICT") {
          await this.deps.store.updateOutbox(r.id, {
            status: "FAILED",
            lastAttemptAt: now,
            lastError: `CONFLICT: ${one.message ?? ""}`,
          });
          this.emit("event_conflict", r.clientEventId, one.message ?? "");
          conflicts += 1;
        } else {
          await this.deps.store.updateOutbox(r.id, {
            status: "FAILED",
            lastAttemptAt: now,
            lastError: `REJECTED: ${one.message ?? ""}`,
          });
          this.emit("event_failed", r.clientEventId, one.message ?? "");
          rejected += 1;
        }
      }
      await this.deps.store.setMeta("lastSuccessfulSync", now);
      this.emit("sync_completed", undefined, `synced=${synced} dup=${duplicates} conflict=${conflicts} rej=${rejected}`);
      return { ran: true, uploaded: due.length, synced, duplicates, conflicts, rejected, failed: 0 };
    } finally {
      this.running = false;
    }
  }

  async pendingCount(): Promise<number> {
    return this.deps.store.countByStatus("PENDING");
  }

  async failedList(): Promise<Array<{ clientEventId: string; message: string | null }>> {
    const rows = await this.deps.store.listFailed();
    return rows.map((r) => ({ clientEventId: r.clientEventId, message: r.lastError }));
  }

  async lastSuccessfulSync(): Promise<string | null> {
    return this.deps.store.getMeta("lastSuccessfulSync");
  }
}

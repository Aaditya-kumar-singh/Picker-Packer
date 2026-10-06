// expo-sqlite RowStore implementation (used by the app; never by Node tests).
import * as SQLite from "expo-sqlite";
import { OUTBOX_DDL } from "../schema";
import type { OutboxInsert, OutboxRecord, OutboxStatus, RowStore } from "../store";

type Db = SQLite.SQLiteDatabase;

function toRecord(r: Record<string, unknown>): OutboxRecord {
  return {
    id: Number(r.id),
    clientEventId: String(r.client_event_id),
    eventType: String(r.event_type),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    orderId: (r.order_id as string) ?? null,
    lineId: (r.line_id as string) ?? null,
    payloadJson: String(r.payload_json),
    occurredAt: String(r.occurred_at),
    deviceId: String(r.device_id),
    status: r.status as OutboxStatus,
    attemptCount: Number(r.attempt_count),
    lastAttemptAt: (r.last_attempt_at as string) ?? null,
    lastError: (r.last_error as string) ?? null,
    syncedAt: (r.synced_at as string) ?? null,
  };
}

const COLS =
  "id, client_event_id, event_type, entity_type, entity_id, order_id, line_id," +
  " payload_json, occurred_at, device_id, status, attempt_count, last_attempt_at," +
  " last_error, synced_at";

export async function openExpoStore(dbName = "ybm-picker.db"): Promise<RowStore> {
  const db: Db = await SQLite.openDatabaseAsync(dbName);
  await db.execAsync(OUTBOX_DDL);

  return {
    async insertOutbox(row: OutboxInsert): Promise<number> {
      const res = await db.runAsync(
        `INSERT INTO event_outbox
           (client_event_id, event_type, entity_type, entity_id, order_id, line_id,
            payload_json, occurred_at, device_id, status)
         VALUES (?,?,?,?,?,?,?,?,?, 'PENDING')`,
        [
          row.clientEventId,
          row.eventType,
          row.entityType,
          row.entityId,
          row.orderId,
          row.lineId,
          row.payloadJson,
          row.occurredAt,
          row.deviceId,
        ],
      );
      return Number(res.lastInsertRowId);
    },
    async listByStatuses(statuses: OutboxStatus[]): Promise<OutboxRecord[]> {
      const marks = statuses.map(() => "?").join(",");
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT ${COLS} FROM event_outbox WHERE status IN (${marks}) ORDER BY occurred_at ASC, id ASC`,
        statuses,
      );
      return rows.map(toRecord);
    },
    async getByClientEventId(clientEventId: string): Promise<OutboxRecord | null> {
      const row = await db.getFirstAsync<Record<string, unknown>>(
        `SELECT ${COLS} FROM event_outbox WHERE client_event_id = ?`,
        [clientEventId],
      );
      return row ? toRecord(row) : null;
    },
    async updateOutbox(id: number, patch: Partial<OutboxRecord>): Promise<void> {
      const map: Record<string, string> = {
        status: "status",
        attemptCount: "attempt_count",
        lastAttemptAt: "last_attempt_at",
        lastError: "last_error",
        syncedAt: "synced_at",
        payloadJson: "payload_json",
      };
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of Object.entries(patch)) {
        const col = map[k];
        if (!col) continue;
        sets.push(`${col} = ?`);
        params.push(v);
      }
      if (sets.length === 0) return;
      params.push(id);
      const args = params as Array<string | number | null>;
      await db.runAsync(`UPDATE event_outbox SET ${sets.join(", ")} WHERE id = ?`, args);
    },
    async countByStatus(status: OutboxStatus): Promise<number> {
      const row = await db.getFirstAsync<{ c: number }>(
        `SELECT COUNT(*) AS c FROM event_outbox WHERE status = ?`,
        [status],
      );
      return Number(row?.c ?? 0);
    },
    async listFailed(): Promise<OutboxRecord[]> {
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT ${COLS} FROM event_outbox WHERE status = 'FAILED' ORDER BY occurred_at ASC, id ASC`,
      );
      return rows.map(toRecord);
    },
    async getCache(key: string): Promise<string | null> {
      const row = await db.getFirstAsync<{ json: string }>(
        `SELECT json FROM order_cache WHERE cache_key = ?`,
        [key],
      );
      return row?.json ?? null;
    },
    async setCache(key: string, json: string): Promise<void> {
      await db.runAsync(
        `INSERT INTO order_cache (cache_key, json, updated_at) VALUES (?,?,?)
         ON CONFLICT(cache_key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
        [key, json, new Date().toISOString()],
      );
    },
    async getMeta(key: string): Promise<string | null> {
      const row = await db.getFirstAsync<{ meta_value: string }>(
        `SELECT meta_value FROM sync_meta WHERE meta_key = ?`,
        [key],
      );
      return row?.meta_value ?? null;
    },
    async setMeta(key: string, value: string): Promise<void> {
      await db.runAsync(
        `INSERT INTO sync_meta (meta_key, meta_value) VALUES (?,?)
         ON CONFLICT(meta_key) DO UPDATE SET meta_value = excluded.meta_value`,
        [key, value],
      );
    },
    async clearAll(): Promise<void> {
      await db.execAsync(`DELETE FROM event_outbox; DELETE FROM order_cache; DELETE FROM sync_meta;`);
    },
    async close(): Promise<void> {
      await db.closeAsync();
    },
  };
}


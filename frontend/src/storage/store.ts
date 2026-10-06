// Durable outbox row store. Implementations: expo-sqlite (app) and
// JSON-file (Node harnesses). Both honor identical semantics; the store
// logic below is driver-agnostic. No SQL leaks past the expo driver.
export type OutboxStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

export interface OutboxInsert {
  clientEventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  orderId: string | null;
  lineId: string | null;
  payloadJson: string;
  occurredAt: string;
  deviceId: string;
}

export interface OutboxRecord extends OutboxInsert {
  id: number;
  status: OutboxStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  syncedAt: string | null;
}

export interface RowStore {
  insertOutbox(row: OutboxInsert): Promise<number>;
  listByStatuses(statuses: OutboxStatus[]): Promise<OutboxRecord[]>;
  getByClientEventId(clientEventId: string): Promise<OutboxRecord | null>;
  updateOutbox(id: number, patch: Partial<OutboxRecord>): Promise<void>;
  countByStatus(status: OutboxStatus): Promise<number>;
  listFailed(): Promise<OutboxRecord[]>;
  getCache(key: string): Promise<string | null>;
  setCache(key: string, json: string): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  clearAll(): Promise<void>;
  close(): Promise<void>;
}

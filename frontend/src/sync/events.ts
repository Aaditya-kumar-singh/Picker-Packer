// Typed offline events. Shapes mirror OpenAPI OfflineEvent so the sync
// payload needs no translation: {clientEventId, eventType, occurredAt,
// orderId?, lineId?, payload}.
export const SYNC_EVENT_TYPES = [
  "ORDER_STARTED",
  "LOCATION_SCANNED",
  "SKU_SCANNED",
  "QTY_CONFIRMED",
  "EXCEPTION_RAISED",
  "ORDER_COMPLETED",
] as const;

export type SyncEventType = (typeof SYNC_EVENT_TYPES)[number];

export interface OfflineEvent {
  clientEventId: string;
  eventType: SyncEventType;
  occurredAt: string;
  orderId?: string;
  lineId?: string;
  payload: Record<string, unknown>;
}

export type EventResultStatus = "ACCEPTED" | "DUPLICATE" | "REJECTED" | "CONFLICT";

export interface EventResult {
  clientEventId: string;
  status: EventResultStatus;
  message: string | null;
  serverEventId: string | null;
}

export interface SyncBatchResponse {
  processedCount: number;
  results: EventResult[];
  conflicts: Array<{
    clientEventId: string;
    conflictType: string;
    serverState: Record<string, unknown>;
  }>;
}

export function newClientEventId(): string {
  // UUIDv4 without platform crypto assumptions (client-side dedup key only).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

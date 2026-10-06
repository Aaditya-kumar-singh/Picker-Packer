// Last-known-server order snapshots for offline validation.
// The cache is workflow state only: the server re-validates everything on
// sync and remains authoritative. Cached statuses drive the offline UI flow.
import type { RowStore } from "@/storage/store";
import type { Order, OrderLine } from "@/types";

const keyOf = (orderId: string): string => `order:${orderId}`;

export async function saveOrderSnapshot(store: RowStore, order: Order): Promise<void> {
  await store.setCache(keyOf(order.id), JSON.stringify(order));
  await store.setMeta("activeOrderId", order.id);
}

export async function loadOrderSnapshot(store: RowStore, orderId: string): Promise<Order | null> {
  const raw = await store.getCache(keyOf(orderId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Order;
  } catch {
    return null;
  }
}

export async function loadActiveSnapshot(store: RowStore): Promise<Order | null> {
  const id = await store.getMeta("activeOrderId");
  if (!id) return null;
  return loadOrderSnapshot(store, id);
}

export async function findCachedLine(store: RowStore, lineId: string): Promise<{ order: Order; line: OrderLine } | null> {
  const activeId = await store.getMeta("activeOrderId");
  const ids: string[] = activeId ? [activeId] : [];
  for (const id of ids) {
    const order = await loadOrderSnapshot(store, id);
    const line = order?.lines.find((l) => l.id === lineId);
    if (order && line) return { order, line };
  }
  return null;
}

export async function patchCachedLine(store: RowStore, line: OrderLine): Promise<void> {
  const activeId = await store.getMeta("activeOrderId");
  if (!activeId) return;
  const order = await loadOrderSnapshot(store, activeId);
  if (!order) return;
  const idx = order.lines.findIndex((l) => l.id === line.id);
  if (idx === -1) return;
  order.lines[idx] = line;
  await store.setCache(keyOf(order.id), JSON.stringify(order));
}

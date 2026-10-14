// Last-known-server order snapshots for offline validation.
// The cache is workflow state only: the server re-validates everything on
// sync and remains authoritative. Cached statuses drive the offline UI flow.
import type { RowStore } from "@/storage/store";
import type { Order, OrderLine } from "@/types";

const keyOf = (orderId: string): string => `order:${orderId}`;
const CACHED_ORDER_IDS_KEY = "cachedOrderIds";

async function loadCachedOrderIds(store: RowStore): Promise<string[]> {
  const raw = await store.getMeta(CACHED_ORDER_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export async function saveOrderSnapshot(store: RowStore, order: Order): Promise<void> {
  await store.setCache(keyOf(order.id), JSON.stringify(order));

  const currentActive = await store.getMeta("activeOrderId");
  if (order.status === "IN_PROGRESS" || !currentActive) {
    await store.setMeta("activeOrderId", order.id);
  }

  const existingIds = await loadCachedOrderIds(store);
  if (!existingIds.includes(order.id)) {
    const nextIds = [order.id, ...existingIds].slice(0, 30);
    await store.setMeta(CACHED_ORDER_IDS_KEY, JSON.stringify(nextIds));
  }
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

export async function findCachedLine(
  store: RowStore,
  lineId: string,
): Promise<{ order: Order; line: OrderLine } | null> {
  const activeId = await store.getMeta("activeOrderId");
  const allIds = await loadCachedOrderIds(store);
  const candidateIds = Array.from(
    new Set([...(activeId ? [activeId] : []), ...allIds]),
  );

  for (const id of candidateIds) {
    const order = await loadOrderSnapshot(store, id);
    const line = order?.lines.find((l) => l.id === lineId);
    if (order && line) return { order, line };
  }
  return null;
}

export async function patchCachedLine(store: RowStore, line: OrderLine): Promise<void> {
  const found = await findCachedLine(store, line.id);
  if (!found) return;
  const { order } = found;
  const idx = order.lines.findIndex((l) => l.id === line.id);
  if (idx === -1) return;
  order.lines[idx] = line;
  await store.setCache(keyOf(order.id), JSON.stringify(order));
}

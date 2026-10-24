// Pure domain logic for FulfillmentOrderDto and FulfillmentOrderItemDto
import type { FulfillmentOrderDto, FulfillmentOrderItemDto } from "@/types";

export function normalizeBarcode(v: string): string {
  return v ? v.trim() : "";
}

/** Formats warehouse location for display: e.g. "A-03-R2-B7-S1" */
export function formatItemLocation(item?: FulfillmentOrderItemDto | null): string {
  if (!item) return "Unassigned Location";
  if (item.locationCode && item.locationCode.trim().length > 0) {
    return item.locationCode.trim();
  }
  const parts = [item.zone, item.aisle, item.rack, item.bin, item.shelf]
    .filter((p): p is string => Boolean(p && p.trim().length > 0))
    .map((p) => p.trim());

  return parts.length > 0 ? parts.join("-") : "Unassigned Location";
}

/** Returns the next item pending picking */
export function nextPendingLine(o: FulfillmentOrderDto): FulfillmentOrderItemDto | null {
  if (!o.items || o.items.length === 0) return null;
  return o.items.find((i) => !i.fullyScanned && i.pickedQty < i.orderedQty) ?? null;
}

/** Returns the next item pending packing */
export function nextPendingPackLine(o: FulfillmentOrderDto): FulfillmentOrderItemDto | null {
  if (!o.items || o.items.length === 0) return null;
  return o.items.find((i) => !i.fullyScanned && (i.packedQty ?? 0) < i.orderedQty) ?? null;
}

/** True when all lines have reached pickedQty >= orderedQty */
export function isOrderFullyPicked(o: FulfillmentOrderDto): boolean {
  if (!o.items || o.items.length === 0) return false;
  return o.items.every((i) => i.fullyScanned || i.pickedQty >= i.orderedQty);
}

/** True when all lines have reached packedQty >= orderedQty or order is PACKED */
export function isOrderFullyPacked(o: FulfillmentOrderDto): boolean {
  if (o.orderStatus === "PACKED") return true;
  if (!o.items || o.items.length === 0) return false;
  return o.items.every((i) => i.fullyScanned || (i.packedQty ?? 0) >= i.orderedQty);
}

export type PickStep = "sku" | "complete";

/** Resolves next screen step for picker */
export function resolvePickStep(o: FulfillmentOrderDto): PickStep {
  const line = nextPendingLine(o);
  if (!line || isOrderFullyPicked(o)) return "complete";
  return "sku";
}

/** Resolves URL path for picker next step */
export function pickStepPath(orderId: number | string, o: FulfillmentOrderDto): string {
  return `/pick/${orderId}/${resolvePickStep(o)}`;
}

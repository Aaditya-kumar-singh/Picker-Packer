import type { FulfillmentOrderDto, FulfillmentOrderItemDto } from "@/types";

export interface WarehouseDisplay {
  code: string;
  name: string;
  fullName: string;
  address: string;
  shortAddress: string;
}

export function getWarehouseDisplay(
  warehouseId?: number | string | null,
  warehouseName?: string | null
): WarehouseDisplay {
  if (warehouseId === null || warehouseId === undefined) {
    return {
      code: "WH-ID unavailable",
      name: warehouseName?.trim() || "Warehouse not assigned",
      fullName: warehouseName?.trim() || "Warehouse identity unavailable",
      address: warehouseName?.trim() || "Ask your warehouse supervisor to confirm your assigned warehouse.",
      shortAddress: warehouseName?.trim() || "Unassigned",
    };
  }

  const strId = String(warehouseId);
  return {
    code: `WH-${strId}`,
    name: warehouseName?.trim() || `Warehouse #${strId}`,
    fullName: warehouseName?.trim() || `Warehouse #${strId}`,
    address: warehouseName?.trim() || `Warehouse #${strId}`,
    shortAddress: warehouseName?.trim() || `WH #${strId}`,
  };
}

/** Fail closed when either record lacks a warehouse identity. */
export function isSameWarehouse(
  left?: number | string | null,
  right?: number | string | null
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  const leftId = String(left).trim();
  const rightId = String(right).trim();
  return leftId.length > 0 && rightId.length > 0 && leftId === rightId;
}

export function formatOrderDate(dateStr?: string | null): string {
  if (!dateStr) return "Today";
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return "Today";
  return dt.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPickByTime(dateStr?: string | null): string {
  if (!dateStr) return "Today";
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return "Today";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

export const CUBE_PALETTES = [
  { bg: "#FFEDD5", icon: "#EA580C", border: "#FED7AA" }, // Orange
  { bg: "#E0F2FE", icon: "#0284C7", border: "#BAE6FD" }, // Blue
  { bg: "#F3E8FF", icon: "#9333EA", border: "#E9D5FF" }, // Purple
  { bg: "#DCFCE7", icon: "#16A34A", border: "#BBF7D0" }, // Green
  { bg: "#F1F5F9", icon: "#475569", border: "#E2E8F0" }, // Slate
] as const;

export function getCubePalette(order?: FulfillmentOrderDto | any, index = 0) {
  return CUBE_PALETTES[(index + 1) % CUBE_PALETTES.length];
}

export function getOrderProgress(order: FulfillmentOrderDto | any): {
  pickedLines: number;
  totalLines: number;
  pickedUnits: number;
  totalUnits: number;
  remainingUnits: number;
  pct: number;
} {
  const items: FulfillmentOrderItemDto[] = order?.items || order?.lines || [];
  const totalLines = items.length || order?.totalItems || order?.totalLines || 0;
  const pickedLines = items.filter(
    (l) => l.fullyScanned || (l.pickedQty || 0) >= (l.orderedQty || 0)
  ).length;
  const totalUnits = items.reduce((sum, l) => sum + (l.orderedQty || 0), 0);
  const pickedUnits = items.reduce((sum, l) => sum + (l.pickedQty || 0), 0);
  const remainingUnits = Math.max(0, totalUnits - pickedUnits);
  const pct =
    totalLines > 0
      ? Math.min(100, Math.round((pickedLines / totalLines) * 100))
      : 0;
  return { pickedLines, totalLines, pickedUnits, totalUnits, remainingUnits, pct };
}

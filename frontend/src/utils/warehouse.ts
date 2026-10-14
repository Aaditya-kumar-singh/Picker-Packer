import type { Order, OrderLine } from "@/types";

export interface WarehouseDisplay {
  code: string;
  name: string;
  fullName: string;
  address: string;
  shortAddress: string;
}

const WAREHOUSE_MAP: Record<string, WarehouseDisplay> = {
  "WH-A": {
    code: "WH-A",
    name: "South Delhi - Ghitorni",
    fullName: "South Delhi - Ghitorni Warehouse",
    address: "A-114, Ghitorni, New Delhi, 110030",
    shortAddress: "A-114, New Delhi, 110030",
  },
  "WH-B": {
    code: "WH-B",
    name: "North Delhi - Rohini",
    fullName: "North Delhi - Rohini Warehouse",
    address: "B-42, Sector 18, Rohini, New Delhi, 110089",
    shortAddress: "B-42, New Delhi, 110089",
  },
};

export function getWarehouseDisplay(warehouseId?: string | null): WarehouseDisplay {
  const key = (warehouseId ?? "WH-A").trim().toUpperCase();
  if (WAREHOUSE_MAP[key]) return WAREHOUSE_MAP[key];
  return {
    code: key || "WH-A",
    name: warehouseId && warehouseId !== "WH-A" ? warehouseId : "South Delhi - Ghitorni",
    fullName:
      warehouseId && warehouseId !== "WH-A"
        ? `${warehouseId} Warehouse`
        : "South Delhi - Ghitorni Warehouse",
    address: "A-114, Ghitorni, New Delhi, 110030",
    shortAddress: "A-114, New Delhi, 110030",
  };
}

export function getBatchCount(lines: OrderLine[], totalLines = 0): number {
  if (!lines || lines.length === 0) return Math.max(1, totalLines);
  const zones = new Set(
    lines
      .map((l) => {
        const parts = (l.locationCode || "").split("-");
        return parts.length >= 3 ? parts.slice(0, 3).join("-") : l.locationCode || l.id;
      })
      .filter(Boolean),
  );
  return Math.max(1, zones.size);
}

export function formatPickByTime(slaDueAt?: string | null): string {
  if (!slaDueAt) return "10:30 AM";
  const dt = new Date(slaDueAt);
  if (Number.isNaN(dt.getTime())) return "10:30 AM";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function getPriorityMeta(priority: number): {
  label: "High Priority" | "Normal" | "Low Priority";
  shortLabel: "High" | "Standard" | "Low";
  bg: string;
  text: string;
  border: string;
} {
  if (priority >= 2) {
    return {
      label: "High Priority",
      shortLabel: "High",
      bg: "#FEE2E2",
      text: "#DC2626",
      border: "#FECACA",
    };
  }
  if (priority === 1) {
    return {
      label: "Normal",
      shortLabel: "Standard",
      bg: "#E0F2FE",
      text: "#0284C7",
      border: "#BAE6FD",
    };
  }
  return {
    label: "Normal",
    shortLabel: "Standard",
    bg: "#E0F2FE",
    text: "#0284C7",
    border: "#BAE6FD",
  };
}

export const CUBE_PALETTES = [
  { bg: "#FFEDD5", icon: "#EA580C", border: "#FED7AA" }, // Orange
  { bg: "#E0F2FE", icon: "#0284C7", border: "#BAE6FD" }, // Blue
  { bg: "#F3E8FF", icon: "#9333EA", border: "#E9D5FF" }, // Purple
  { bg: "#DCFCE7", icon: "#16A34A", border: "#BBF7D0" }, // Green
  { bg: "#F1F5F9", icon: "#475569", border: "#E2E8F0" }, // Slate
] as const;

export function getCubePalette(order: Order, index = 0) {
  if (order.priority >= 2) return CUBE_PALETTES[0];
  return CUBE_PALETTES[(index + 1) % CUBE_PALETTES.length];
}

export function getOrderProgress(order: Order): {
  pickedLines: number;
  totalLines: number;
  pickedUnits: number;
  totalUnits: number;
  remainingUnits: number;
  pct: number;
} {
  const totalLines = order.lines.length || order.totalLines || 0;
  const pickedLines = order.lines.filter(
    (l) => l.status === "PICKED" || l.pickedQty >= l.requiredQty,
  ).length;
  const totalUnits = order.lines.reduce((sum, l) => sum + (l.requiredQty || 0), 0);
  const pickedUnits = order.lines.reduce((sum, l) => sum + (l.pickedQty || 0), 0);
  const remainingUnits = Math.max(0, totalUnits - pickedUnits);
  const pct =
    totalLines > 0
      ? Math.min(100, Math.round((pickedLines / totalLines) * 100))
      : 0;
  return { pickedLines, totalLines, pickedUnits, totalUnits, remainingUnits, pct };
}

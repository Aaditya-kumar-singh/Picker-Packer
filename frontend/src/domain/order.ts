// Pure domain guards — no React, no I/O. Enforces documented state machines.
import type { Order, OrderLine } from "@/types";

export const TERMINAL_LINE = ["PICKED", "EXCEPTION", "SKIPPED"] as const;

export function normalizeBarcode(v: string): string {
  return v.trim().toUpperCase();
}

export function isTerminalLine(s: string): boolean {
  return (TERMINAL_LINE as readonly string[]).includes(s);
}

export function canStartOrder(o: Order): boolean {
  return o.status === "PENDING";
}

// PENDING → ASSIGNED (claim). Guards per State_Machine.md:
// active picker, no other active order owned, version match.
export function canClaimOrder(
  o: Order,
  myPickerCode: string,
  myOtherActiveOrderId: string | null,
  expectedVersion?: number
): { ok: boolean; code?: "CONFLICT" | "VERSION_MISMATCH"; reason?: string } {
  if (o.status !== "PENDING")
    return { ok: false, code: "CONFLICT", reason: `Order is ${o.status}, cannot claim` };
  if (expectedVersion !== undefined && o.version !== expectedVersion)
    return { ok: false, code: "VERSION_MISMATCH", reason: "Order changed since your last read" };
  if (myOtherActiveOrderId && myOtherActiveOrderId !== o.id)
    return { ok: false, code: "CONFLICT", reason: "Finish or release your current order first" };
  void myPickerCode;
  return { ok: true };
}

// ASSIGNED → IN_PROGRESS (device confirmed). Only the assigned picker
// on the claiming device may begin the pick session.
export function canBeginPicking(
  o: Order,
  pickerCode: string,
  deviceId: string,
  expectedVersion?: number
): { ok: boolean; code?: "CONFLICT" | "VERSION_MISMATCH" | "FORBIDDEN"; reason?: string } {
  if (o.status !== "ASSIGNED")
    return { ok: false, code: "CONFLICT", reason: `Order is ${o.status}, cannot begin picking` };
  if (expectedVersion !== undefined && o.version !== expectedVersion)
    return { ok: false, code: "VERSION_MISMATCH", reason: "Order changed since your last read" };
  if (o.assignedPickerCode !== pickerCode)
    return { ok: false, code: "FORBIDDEN", reason: "Order is assigned to another picker" };
  if (o.assignedDeviceId !== deviceId)
    return { ok: false, code: "FORBIDDEN", reason: "Order was claimed on a different device" };
  return { ok: true };
}

// PENDING | ASSIGNED | IN_PROGRESS → CANCELLED (WMS signal or SUPERVISOR).
export function canCancelOrder(o: Order): boolean {
  return o.status === "PENDING" || o.status === "ASSIGNED" || o.status === "IN_PROGRESS";
}

// Line-level ops (scan/pick/exception/complete-step) require an active order.
export function requireOrderActive(o: Order): { ok: boolean; reason?: string } {
  if (o.status === "IN_PROGRESS") return { ok: true };
  if (o.status === "ASSIGNED")
    return { ok: false, reason: "Order is ASSIGNED — begin the pick session first" };
  return { ok: false, reason: `Order is ${o.status}` };
}

export function canCompleteOrder(o: Order): { ok: boolean; reason?: string } {
  if (o.status !== "IN_PROGRESS") return { ok: false, reason: "Order is not IN_PROGRESS" };
  const pending = o.lines.filter((l) => !isTerminalLine(l.status));
  if (pending.length > 0)
    return { ok: false, reason: `${pending.length} line(s) not in terminal state` };
  const picked = o.lines.filter((l) => l.status === "PICKED").length;
  if (picked === 0) return { ok: false, reason: "At least one line must be PICKED" };
  return { ok: true };
}

export function nextPendingLine(o: Order): OrderLine | null {
  const sorted = [...o.lines].sort((a, b) => a.lineNo - b.lineNo);
  return sorted.find((l) => !isTerminalLine(l.status)) ?? null;
}

// ── Workflow routing: authoritative line.status → pick step ────────────
// Every pick-screen entry point and every pick screen itself derives the
// target from this, never from navigation history. The backend remains the
// enforcer (LINE_NOT_READY); this keeps the UI from asking illegally.
export type PickStep = "sku" | "quantity" | "complete";

// A single line's status → the step that owns it. Terminal statuses return
// null so callers advance to the next pending line instead of re-showing a
// completed step.
export function stepForLineStatus(status: string): "sku" | "quantity" | null {
  if (status === "PENDING" || status === "LOCATION_VALIDATED") return "sku";

  if (status === "SKU_VALIDATED") return "quantity";
  return null;
}

// First non-terminal line (route order) → its authoritative step.
// No active line (all PICKED/EXCEPTION/SKIPPED) → "complete".
// Unknown statuses fail closed to "sku" (the first step); the backend
// rejects with LINE_NOT_READY if the line genuinely is not ready.
export function resolvePickStep(o: Order): PickStep {
  const line = nextPendingLine(o);
  if (!line) return "complete";
  return stepForLineStatus(line.status) ?? "sku";
}

// Full pick-route path for an order, e.g. "/pick/<id>/quantity".
export function pickStepPath(orderId: string, o: Order): string {
  return `/pick/${orderId}/${resolvePickStep(o)}`;
}

export function validateQuantity(args: {
  qty: number;
  requiredQty: number;
  pickedQty: number;
  uom: string;
  expectedUom: string;
}): { ok: boolean; code?: "INVALID_QTY" | "OVER_PICK" | "UOM_MISMATCH"; message?: string } {
  const remaining = args.requiredQty - args.pickedQty;
  if (!Number.isFinite(args.qty) || args.qty <= 0)
    return { ok: false, code: "INVALID_QTY", message: "Quantity must be greater than 0" };
  if (args.uom !== args.expectedUom)
    return { ok: false, code: "UOM_MISMATCH", message: `UOM must be ${args.expectedUom}` };
  if (args.qty > remaining)
    return { ok: false, code: "OVER_PICK", message: `Quantity exceeds remaining ${remaining}` };
  return { ok: true };
}

export function isShortPick(qty: number, requiredQty: number): boolean {
  return qty < requiredQty;
}

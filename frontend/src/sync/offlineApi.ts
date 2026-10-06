// Offline-first IPickerApi: online-first, durable-queue fallback.
// Screens keep calling the repository exactly as before.
// Queueable offline (validated against the cached snapshot, server
// re-validates authoritatively on sync): validateLocation, validateSku,
// pickQuantity, createException, beginPicking (ASSIGNED→IN_PROGRESS),
// completeOrder. Everything else returns an honest offline error — never a
// fabricated success, never a WMS claim.
import type { RowStore } from "@/storage/store";
import type { Connectivity } from "./connectivity";
import { newClientEventId } from "./events";
import type { SyncLogger } from "./logger";
import { findCachedLine, loadActiveSnapshot, loadOrderSnapshot, patchCachedLine, saveOrderSnapshot } from "./orderCache";
import type { IPickerApi } from "@/services/pickerApi";
import type { EvidenceItem, EvidenceUploadGrant, ExceptionType, LineException, Order, OrderLine, Result } from "@/types";

export const OFFLINE_ERROR = "OFFLINE";
export const NOT_QUEUEABLE = "OFFLINE_NOT_QUEUEABLE";

function offline<T>(message: string): Result<T> {
  return {
    ok: false,
    apiError: { error: OFFLINE_ERROR, message, details: [], requestId: "", timestamp: new Date().toISOString() },
  };
}

function normalize(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

interface OfflineDeps {
  online: IPickerApi;
  store: RowStore;
  connectivity: Connectivity;
  deviceId: string;
  log?: SyncLogger;
}

const TERMINAL = ["PICKED", "EXCEPTION", "SKIPPED"];

export class OfflineFirstPickerApi implements IPickerApi {
  // NOTE: no TS parameter properties (Node strip-only mode must load this).
  private readonly deps: OfflineDeps;
  constructor(deps: OfflineDeps) {
    this.deps = deps;
  }

  private log(kind: Parameters<NonNullable<OfflineDeps["log"]>>[0]["kind"], clientEventId?: string, detail?: string): void {
    this.deps.log?.({ kind, at: new Date().toISOString(), clientEventId, detail });
  }

  private async enqueue(
    eventType: string,
    opts: {
      entityType: string;
      entityId: string;
      orderId: string | null;
      lineId: string | null;
      payload: Record<string, unknown>;
      existingClientEventId?: string;
    },
  ): Promise<string> {
    const clientEventId = opts.existingClientEventId ?? newClientEventId();
    await this.deps.store.insertOutbox({
      clientEventId,
      eventType,
      entityType: opts.entityType,
      entityId: opts.entityId,
      orderId: opts.orderId,
      lineId: opts.lineId,
      payloadJson: JSON.stringify(opts.payload),
      occurredAt: new Date().toISOString(),
      deviceId: this.deps.deviceId,
    });
    this.log("event_queued", clientEventId, opts.entityType);
    return clientEventId;
  }

  private isNetworkError<T>(r: Result<T>): boolean {
    return !r.ok && r.apiError.error === "NETWORK_ERROR";
  }

  // ── Auth: online only ──────────────────────────────────────────────
  requestOtp(pickerId: string): Promise<Result<{ expiresInSeconds: number; maskedContact: string }>> {
    return this.deps.online.requestOtp(pickerId);
  }
  async verifyOtp(pickerId: string, otp: string, deviceId: string): Promise<Result<import("@/types").AuthResponse>> {
    const r = await this.deps.online.verifyOtp(pickerId, otp, deviceId);
    if (r.ok) {
      await this.deps.store.setMeta("pickerCode", r.data.picker.pickerCode);
      await this.deps.store.setMeta("deviceId", deviceId);
    }
    return r;
  }
  logout(): Promise<void> {
    return this.deps.online.logout();
  }
  refreshToken(t: string): Promise<Result<import("@/types").AuthResponse>> {
    return this.deps.online.refreshToken(t);
  }

  // ── Reads ──────────────────────────────────────────────────────────
  async getDashboard(): Promise<Result<import("@/services/pickerApi").DashboardData>> {
    const r = await this.deps.online.getDashboard();
    if (!this.isNetworkError(r)) return r;
    this.deps.connectivity.set("OFFLINE");
    return offline("Dashboard needs a connection. Your queued work is safe.");
  }
  async getOrders(): Promise<Result<Order[]>> {
    const r = await this.deps.online.getOrders();
    if (!this.isNetworkError(r)) return r;
    this.deps.connectivity.set("OFFLINE");
    return offline("Order list needs a connection. Open your active order from cache if available.");
  }
  async getOrder(id: string): Promise<Result<Order>> {
    const r = await this.deps.online.getOrder(id);
    if (!this.isNetworkError(r)) {
      if (r.ok) await saveOrderSnapshot(this.deps.store, r.data);
      return r;
    }
    this.deps.connectivity.set("OFFLINE");
    const cached = await loadOrderSnapshot(this.deps.store, id);
    if (cached) return { ok: true, data: cached };
    return offline("Order not cached. Connect to load it.");
  }

  // ── Claim/begin ────────────────────────────────────────────────────
  async startOrder(id: string, k: string, deviceId?: string, expectedVersion?: number): Promise<Result<Order>> {
    const r = await this.deps.online.startOrder(id, k, deviceId, expectedVersion);
    if (!this.isNetworkError(r)) {
      if (r.ok) await saveOrderSnapshot(this.deps.store, r.data);
      return r;
    }
    this.deps.connectivity.set("OFFLINE");
    return {
      ok: false,
      apiError: {
        error: NOT_QUEUEABLE,
        message: "Claiming an order needs a connection (server owns assignment).",
        details: [],
        requestId: "",
        timestamp: new Date().toISOString(),
      },
    };
  }

  async beginPicking(id: string, deviceId: string, k: string, expectedVersion?: number): Promise<Result<Order>> {
    const online = await this.deps.online.beginPicking(id, deviceId, k, expectedVersion);
    if (!this.isNetworkError(online)) {
      if (online.ok) await saveOrderSnapshot(this.deps.store, online.data);
      return online;
    }
    this.deps.connectivity.set("OFFLINE");
    // Offline begin: allowed only on the cached ASSIGNED order owned by this
    // picker+device. Queued as ORDER_STARTED; server confirms on sync.
    const cached = await loadOrderSnapshot(this.deps.store, id);
    if (!cached) return offline("Order not cached. Connect to begin picking.");
    const me = await this.deps.store.getMeta("pickerCode");
    if (cached.status !== "ASSIGNED") {
      return offline(`Order is ${cached.status} locally. Connect to continue.`);
    }
    if (cached.assignedPickerCode !== me || cached.assignedDeviceId !== deviceId) {
      return offline("This order was claimed by another picker or device.");
    }
    void expectedVersion;
    await this.enqueue("ORDER_STARTED", {
      entityType: "ORDER",
      entityId: id,
      orderId: id,
      lineId: null,
      payload: { deviceId },
    });
    const next: Order = { ...cached, status: "IN_PROGRESS", startedAt: new Date().toISOString() };
    await saveOrderSnapshot(this.deps.store, next);
    return { ok: true, data: next };
  }

  async cancelOrder(id: string, reason?: string): Promise<Result<Order>> {
    const r = await this.deps.online.cancelOrder(id, reason);
    if (!this.isNetworkError(r)) return r;
    this.deps.connectivity.set("OFFLINE");
    return offline("Cancelling needs a connection.");
  }

  async skipLine(lineId: string, actorRole: string): Promise<Result<OrderLine>> {
    const r = await this.deps.online.skipLine(lineId, actorRole);
    if (!this.isNetworkError(r)) return r;
    this.deps.connectivity.set("OFFLINE");
    return offline("Supervisor skip needs a connection.");
  }

  // ── Line ops: offline-capable against cache ─────────────────────────
  async validateLocation(lineId: string, scanValue: string): Promise<Result<OrderLine>> {
    const online = await this.deps.online.validateLocation(lineId, scanValue);
    if (!this.isNetworkError(online)) {
      if (online.ok) await patchCachedLine(this.deps.store, online.data);
      return online;
    }
    this.deps.connectivity.set("OFFLINE");
    const found = await findCachedLine(this.deps.store, lineId);
    if (!found) return offline("Line not cached. Connect to continue.");
    const { order, line } = found;
    if (order.status !== "IN_PROGRESS") {
      return offline(`Order is ${order.status} locally. Begin the pick session online first.`);
    }
    if (TERMINAL.includes(line.status)) {
      return { ok: false, apiError: { error: "LINE_ALREADY_PICKED", message: "This line is already complete", details: [], requestId: "", timestamp: new Date().toISOString() } };
    }
    if (line.status !== "PENDING") {
      return offline(`Line is ${line.status} locally.`);
    }
    if (normalize(scanValue) !== normalize(line.locationBarcode)) {
      // Wrong scans block even offline — nothing queued.
      return { ok: false, apiError: { error: "WRONG_LOCATION", message: "Scanned location does not match the cached expected location", details: [], requestId: "", timestamp: new Date().toISOString() } };
    }
    await this.enqueue("LOCATION_SCANNED", {
      entityType: "ORDER_LINE",
      entityId: lineId,
      orderId: order.id,
      lineId,
      payload: { scanValue: normalize(scanValue) },
    });
    const next: OrderLine = { ...line, status: "LOCATION_VALIDATED" };
    await patchCachedLine(this.deps.store, next);
    return { ok: true, data: next };
  }

  async validateSku(lineId: string, scanValue: string): Promise<Result<OrderLine>> {
    const online = await this.deps.online.validateSku(lineId, scanValue);
    if (!this.isNetworkError(online)) {
      if (online.ok) await patchCachedLine(this.deps.store, online.data);
      return online;
    }
    this.deps.connectivity.set("OFFLINE");
    const found = await findCachedLine(this.deps.store, lineId);
    if (!found) return offline("Line not cached. Connect to continue.");
    const { order, line } = found;
    if (order.status !== "IN_PROGRESS") return offline(`Order is ${order.status} locally.`);
    if (TERMINAL.includes(line.status)) {
      return { ok: false, apiError: { error: "LINE_ALREADY_PICKED", message: "This line is already complete", details: [], requestId: "", timestamp: new Date().toISOString() } };
    }
    if (line.status !== "LOCATION_VALIDATED") {
      return offline("Scan the location barcode first.");
    }
    if (normalize(scanValue) !== normalize(line.skuBarcode)) {
      return { ok: false, apiError: { error: "WRONG_SKU", message: "Scanned item does not match the cached expected SKU", details: [], requestId: "", timestamp: new Date().toISOString() } };
    }
    await this.enqueue("SKU_SCANNED", {
      entityType: "ORDER_LINE",
      entityId: lineId,
      orderId: order.id,
      lineId,
      payload: { scanValue: normalize(scanValue) },
    });
    const next: OrderLine = { ...line, status: "SKU_VALIDATED" };
    await patchCachedLine(this.deps.store, next);
    return { ok: true, data: next };
  }

  async pickQuantity(lineId: string, qty: number, uom: string, idemKey: string): Promise<Result<OrderLine>> {
    const online = await this.deps.online.pickQuantity(lineId, qty, uom, idemKey);
    if (!this.isNetworkError(online)) {
      if (online.ok) await patchCachedLine(this.deps.store, online.data);
      return online;
    }
    this.deps.connectivity.set("OFFLINE");
    const found = await findCachedLine(this.deps.store, lineId);
    if (!found) return offline("Line not cached. Connect to continue.");
    const { order, line } = found;
    if (order.status !== "IN_PROGRESS") return offline(`Order is ${order.status} locally.`);
    if (line.status !== "SKU_VALIDATED") return offline("Validate location and SKU first.");
    const remaining = line.requiredQty - line.pickedQty;
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, apiError: { error: "INVALID_QTY", message: "Quantity must be greater than 0", details: [], requestId: "", timestamp: new Date().toISOString() } };
    }
    if (uom !== line.uom) {
      return { ok: false, apiError: { error: "INVALID_QTY", message: `UOM must be ${line.uom}`, details: [], requestId: "", timestamp: new Date().toISOString() } };
    }
    if (qty > remaining) {
      return { ok: false, apiError: { error: "OVER_PICK", message: `Quantity exceeds remaining ${remaining}`, details: [], requestId: "", timestamp: new Date().toISOString() } };
    }
    await this.enqueue("QTY_CONFIRMED", {
      entityType: "ORDER_LINE",
      entityId: lineId,
      orderId: order.id,
      lineId,
      payload: { qty, uom, sku: line.skuBarcode },
    });
    // Mirror the server short-pick rule locally so the exception flow works.
    const pickedQty = line.pickedQty + qty;
    const next: OrderLine = { ...line, pickedQty, status: pickedQty >= line.requiredQty ? "PICKED" : "SKU_VALIDATED" };
    await patchCachedLine(this.deps.store, next);
    return { ok: true, data: next };
  }

  async createException(
    lineId: string,
    type: ExceptionType,
    reasonCode: string,
    qty: number | null,
    note: string | null,
    idemKey: string,
    evidenceKeys?: string[],
  ): Promise<Result<LineException>> {
    const online = await this.deps.online.createException(lineId, type, reasonCode, qty, note, idemKey, evidenceKeys);
    if (!this.isNetworkError(online)) return online;
    this.deps.connectivity.set("OFFLINE");
    if (evidenceKeys && evidenceKeys.length > 0) {
      // Photo bytes cannot upload offline, and keys cannot be minted without
      // the server — queueing without them would silently drop user data.
      return {
        ok: false,
        apiError: {
          error: NOT_QUEUEABLE,
          message: "Photo evidence needs a connection. Submit the exception without photos, or retry online.",
          details: [],
          requestId: "",
          timestamp: new Date().toISOString(),
        },
      };
    }
    const found = await findCachedLine(this.deps.store, lineId);
    if (!found) return offline("Line not cached. Connect to continue.");
    const { order, line } = found;
    if (order.status !== "IN_PROGRESS") return offline(`Order is ${order.status} locally.`);
    if (TERMINAL.includes(line.status)) {
      return { ok: false, apiError: { error: "LINE_ALREADY_PICKED", message: `Line is ${line.status}`, details: [], requestId: "", timestamp: new Date().toISOString() } };
    }
    if (!reasonCode.trim()) {
      return { ok: false, apiError: { error: "VALIDATION_ERROR", message: "Reason is required", details: [], requestId: "", timestamp: new Date().toISOString() } };
    }
    const clientEventId = await this.enqueue("EXCEPTION_RAISED", {
      entityType: "ORDER_LINE",
      entityId: lineId,
      orderId: order.id,
      lineId,
      payload: { type, reasonCode: reasonCode.trim(), qty, note },
    });
    const next: OrderLine = { ...line, status: "EXCEPTION" };
    await patchCachedLine(this.deps.store, next);
    // Optimistic id: replaced by the server id on sync; UI never displays it.
    return {
      ok: true,
      data: { id: clientEventId, lineId, type, reasonCode: reasonCode.trim(), qty, note, createdAt: new Date().toISOString() },
    };
  }

  async completeOrder(id: string, idemKey: string, expectedVersion?: number): Promise<Result<Order>> {
    const online = await this.deps.online.completeOrder(id, idemKey, expectedVersion);
    if (!this.isNetworkError(online)) {
      if (online.ok) await saveOrderSnapshot(this.deps.store, online.data);
      return online;
    }
    this.deps.connectivity.set("OFFLINE");
    const cached = await loadActiveSnapshot(this.deps.store);
    if (!cached || cached.id !== id) return offline("Order not cached. Connect to complete it.");
    const open = cached.lines.filter((l) => !TERMINAL.includes(l.status));
    if (cached.status !== "IN_PROGRESS" || open.length > 0) {
      return offline("Order has unresolved lines locally. Connect to continue.");
    }
    if (!cached.lines.some((l) => l.status === "PICKED")) {
      return offline("At least one picked line is required.");
    }
    await this.enqueue("ORDER_COMPLETED", {
      entityType: "ORDER",
      entityId: id,
      orderId: id,
      lineId: null,
      payload: {},
    });
    // Locally complete; WMS stays NONE — sync + server ack decide the rest.
    const next: Order = { ...cached, status: "COMPLETED", completedAt: new Date().toISOString() };
    await saveOrderSnapshot(this.deps.store, next);
    return { ok: true, data: next };
  }

  // ── Evidence: online only (bytes cannot queue) ──────────────────────
  private evidenceOffline<T>(): Result<T> {
    return {
      ok: false,
      apiError: {
        error: NOT_QUEUEABLE,
        message: "Photo evidence needs a connection. Your exception is already saved — attach the photo when back online.",
        details: [],
        requestId: "",
        timestamp: new Date().toISOString(),
      },
    };
  }

  async grantEvidenceUpload(
    exceptionId: string,
    fileName: string,
    mimeType: string,
    fileSizeBytes?: number,
  ): Promise<Result<EvidenceUploadGrant>> {
    const online = await this.deps.online.grantEvidenceUpload(exceptionId, fileName, mimeType, fileSizeBytes);
    if (!this.isNetworkError(online)) return online;
    this.deps.connectivity.set("OFFLINE");
    return this.evidenceOffline();
  }

  async uploadEvidenceBytes(
    uploadUrl: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<Result<{ objectKey: string }>> {
    const online = await this.deps.online.uploadEvidenceBytes(uploadUrl, bytes, mimeType);
    if (!this.isNetworkError(online)) return online;
    this.deps.connectivity.set("OFFLINE");
    return this.evidenceOffline();
  }

  async completeEvidenceUpload(exceptionId: string, evidenceId: string): Promise<Result<EvidenceItem>> {
    const online = await this.deps.online.completeEvidenceUpload(exceptionId, evidenceId);
    if (!this.isNetworkError(online)) return online;
    this.deps.connectivity.set("OFFLINE");
    return this.evidenceOffline();
  }

  async listExceptionEvidence(exceptionId: string): Promise<Result<EvidenceItem[]>> {
    const online = await this.deps.online.listExceptionEvidence(exceptionId);
    if (!this.isNetworkError(online)) return online;
    this.deps.connectivity.set("OFFLINE");
    return this.evidenceOffline();
  }

  setWmsMode(m: Parameters<IPickerApi["setWmsMode"]>[0]): void {
    this.deps.online.setWmsMode(m);
  }
  getWmsMode(): ReturnType<IPickerApi["getWmsMode"]> {
    return this.deps.online.getWmsMode();
  }
  simulateTakenByOther(id: string, t: boolean): void {
    this.deps.online.simulateTakenByOther(id, t);
  }
  simulateSupervisor(on: boolean): void {
    this.deps.online.simulateSupervisor(on);
  }
}

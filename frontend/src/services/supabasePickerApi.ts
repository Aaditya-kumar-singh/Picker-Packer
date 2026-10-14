import type { IPickerApi } from "@/services/pickerApi";
import type { SyncBatchResponse } from "@/sync/events";
import type { Order, OrderLine, PickerProfile, Result, WmsMode, AuthResponse, EvidenceItem, EvidenceUploadGrant, LineException } from "@/types";
import * as client from "@/api/client";
import { setAuthToken } from "@/api/http";

let expiredHandler: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) { expiredHandler = fn; }

function mapStatus(s: string): Order["status"] {
  if (s === "ASSIGNED") return "ASSIGNED";
  if (s === "PICKING") return "IN_PROGRESS";
  if (["READY_FOR_PACKING", "PACKING", "PACKED", "RIDER_ASSIGNED"].includes(s)) return "COMPLETED";
  return "PENDING";
}

function toLine(l: client.OrderItem, idx = 0): OrderLine {
  return {
    id: l.id, lineNo: idx + 1, skuCode: l.sku, skuName: l.productName, productSpecs: l.productSpecs, productImageUrl: l.productImageUrl ?? null, skuBarcode: l.skuBarcode,
    locationCode: l.location, locationBarcode: l.locationBarcode, requiredQty: l.requiredQty,
    pickedQty: l.pickedQty, uom: "EA",
    status: l.lineStatus ?? (l.pickedQty >= l.requiredQty ? "PICKED" : "PENDING"),
  };
}

function toOrder(o: client.OrderSummary): Order {
  return {
    id: o.id, externalId: o.orderNumber, status: mapStatus(o.status),
    priority: o.priority === "URGENT" ? 2 : o.priority === "HIGH" ? 1 : 0,
    slaDueAt: new Date(new Date(o.createdAt).getTime() + o.slaMinutes * 60000).toISOString(),
    totalLines: o.itemCount ?? o.items?.length ?? 0, version: 1, assignedPickerCode: o.pickerId ?? null,
    assignedDeviceId: null, assignedAt: o.createdAt, startedAt: o.updatedAt ?? null,
    cancelledAt: null, lines: (o.items ?? []).map((x, i) => toLine(x, i)), wmsStatus: "SYNCED",
    completedAt: o.status === "READY_FOR_PACKING" ? o.updatedAt ?? null : null,
  };
}

function err(e: unknown): Result<any> {
  return { ok: false, apiError: {
    error: "API_ERROR", message: e instanceof Error ? e.message : "API request failed",
    details: [], requestId: "", timestamp: new Date().toISOString(),
  }};
}

class SupabasePickerApi {
  private picker: PickerProfile | null = null;
  private orderCache = new Map<string, { detail: client.OrderDetail; cachedAt: number }>();
  private lineOrderIndex = new Map<string, string>();
  private ordersCache: { data: Order[]; cachedAt: number } | null = null;
  private orderGeneration = new Map<string, number>();
  private readonly cacheMs = 3000;

  private invalidateOrder(id: string) {
    this.orderGeneration.set(id, (this.orderGeneration.get(id) ?? 0) + 1);
    this.orderCache.delete(id);
    this.ordersCache = null;
  }
  private wmsMode: WmsMode = "WMS_SUCCESS";

  restoreSession(accessToken: string, _refreshToken: string, picker: PickerProfile) {
    client.setAccessToken(accessToken);
    this.picker = picker;
  }

  setSessionPicker(picker: PickerProfile) { this.picker = picker; }

  async requestOtp(_pickerId: string): Promise<Result<{ expiresInSeconds: number; maskedContact: string }>> {
    return { ok: false, apiError: { error: "UNSUPPORTED", message: "Use email/password authentication", details: [], requestId: "", timestamp: new Date().toISOString() } };
  }

  async verifyOtp(_pickerId: string, _otp: string, _deviceId: string): Promise<Result<AuthResponse>> {
    return { ok: false, apiError: { error: "UNSUPPORTED", message: "Use email/password authentication", details: [], requestId: "", timestamp: new Date().toISOString() } };
  }

  async logout() {
    await setAuthToken(null);
    this.picker = null;
    client.setAccessToken(null);
  }

  async getDashboard() {
    try {
      const [metrics, me, orders] = await Promise.all([client.pickerMetrics(), client.me(), client.pickerOrders()]);
      const active = orders.orders.find(o => o.status === "PICKING");
      const activeOrder = active ? toOrder(active) : null;
      return { ok: true, data: {
        pickerName: me.user.name, pickerCode: me.user.email, warehouseName: me.user.warehouseId,
        pendingCount: orders.orders.filter(o => o.status === "ASSIGNED").length,
        activeOrder, completedToday: metrics.ordersPicked, online: true, metrics,
      }};
    } catch (e) { return err(e); }
  }

  async getOrders() {
    const now = Date.now();
    if (this.ordersCache && now - this.ordersCache.cachedAt < this.cacheMs) {
      return { ok: true, data: this.ordersCache.data };
    }
    try {
      const orders = await client.pickerOrders();
      const data = orders.orders.map(o => {
        for (const item of o.items ?? []) this.lineOrderIndex.set(item.id, o.id);
        return toOrder(o);
      });
      this.ordersCache = { data, cachedAt: now };
      return { ok: true, data };
    } catch (e) { return err(e); }
  }

  async getOrder(id: string) {
    const cached = this.orderCache.get(id);
    if (cached && Date.now() - cached.cachedAt < this.cacheMs) {
      return { ok: true, data: toOrder(cached.detail) };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generation = this.orderGeneration.get(id) ?? 0;
      try {
        const detail = (await client.pickerOrder(id)).order;
        if ((this.orderGeneration.get(id) ?? 0) !== generation) continue;

        this.orderCache.set(id, { detail, cachedAt: Date.now() });
        for (const item of detail.items) this.lineOrderIndex.set(item.id, id);
        return { ok: true, data: toOrder(detail) };
      } catch (e) {
        return err(e);
      }
    }

    try {
      const detail = (await client.pickerOrder(id)).order;
      this.orderCache.set(id, { detail, cachedAt: Date.now() });
      for (const item of detail.items) this.lineOrderIndex.set(item.id, id);
      return { ok: true, data: toOrder(detail) };
    } catch (e) {
      return err(e);
    }
  }

  async startOrder(id: string, key: string) {
    this.invalidateOrder(id);
    try {
      await client.pickerStart(id, key);
      this.invalidateOrder(id);
      return this.getOrder(id);
    } catch (e) {
      this.invalidateOrder(id);
      return err(e);
    }
  }

  async beginPicking(id: string, _deviceId: string, key: string) { return this.startOrder(id, key); }

  async cancelOrder() { return err(new Error("Order cancellation is not implemented")); }
  async skipLine() { return err(new Error("Line skipping is not implemented")); }

  private cachedLine(lineId: string) {
    const orderId = this.lineOrderIndex.get(lineId);
    const detail = orderId ? this.orderCache.get(orderId) : undefined;
    return detail?.detail.items.find(i => i.id === lineId) ?? null;
  }

  async validateLocation(lineId: string, scanValue: string) {
    const orderId = this.lineOrderIndex.get(lineId);
    const item = this.cachedLine(lineId);
    if (!orderId || !item) return err(new Error("Line context expired. Reload the order."));
    this.invalidateOrder(orderId);
    try {
      const r = await client.validateLocation(orderId, lineId, scanValue, "");
      if (!r.valid) return err(new Error("Location barcode does not match"));

      this.invalidateOrder(orderId);
      const fresh = await this.getOrder(orderId);
      if (!fresh.ok) return fresh;
      const freshLine = fresh.data.lines.find((l: OrderLine) => l.id === lineId);
      if (!freshLine) return err(new Error("Validated line disappeared from order"));
      return { ok: true, data: freshLine };
    } catch (e) {
      this.invalidateOrder(orderId);
      return err(e);
    }
  }

  async validateSku(lineId: string, scanValue: string) {
    const orderId = this.lineOrderIndex.get(lineId);
    const item = this.cachedLine(lineId);
    if (!orderId || !item) return err(new Error("Line context expired. Reload the order."));
    this.invalidateOrder(orderId);
    try {
      await client.validatePickSku(orderId, lineId, scanValue, "");

      this.invalidateOrder(orderId);
      const fresh = await this.getOrder(orderId);
      if (!fresh.ok) return fresh;
      const freshLine = fresh.data.lines.find((l: OrderLine) => l.id === lineId);
      if (!freshLine) return err(new Error("Validated line disappeared from order"));
      return { ok: true, data: freshLine };
    } catch (e) {
      this.invalidateOrder(orderId);
      return err(e);
    }
  }

  async pickQuantity(lineId: string, qty: number, _uom: string, key: string) {
    const orderId = this.lineOrderIndex.get(lineId);
    const item = this.cachedLine(lineId);
    if (!orderId || !item) return err(new Error("Line context expired. Reload the order."));

    this.invalidateOrder(orderId);
    try {
      await client.pickItem(orderId, lineId, item.skuBarcode, qty, key);

      this.invalidateOrder(orderId);
      const fresh = await this.getOrder(orderId);
      if (!fresh.ok) return fresh;

      const freshLine = fresh.data.lines.find((l: OrderLine) => l.id === lineId);
      if (!freshLine) return err(new Error("Picked line disappeared from order"));

      return { ok: true, data: freshLine };
    } catch (e) {
      this.invalidateOrder(orderId);
      return err(e);
    }
  }

  async createException(lineId: string, type: LineException["type"], reasonCode: string, qty: number | null, note: string | null, key: string) {
    try {
      const orders = await client.pickerOrders();
      const active = orders.orders.find(o => o.status === "PICKING");
      if (!active) return err(new Error("No active picking order"));
      this.invalidateOrder(active.id);
      const r = await client.createException(active.id, { itemId: lineId, type, reasonCode, quantity: qty, note }, key);
      this.invalidateOrder(active.id);
      return { ok: true, data: { id: r.exception.id, lineId, type, reasonCode, qty, note, createdAt: new Date().toISOString() } };
    } catch (e) { return err(e); }
  }

  async completeOrder(id: string, key: string) {
    this.invalidateOrder(id);
    try {
      await client.pickerComplete(id, key);
      this.invalidateOrder(id);
      return this.getOrder(id);
    } catch (e) {
      this.invalidateOrder(id);
      return err(e);
    }
  }

  async grantEvidenceUpload(exceptionId: string, fileName: string, mimeType: string, fileSizeBytes?: number): Promise<Result<EvidenceUploadGrant>> {
    try { return { ok: true, data: await client.grantEvidenceUpload(exceptionId, fileName, mimeType, fileSizeBytes) }; }
    catch (e) { return err(e); }
  }
  async uploadEvidenceBytes(uploadUrl: string, bytes: Uint8Array, mimeType: string): Promise<Result<{ objectKey: string }>> {
    try { return { ok: true, data: await client.uploadEvidenceBytes(uploadUrl, bytes, mimeType) }; }
    catch (e) { return err(e); }
  }
  async completeEvidenceUpload(exceptionId: string, evidenceId: string): Promise<Result<EvidenceItem>> {
    try {
      const d = await client.completeEvidenceUpload(exceptionId, evidenceId);
      return { ok: true, data: {
        id: String(d.id), objectKey: String(evidenceId), mimeType: "image/jpeg",
        fileSizeBytes: null, status: String(d.status), uploadAttempts: 1,
        lastError: null, createdAt: new Date().toISOString(), uploadedAt: new Date().toISOString(),
      }};
    } catch (e) { return err(e); }
  }
  async listExceptionEvidence(exceptionId: string): Promise<Result<EvidenceItem[]>> {
    try {
      const rows = await client.listExceptionEvidence(exceptionId);
      return { ok: true, data: rows.map(d => ({
        id: String(d.id), objectKey: String(d.objectKey), mimeType: String(d.mimeType),
        fileSizeBytes: d.fileSizeBytes == null ? null : Number(d.fileSizeBytes),
        status: String(d.status), uploadAttempts: Number(d.uploadAttempts ?? 0),
        lastError: d.lastError == null ? null : String(d.lastError),
        createdAt: String(d.createdAt), uploadedAt: d.uploadedAt == null ? null : String(d.uploadedAt),
      })) };
    } catch (e) { return err(e); }
  }
  async refreshToken(): Promise<Result<AuthResponse>> { return err(new Error("JWT manages session refresh")); }
  async syncEvents(batch: any): Promise<Result<SyncBatchResponse>> {
    try { return { ok: true, data: await client.syncEvents(batch) }; } catch (e) { return err(e); }
  }
  setWmsMode(mode: WmsMode) { this.wmsMode = mode; }
  getWmsMode() { return this.wmsMode; }
  simulateTakenByOther() {}
  simulateSupervisor() {}
}

export const supabasePickerApi = new SupabasePickerApi() as unknown as IPickerApi & {
  syncEvents(batch: any): Promise<{ processedCount: number; results: any[]; conflicts: any[] }>;
};

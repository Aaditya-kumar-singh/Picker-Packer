import type { IPickerApi } from "@/services/pickerApi";
import type { SyncBatchResponse } from "@/sync/events";
import type { Order, OrderLine, PickerProfile, Result, WmsMode, AuthResponse, EvidenceItem, EvidenceUploadGrant, LineException } from "@/types";
import * as client from "@/api/client";
import { newClientEventId } from "@/sync/events";

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
    id: l.id, lineNo: idx + 1, skuCode: l.sku, skuName: l.productName, productSpecs: l.productSpecs, skuBarcode: l.skuBarcode,
    locationCode: l.location, locationBarcode: l.locationBarcode, requiredQty: l.requiredQty,
    pickedQty: l.pickedQty, uom: "EA",
    status: l.lineStatus ?? (l.pickedQty >= l.requiredQty ? "PICKED" : "PENDING"),
  };
}

function toOrder(o: client.OrderDetail): Order {
  return {
    id: o.id, externalId: o.id, status: mapStatus(o.status),
    priority: o.priority === "URGENT" ? 2 : o.priority === "HIGH" ? 1 : 0,
    slaDueAt: new Date(new Date(o.createdAt).getTime() + o.slaMinutes * 60000).toISOString(),
    totalLines: o.items.length, version: 1, assignedPickerCode: o.pickerId ?? null,
    assignedDeviceId: null, assignedAt: o.createdAt, startedAt: o.updatedAt ?? null,
    cancelledAt: null, lines: o.items.map((x, i) => toLine(x, i)), wmsStatus: "SYNCED",
    completedAt: o.status === "READY_FOR_PACKING" ? o.updatedAt ?? null : null,
  };
}

function err(e: unknown): Result<any> {
  return { ok: false, apiError: {
    error: "SUPABASE_ERROR", message: e instanceof Error ? e.message : "Supabase request failed",
    details: [], requestId: "", timestamp: new Date().toISOString(),
  }};
}

class SupabasePickerApi {
  private picker: PickerProfile | null = null;
  private wmsMode: WmsMode = "WMS_SUCCESS";

  restoreSession(accessToken: string, _refreshToken: string, picker: PickerProfile) {
    client.setAccessToken(accessToken);
    this.picker = picker;
  }

  setSessionPicker(picker: PickerProfile) { this.picker = picker; }

  async requestOtp(_pickerId: string): Promise<Result<{ expiresInSeconds: number; maskedContact: string }>> {
    return { ok: false, apiError: { error: "UNSUPPORTED", message: "Use Supabase email/password authentication", details: [], requestId: "", timestamp: new Date().toISOString() } };
  }

  async verifyOtp(_pickerId: string, _otp: string, _deviceId: string): Promise<Result<AuthResponse>> {
    return { ok: false, apiError: { error: "UNSUPPORTED", message: "Use Supabase email/password authentication", details: [], requestId: "", timestamp: new Date().toISOString() } };
  }

  async logout() {
    const { supabase } = await import("@/api/supabase");
    await supabase.auth.signOut();
    this.picker = null;
    client.setAccessToken(null);
  }

  async getDashboard() {
    try {
      const [metrics, me, orders] = await Promise.all([client.pickerMetrics(), client.me(), client.pickerOrders()]);
      const active = orders.orders.find(o => o.status === "PICKING");
      let activeOrder: Order | null = null;
      if (active) activeOrder = toOrder((await client.pickerOrder(active.id)).order);
      return { ok: true, data: {
        pickerName: me.user.name, pickerCode: me.user.email, warehouseName: me.user.warehouseId,
        pendingCount: orders.orders.filter(o => o.status === "ASSIGNED").length,
        activeOrder, completedToday: metrics.ordersPicked, online: true, metrics,
      }};
    } catch (e) { return err(e); }
  }

  async getOrders() {
    try {
      const orders = await client.pickerOrders();
      const data = await Promise.all(orders.orders.map(async o => toOrder((await client.pickerOrder(o.id)).order)));
      return { ok: true, data };
    } catch (e) { return err(e); }
  }

  async getOrder(id: string) {
    try { return { ok: true, data: toOrder((await client.pickerOrder(id)).order) }; }
    catch (e) { return err(e); }
  }

  async startOrder(id: string, key: string) {
    try { await client.pickerStart(id, key); return this.getOrder(id); } catch (e) { return err(e); }
  }

  async beginPicking(id: string, _deviceId: string, key: string) { return this.startOrder(id, key); }

  async cancelOrder() { return err(new Error("Order cancellation is not implemented in Supabase workflow")); }
  async skipLine() { return err(new Error("Line skipping is not implemented in Supabase workflow")); }

  async validateLocation(lineId: string, scanValue: string) {
    try {
      const orders = await client.pickerOrders();
      for (const o of orders.orders) {
        const d = await client.pickerOrder(o.id);
        const item = d.order.items.find(i => i.id === lineId);
        if (item) {
          const r = await client.validateLocation(o.id, lineId, scanValue, newClientEventId());
          return r.valid ? { ok: true, data: toLine(item) } : err(new Error("Location barcode does not match"));
        }
      }
      return err(new Error("Line not found"));
    } catch (e) { return err(e); }
  }

  async validateSku(lineId: string, scanValue: string) {
    try {
      const orders = await client.pickerOrders();
      for (const o of orders.orders) {
        const d = await client.pickerOrder(o.id);
        const item = d.order.items.find(i => i.id === lineId);
        if (item) {
          await client.validatePickSku(o.id, lineId, scanValue, newClientEventId());
          return { ok: true, data: toLine(item) };
        }
      }
      return err(new Error("Line not found"));
    } catch (e) { return err(e); }
  }

  async pickQuantity(lineId: string, qty: number, _uom: string, key: string) {
    try {
      const orders = await client.pickerOrders();
      for (const o of orders.orders) {
        const d = await client.pickerOrder(o.id);
        const item = d.order.items.find(i => i.id === lineId);
        if (item) {
          const r = await client.pickItem(o.id, lineId, item.skuBarcode, qty, key);
          return { ok: true, data: { ...toLine(item), pickedQty: r.pickedQty, status: r.pickedQty >= item.requiredQty ? "PICKED" : "PENDING" } };
        }
      }
      return err(new Error("Line not found"));
    } catch (e) { return err(e); }
  }

  async createException(lineId: string, type: LineException["type"], reasonCode: string, qty: number | null, note: string | null, key: string) {
    try {
      const orders = await client.pickerOrders();
      const active = orders.orders.find(o => o.status === "PICKING");
      if (!active) return err(new Error("No active picking order"));
      const r = await client.createException(active.id, { itemId: lineId, type, reasonCode, quantity: qty, note }, key);
      return { ok: true, data: { id: r.exception.id, lineId, type, reasonCode, qty, note, createdAt: new Date().toISOString() } };
    } catch (e) { return err(e); }
  }

  async completeOrder(id: string, key: string) {
    try { await client.pickerComplete(id, key); return this.getOrder(id); } catch (e) { return err(e); }
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
        id: String(d.id), objectKey: String(d.objectKey), mimeType: String(d.mimeType),
        fileSizeBytes: d.fileSizeBytes == null ? null : Number(d.fileSizeBytes),
        status: String(d.status), uploadAttempts: Number(d.uploadAttempts ?? 0),
        lastError: d.lastError == null ? null : String(d.lastError),
        createdAt: String(d.createdAt), uploadedAt: d.uploadedAt == null ? null : String(d.uploadedAt),
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
  async refreshToken(): Promise<Result<AuthResponse>> { return err(new Error("Supabase Auth manages session refresh")); }
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

import { supabase } from "@/api/supabase";
import { newClientEventId } from "@/sync/events";

export type Role = "PICKER" | "PACKER";

export type OrderStatus =
  | "ASSIGNED"
  | "PICKING"
  | "READY_FOR_PACKING"
  | "PACKING"
  | "PACKED"
  | "RIDER_ASSIGNED";

export type OrderItem = {
  id: string;
  sku: string;
  productName: string;
  productSpecs: string;
  productType: string;
  skuBarcode: string;
  location: string;
  locationBarcode: string;
  requiredQty: number;
  pickedQty: number;
  packedQty: number;
  lineStatus?: "PENDING" | "LOCATION_VALIDATED" | "SKU_VALIDATED" | "PICKED" | "EXCEPTION";
};

export type ExceptionRecord = {
  id: string;
  itemId: string | null;
  type: string;
  reason: string | null;
  quantity: number | null;
  note: string | null;
  status: string;
  createdAt: string;
};

export type PackageRecord = {
  id: string;
  packageNumber: number;
  packageType: string;
  weight: number | null;
  dimensions: { width?: number; height?: number; depth?: number } | null;
  createdAt?: string;
};

export type OrderSummary = {
  id: string;
  customer: string;
  warehouseId?: string;
  priority: string;
  slaMinutes: number;
  status: OrderStatus;
  pickerId?: string | null;
  packerId?: string | null;
  riderId?: string | null;
  riderName?: string | null;
  createdAt: string;
  updatedAt?: string;
  itemCount?: number;
  pickedCount?: number;
  packedCount?: number;
  packageCount?: number;
  /** Lightweight item payload used by list screens to avoid N+1 detail requests. */
  items?: OrderItem[];
};

export type PackingConfirmation = {
  id: string;
  itemId: string;
  packerId: string;
  productName: string;
  productType: string;
  productBarcode: string;
  expectedQty: number;
  confirmedQty: number;
  condition: "GOOD" | "DAMAGED" | "OTHER";
  createdAt: string;
};

export type OrderDetail = OrderSummary & {
  items: OrderItem[];
  exceptions: ExceptionRecord[];
  packages: PackageRecord[];
  packingConfirmations: PackingConfirmation[];
};

export type PickerMetrics = {
  period: "24h";
  ordersPicked: number;
  skuScans: number;
  scanAccuracyPercent: number;
  exceptions: number;
  firstScanSuccessPercent: number;
  totalPickedQty: number;
  pickedUnitsPerHour: number;
  ordersPerHour: number;
  averagePickingMinutes: number;
  shortPickPercent: number;
  exceptionPercent: number;
};

export type Rider = { id: string; name: string; phone: string | null };
export type LoginResponse = { token: string; user: User };
export type User = { id: string; email: string; name: string; role: Role; warehouseId: string };

export type ApiError = Error & { status?: number; code?: string; details?: unknown };

function error(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function resultError(e: unknown): ApiError {
  const out = new Error(e instanceof Error ? e.message : "Supabase request failed") as ApiError;
  return out;
}

async function currentUser() {
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) error("Not authenticated", 401);
  return data.user;
}

async function profile() {
  const user = await currentUser();
  const { data, error: profileError } = await supabase.from("users").select("*").eq("id", user.id).single();
  if (profileError || !data) error("User profile not found", 403);
  return data;
}

function mapItem(i: any): OrderItem {
  return {
    id: i.id,
    sku: i.sku,
    productName: i.product_name,
    productSpecs: i.product_specs ?? "",
    productType: i.product_type ?? "STANDARD",
    skuBarcode: i.sku_barcode ?? i.sku,
    location: i.location,
    locationBarcode: i.location_barcode ?? i.location,
    requiredQty: Number(i.required_qty ?? 0),
    pickedQty: Number(i.picked_qty ?? 0),
    packedQty: Number(i.packed_qty ?? 0),
    lineStatus: i.picked_qty >= i.required_qty
      ? "PICKED"
      : (i.line_status ?? "PENDING"),
  };
}

function mapOrderSummary(o: any, items: OrderItem[] = []): OrderSummary {
  const pickedCount = items.filter(i => i.pickedQty >= i.requiredQty).length;
  return {
    id: o.id, customer: o.customer, warehouseId: o.warehouse_id, priority: o.priority,
    slaMinutes: o.sla_minutes, status: o.status, pickerId: o.picker_id, packerId: o.packer_id,
    riderId: o.rider_id ?? null, riderName: o.rider_name ?? null,
    createdAt: o.created_at, updatedAt: o.updated_at,
    itemCount: items.length || Number(o.item_count ?? 0),
    pickedCount,
    items,
  };
}

async function detail(id: string): Promise<OrderDetail> {
  const { data: o, error: oe } = await supabase.from("orders").select("*").eq("id", id).single();
  if (oe || !o) error(oe?.message || "Order not found", 404);

  const user = await currentUser();
  const [{ data: items, error: ie }, { data: exceptions, error: ee }, { data: packages, error: pe }, { data: scans, error: se }, { data: confirmations, error: ce }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id).order("id"),
    supabase.from("exceptions").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    supabase.from("packages").select("*").eq("order_id", id).order("package_number"),
    supabase.from("scan_events")
      .select("item_id,scan_type,result,created_at")
      .eq("order_id", id)
      .eq("user_id", user.id)
      .eq("result", "SUCCESS")
      .order("created_at", { ascending: true }),
    supabase.from("packing_confirmations")
      .select("id,item_id,packer_id,product_name,product_type,product_barcode,expected_qty,confirmed_qty,condition,created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (ie) error(ie.message);
  if (ee) error(ee.message);
  if (pe) error(pe.message);
  if (se) error(se.message);
  if (ce) error(ce.message);

  const scanState = new Map<string, { location: boolean; sku: boolean }>();
  for (const scan of scans ?? []) {
    if (!scan.item_id) continue;
    const state = scanState.get(scan.item_id) ?? { location: false, sku: false };
    if (scan.scan_type === "LOCATION") state.location = true;
    if (scan.scan_type === "SKU" || scan.scan_type === "PICK") state.sku = true;
    scanState.set(scan.item_id, state);
  }

  const summary = await mapOrderSummary(o);
  return {
    ...summary,
    items: (items ?? []).map((i: any) => ({
      id: i.id, sku: i.sku, productName: i.product_name,
      productSpecs: i.product_specs ?? "",
      productType: i.product_type ?? "STANDARD",
      skuBarcode: i.sku_barcode ?? i.sku,
      location: i.location,
      locationBarcode: i.location_barcode ?? i.location,
      requiredQty: i.required_qty, pickedQty: i.picked_qty, packedQty: i.packed_qty,
      lineStatus: i.picked_qty >= i.required_qty
        ? "PICKED"
        : ((scanState.get(i.id)?.sku)
          ? "SKU_VALIDATED"
          : (scanState.get(i.id)?.location ? "LOCATION_VALIDATED" : "PENDING")),
    })),
    exceptions: (exceptions ?? []).map((e: any) => ({
      id: e.id, itemId: e.item_id, type: e.type, reason: e.reason, quantity: e.quantity,
      note: e.note, status: e.status, createdAt: e.created_at,
    })),
    packages: (packages ?? []).map((p: any) => ({
      id: p.id, packageNumber: p.package_number, packageType: p.package_type,
      weight: p.weight, dimensions: p.dimensions ?? null, createdAt: p.created_at,
    })),
    packingConfirmations: (confirmations ?? []).map((c: any) => ({
      id: c.id, itemId: c.item_id, packerId: c.packer_id,
      productName: c.product_name, productType: c.product_type,
      productBarcode: c.product_barcode, expectedQty: c.expected_qty,
      confirmedQty: c.confirmed_qty, condition: c.condition, createdAt: c.created_at,
    })),
  };
}

async function listOrders(statuses: string[], role: Role) {
  const p = await profile();
  let q = supabase.from("orders").select("*").eq("warehouse_id", p.warehouse_id).in("status", statuses).order("created_at", { ascending: false });
  if (role === "PICKER") {
    q = q.eq("picker_id", p.id);
  } else if (statuses.includes("PACKING")) {
    q = q.or(`status.eq.READY_FOR_PACKING,packer_id.eq.${p.id}`);
  }
  const { data, error: e } = await q;
  if (e) error(e.message);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // One item query for the whole list instead of one count query per order.
  // This removes the list-screen N+1 request pattern.
  const ids = rows.map((o: any) => o.id);
  const { data: itemRows, error: ie } = await supabase
    .from("order_items")
    .select("id,order_id,sku,product_name,product_specs,product_type,sku_barcode,location,location_barcode,required_qty,picked_qty,packed_qty")
    .in("order_id", ids);

  if (ie) error(ie.message);

  const byOrder = new Map<string, OrderItem[]>();
  for (const row of itemRows ?? []) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push(mapItem(row));
    byOrder.set(row.order_id, list);
  }

  return rows.map((o: any) => mapOrderSummary(o, byOrder.get(o.id) ?? []));
}

export function setAccessToken(_token: string | null) {}
export function getAccessToken() { return null; }

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
  if (e || !data.user || !data.session) error(e?.message || "Login failed", 401);
  const p = await profile();
  return { token: data.session.access_token, user: { id: p.id, email: p.email, name: p.name, role: p.role, warehouseId: p.warehouse_id } };
}

export async function me() {
  const p = await profile();
  return { user: { id: p.id, email: p.email, name: p.name, role: p.role, warehouseId: p.warehouse_id } };
}

export async function pickerMetrics(): Promise<PickerMetrics> {
  const { data, error: e } = await supabase.rpc("picker_metrics");
  if (e) error(e.message);
  return {
    period: "24h",
    ordersPicked: Number(data?.ordersPicked ?? 0),
    skuScans: Number(data?.skuScans ?? 0),
    scanAccuracyPercent: Number(data?.scanAccuracyPercent ?? 0),
    exceptions: Number(data?.exceptions ?? 0),
    firstScanSuccessPercent: Number(data?.firstScanSuccessPercent ?? 0),
    totalPickedQty: Number(data?.totalPickedQty ?? 0),
    pickedUnitsPerHour: Number(data?.pickedUnitsPerHour ?? 0),
    ordersPerHour: Number(data?.ordersPerHour ?? 0),
    averagePickingMinutes: Number(data?.averagePickingMinutes ?? 0),
    shortPickPercent: Number(data?.shortPickPercent ?? 0),
    exceptionPercent: Number(data?.exceptionPercent ?? 0),
  };
}

export async function pickerOrders() {
  const orders = await listOrders(["ASSIGNED", "PICKING", "READY_FOR_PACKING"], "PICKER");
  return { orders, total: orders.length, page: 1, limit: 50 };
}

export async function pickerOrder(id: string) { return { order: await detail(id) }; }

export async function pickerStart(id: string, idempotencyKey: string) {
  const { data, error: e } = await supabase.rpc("picker_start_order", {
    p_order_id: id, p_idempotency_key: idempotencyKey,
  });
  if (e) error(e.message);
  return { ok: true as const, status: data?.status ?? "PICKING" as const };
}

export async function pickerComplete(id: string, idempotencyKey: string) {
  const { data, error: e } = await supabase.rpc("picker_complete_order", {
    p_order_id: id, p_idempotency_key: idempotencyKey,
  });
  if (e) error(e.message);
  return { ok: true as const, status: data?.status ?? "READY_FOR_PACKING" as const };
}

export async function validateLocation(id: string, itemId: string, barcode: string, key: string) {
  const d = await detail(id);
  const item = d.items.find(i => i.id === itemId);
  if (!item) error("Item not found", 404);
  const expected = item.locationBarcode;
  if (expected.trim().toUpperCase() !== barcode.trim().toUpperCase()) error("Location barcode does not match");
  const { data, error: e } = await supabase.rpc("sync_scan_event", {
    p_id: newClientEventId(),
    p_order_id: id,
    p_item_id: itemId,
    p_scan_type: "LOCATION",
    p_barcode: barcode,
    p_expected_value: expected,
    p_result: "SUCCESS",
    p_idempotency_key: key,
    p_device_id: null,
  });
  if (e) error(e.message);
  return { valid: true as const, expected, scanned: barcode, duplicate: data?.duplicate === true };
}

export async function validatePickSku(id: string, itemId: string, barcode: string, key: string) {
  const d = await detail(id);
  const item = d.items.find(i => i.id === itemId);
  if (!item) error("Item not found", 404);
  const expected = item.skuBarcode;
  if (expected.trim().toUpperCase() !== barcode.trim().toUpperCase()) error("Product barcode does not match");
  const { data, error: e } = await supabase.rpc("sync_scan_event", {
    p_id: newClientEventId(),
    p_order_id: id,
    p_item_id: itemId,
    p_scan_type: "SKU",
    p_barcode: barcode,
    p_expected_value: expected,
    p_result: "SUCCESS",
    p_idempotency_key: key,
    p_device_id: null,
  });
  if (e) error(e.message);
  return { valid: true as const, expected, scanned: barcode, duplicate: data?.duplicate === true };
}

export async function pickItem(id: string, itemId: string, skuBarcode: string, quantity: number, idempotencyKey: string) {
  const { data, error: e } = await supabase.rpc("picker_pick_item", {
    p_order_id: id, p_item_id: itemId, p_sku: skuBarcode, p_quantity: quantity, p_idempotency_key: idempotencyKey,
  });
  if (e) error(e.message);
  const d = await detail(id);
  const pickedQty = Number(data?.pickedQty ?? d.items.find(i => i.id === itemId)?.pickedQty ?? 0);
  return {
    ok: true as const, pickedQty, orderStatus: "PICKING" as const,
    remainingItems: d.items.filter(i => i.id === itemId ? pickedQty < i.requiredQty : i.pickedQty < i.requiredQty).length,
  };
}

export async function packerOrders() {
  const orders = await listOrders(["READY_FOR_PACKING", "PACKING"], "PACKER");
  return { orders, total: orders.length, page: 1, limit: 50 };
}

export async function packerOrder(id: string) { return { order: await detail(id) }; }

export async function packerDispatch() {
  const orders = await listOrders(["PACKED", "RIDER_ASSIGNED"], "PACKER");
  return { orders, total: orders.length };
}

export async function packerRiders() {
  const p = await profile();
  const { data, error: e } = await supabase.from("riders").select("id,name,phone").eq("warehouse_id", p.warehouse_id).eq("active", true).order("name");
  if (e) error(e.message);
  return { riders: data ?? [] };
}

export async function assignRider(id: string, riderId: string | undefined, _riderName: string | undefined, key: string) {
  if (!riderId) error("Rider is required");
  const { data, error: e } = await supabase.rpc("assign_rider", {
    p_order_id: id, p_rider_id: riderId, p_idempotency_key: key,
  });
  if (e) error(e.message);
  return { ok: true as const, order: { id, status: "RIDER_ASSIGNED" as const, riderId, riderName: data?.riderName ?? "" } };
}

export async function packerStart(id: string, key: string) {
  const { data, error: e } = await supabase.rpc("packer_start_order", {
    p_order_id: id, p_idempotency_key: key,
  });
  if (e) error(e.message);
  const p = await profile();
  return { ok: true as const, order: { id, status: "PACKING" as const, packerId: p.id, ...(data ?? {}) } };
}

export async function validatePackSku(id: string, itemId: string, barcode: string, _key: string) {
  const d = await detail(id);
  const item = d.items.find(i => i.id === itemId);
  if (!item) error("Item not found", 404);
  if (item.sku.trim().toUpperCase() !== barcode.trim().toUpperCase()) error("SKU barcode does not match");
  return { valid: true as const, item };
}

export async function confirmPackItem(
  id: string,
  itemId: string,
  productName: string,
  productType: string,
  productBarcode: string,
  quantity: number,
  condition: "GOOD" | "DAMAGED" | "OTHER",
  key: string,
) {
  const { data, error: e } = await supabase.rpc("packer_confirm_item", {
    p_order_id: id,
    p_item_id: itemId,
    p_product_name: productName,
    p_product_type: productType,
    p_product_barcode: productBarcode,
    p_confirmed_qty: quantity,
    p_condition: condition,
    p_idempotency_key: key,
  });
  if (e) error(e.message);
  const item = (await detail(id)).items.find(i => i.id === itemId);
  if (!item) error("Item not found", 404);
  const packedQty = Number(data?.packedQty ?? item.packedQty);
  return { item: { id: item.id, packedQty, pickedQty: item.pickedQty }, remaining: Math.max(0, item.pickedQty - packedQty) };
}

export async function createPackage(id: string, packageType: string, weight: number | undefined, dimensions: PackageRecord["dimensions"], key: string) {
  const { data, error: e } = await supabase.rpc("packer_create_package", {
    p_order_id: id, p_package_type: packageType, p_weight: weight ?? null, p_dimensions: dimensions ?? null, p_idempotency_key: key,
  });
  if (e) error(e.message);
  const d = await detail(id);
  const created = d.packages.find(p => p.id === data?.id) ?? d.packages[d.packages.length - 1];
  if (!created) error("Package creation succeeded but package could not be reloaded");
  return { package: created };
}

export async function packerComplete(id: string, key: string) {
  const { data, error: e } = await supabase.rpc("packer_complete_order", { p_order_id: id, p_idempotency_key: key });
  if (e) error(e.message);
  const d = await detail(id);
  return { order: { id, status: "PACKED" as const, packages: d.packages }, nextStep: { status: "PACKED" as const, message: "Ready for dispatch" }, ...(data ?? {}) };
}

export async function createException(id: string, payload: Record<string, unknown>, idempotencyKey?: string) {
  const key = idempotencyKey ?? newClientEventId();
  const { data, error: e } = await supabase.rpc("create_exception", {
    p_order_id: id, p_item_id: (payload.itemId as string) ?? null,
    p_type: String(payload.type ?? "OTHER"), p_reason: (payload.reasonCode as string) ?? null,
    p_quantity: (payload.quantity as number) ?? null, p_note: (payload.note as string) ?? null,
    p_idempotency_key: key,
  });
  if (e) error(e.message);
  return { ok: true as const, exception: { id: data?.id ?? "", orderId: id, itemId: (payload.itemId as string) ?? null, type: String(payload.type ?? "OTHER"), status: "OPEN" } };
}

export async function grantEvidenceUpload(exceptionId: string, fileName: string, mimeType: string, fileSizeBytes?: number) {
  const user = await currentUser();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "evidence.jpg";
  const objectKey = `${user.id}/${exceptionId}/${newClientEventId()}-${safeName}`;
  const { data, error: e } = await supabase.rpc("create_evidence_record", {
    p_exception_id: exceptionId,
    p_object_key: objectKey,
    p_mime_type: mimeType,
    p_file_size_bytes: fileSizeBytes ?? null,
  });
  if (e) error(e.message);
  return {
    uploadUrl: String(data?.objectKey ?? objectKey),
    objectKey: String(data?.objectKey ?? objectKey),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}

export async function uploadEvidenceBytes(objectKey: string, bytes: Uint8Array, mimeType: string) {
  const { error: e } = await supabase.storage.from("exception-evidence").upload(objectKey, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (e) error(e.message);
  return { objectKey };
}

export async function completeEvidenceUpload(exceptionId: string, evidenceId: string) {
  void exceptionId;
  const { data, error: e } = await supabase.rpc("complete_evidence_upload", { p_evidence_id: evidenceId });
  if (e) error(e.message);
  return data as Record<string, unknown>;
}

export async function listExceptionEvidence(exceptionId: string) {
  const { data, error: e } = await supabase.rpc("list_exception_evidence", { p_exception_id: exceptionId });
  if (e) error(e.message);
  return (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
}

export async function syncEvents(batch: { events: Array<any> }) {
  let processedCount = 0;
  const results: Array<{ clientEventId: string; status: "ACCEPTED" | "DUPLICATE" | "REJECTED" | "CONFLICT"; message: string | null; serverEventId: string | null }> = [];
  const conflicts: Array<{ clientEventId: string; conflictType: string; serverState: Record<string, unknown> }> = [];

  for (const event of batch.events) {
    const key = String(event.clientEventId ?? newClientEventId());
    try {
      let data: any = null;
      if (event.eventType === "ORDER_STARTED") {
        const r = await supabase.rpc("picker_start_order", { p_order_id: event.orderId, p_idempotency_key: key });
        if (r.error) throw r.error; data = r.data;
      } else if (event.eventType === "LOCATION_SCANNED" || event.eventType === "SKU_SCANNED") {
        const payload = event.payload ?? {};
        const r = await supabase.rpc("sync_scan_event", {
          p_id: key, p_order_id: event.orderId, p_item_id: event.lineId,
          p_scan_type: event.eventType === "LOCATION_SCANNED" ? "LOCATION" : "SKU",
          p_barcode: payload.scanValue ?? "", p_expected_value: payload.expectedValue ?? "",
          p_result: "SUCCESS", p_idempotency_key: key, p_device_id: event.deviceId ?? null,
        });
        if (r.error) throw r.error; data = r.data;
      } else if (event.eventType === "QTY_CONFIRMED") {
        const payload = event.payload ?? {};
        const r = await supabase.rpc("picker_pick_item", {
          p_order_id: event.orderId, p_item_id: event.lineId, p_sku: payload.sku ?? "",
          p_quantity: Number(payload.qty), p_idempotency_key: key,
        });
        if (r.error) throw r.error; data = r.data;
      } else if (event.eventType === "EXCEPTION_RAISED") {
        const payload = event.payload ?? {};
        const r = await supabase.rpc("create_exception", {
          p_order_id: event.orderId, p_item_id: event.lineId ?? null,
          p_type: String(payload.type ?? "OTHER"), p_reason: String(payload.reasonCode ?? ""),
          p_quantity: payload.qty == null ? null : Number(payload.qty), p_note: payload.note == null ? null : String(payload.note),
          p_idempotency_key: key,
        });
        if (r.error) throw r.error; data = r.data;
      } else if (event.eventType === "ORDER_COMPLETED") {
        const r = await supabase.rpc("picker_complete_order", { p_order_id: event.orderId, p_idempotency_key: key });
        if (r.error) throw r.error; data = r.data;
      } else {
        throw new Error(`Unsupported offline event ${event.eventType}`);
      }

      const duplicate = data?.duplicate === true;
      results.push({ clientEventId: key, status: duplicate ? "DUPLICATE" : "ACCEPTED", message: null, serverEventId: data?.id ?? null });
      processedCount += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync event rejected";
      results.push({ clientEventId: key, status: "CONFLICT", message, serverEventId: null });
      conflicts.push({ clientEventId: key, conflictType: "SERVER_REJECTED", serverState: { error: message } });
    }
  }

  return { processedCount, results, conflicts };
}

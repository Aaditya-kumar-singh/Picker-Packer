import { supabase } from "@/api/supabase";
import { newClientEventId, type OfflineEvent } from "@/sync/events";

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
  productImageUrl?: string | null;
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
  orderNumber: string;
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

export type RecentScan = {
  itemId: string;
  barcode: string;
  scanType: string;
  createdAt: string;
};

export type OrderDetail = OrderSummary & {
  items: OrderItem[];
  exceptions: ExceptionRecord[];
  packages: PackageRecord[];
  packingConfirmations: PackingConfirmation[];
  recentScans: RecentScan[];
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

// ── Database Row Interfaces (replaces untyped `any` row mappers) ──────────
interface DbOrderRow {
  id: string;
  order_number?: string | null;
  customer: string;
  warehouse_id?: string;
  priority: string;
  sla_minutes: number;
  status: OrderStatus;
  picker_id?: string | null;
  packer_id?: string | null;
  rider_id?: string | null;
  rider_name?: string | null;
  created_at: string;
  updated_at?: string;
  package_count?: number | null;
}

interface DbOrderItemRow {
  id: string;
  order_id?: string;
  sku: string;
  product_name?: string | null;
  product_specs?: string | null;
  product_image_url?: string | null;
  product_type?: string | null;
  sku_barcode?: string | null;
  location: string;
  location_barcode?: string | null;
  required_qty?: number | null;
  picked_qty?: number | null;
  packed_qty?: number | null;
  line_status?: OrderItem["lineStatus"] | null;
}

interface DbExceptionRow {
  id: string;
  item_id: string | null;
  type: string;
  reason: string | null;
  quantity: number | null;
  note: string | null;
  status: string;
  created_at: string;
}

interface DbPackageRow {
  id: string;
  package_number: number;
  package_type: string;
  weight: number | null;
  dimensions?: PackageRecord["dimensions"];
  created_at?: string;
}

interface DbScanEventRow {
  item_id: string | null;
  scan_type: string;
  barcode?: string | null;
  result?: string;
  created_at: string;
}

interface DbConfirmationRow {
  id: string;
  item_id: string;
  packer_id: string;
  product_name: string;
  product_type: string;
  product_barcode: string;
  expected_qty: number;
  confirmed_qty: number;
  condition: "GOOD" | "DAMAGED" | "OTHER";
  created_at: string;
}

function error(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

export function resultError(e: unknown): ApiError {
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
  const { data, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();
  if (profileError || !data) error("User profile not found", 403);
  return data;
}

type CatalogProduct = {
  sku: string;
  name: string;
  product_type: string;
  specs: string;
  barcode: string;
  zone: string;
  slot: string;
  image_path: string | null;
};

// 5-minute in-memory TTL cache for warehouse product_catalog entries
const CATALOG_TTL_MS = 5 * 60 * 1000;
const catalogCache = new Map<string, { product: CatalogProduct; cachedAt: number }>();

function catalogImageUrl(imagePath?: string | null): string | null {
  if (!imagePath) return null;
  return supabase.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl;
}

async function loadCatalogProducts(items: Array<{ sku?: string | null }>) {
  const skus = Array.from(
    new Set(items.map((item) => item.sku).filter((sku): sku is string => Boolean(sku))),
  );
  if (skus.length === 0) return new Map<string, CatalogProduct>();

  const now = Date.now();
  const result = new Map<string, CatalogProduct>();
  const missingSkus: string[] = [];

  for (const sku of skus) {
    const cached = catalogCache.get(sku);
    if (cached && now - cached.cachedAt < CATALOG_TTL_MS) {
      result.set(sku, cached.product);
    } else {
      missingSkus.push(sku);
    }
  }

  if (missingSkus.length > 0) {
    const { data, error: catalogError } = await supabase
      .from("product_catalog")
      .select("sku,name,product_type,specs,barcode,zone,slot,image_path")
      .eq("active", true)
      .in("sku", missingSkus);

    if (catalogError) {
      error(`Could not load warehouse product catalog: ${catalogError.message}`);
    }

    for (const product of (data ?? []) as CatalogProduct[]) {
      catalogCache.set(product.sku, { product, cachedAt: now });
      result.set(product.sku, product);
    }
  }

  return result;
}

function mapItem(i: DbOrderItemRow, catalog?: CatalogProduct): OrderItem {
  const location = catalog
    ? `WH-A-${catalog.zone}-${catalog.slot}`
    : i.location;
  const locationBarcode = catalog
    ? `LOC-WHA-${catalog.zone}-${catalog.slot}`
    : (i.location_barcode ?? i.location);
  const requiredQty = Number(i.required_qty ?? 0);
  const pickedQty = Number(i.picked_qty ?? 0);

  return {
    id: i.id,
    sku: catalog?.sku ?? i.sku,
    productName: catalog?.name ?? i.product_name ?? i.sku,
    productSpecs: catalog?.specs ?? i.product_specs ?? "",
    productImageUrl: catalogImageUrl(catalog?.image_path) ?? i.product_image_url ?? null,
    productType: catalog?.product_type ?? i.product_type ?? "STANDARD",
    skuBarcode: catalog?.barcode ?? i.sku_barcode ?? i.sku,
    location,
    locationBarcode,
    requiredQty,
    pickedQty,
    packedQty: Number(i.packed_qty ?? 0),
    lineStatus:
      pickedQty >= requiredQty ? "PICKED" : (i.line_status ?? "PENDING"),
  };
}

function mapOrderSummary(o: DbOrderRow, items: OrderItem[] = []): OrderSummary {
  const pickedCount = items.filter((i) => i.pickedQty >= i.requiredQty).length;
  return {
    id: o.id,
    orderNumber: o.order_number ?? o.id,
    customer: o.customer,
    warehouseId: o.warehouse_id,
    priority: o.priority,
    slaMinutes: o.sla_minutes,
    status: o.status,
    pickerId: o.picker_id,
    packerId: o.packer_id,
    riderId: o.rider_id ?? null,
    riderName: o.rider_name ?? null,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    itemCount: items.length,
    pickedCount,
    packedCount: items.reduce((sum, i) => sum + i.packedQty, 0),
    packageCount: Number(o.package_count ?? 0),
    items,
  };
}

async function detail(id: string): Promise<OrderDetail> {
  const { data: o, error: oe } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();
  if (oe || !o) error(oe?.message || "Order not found", 404);

  const user = await currentUser();
  const [
    { data: items, error: ie },
    { data: exceptions, error: ee },
    { data: packages, error: pe },
    { data: scans, error: se },
    { data: confirmations, error: ce },
  ] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id).order("id"),
    supabase
      .from("exceptions")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("packages").select("*").eq("order_id", id).order("package_number"),
    supabase
      .from("scan_events")
      .select("item_id,scan_type,barcode,result,created_at")
      .eq("order_id", id)
      .eq("user_id", user.id)
      .eq("result", "SUCCESS")
      .order("created_at", { ascending: true }),
    supabase
      .from("packing_confirmations")
      .select(
        "id,item_id,packer_id,product_name,product_type,product_barcode,expected_qty,confirmed_qty,condition,created_at",
      )
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (ie) error(ie.message);
  if (ee) error(ee.message);
  if (pe) error(pe.message);
  if (se) error(se.message);
  if (ce) error(ce.message);

  const typedItems = (items ?? []) as DbOrderItemRow[];
  const catalogBySku = await loadCatalogProducts(typedItems);

  const scanState = new Map<string, { location: boolean; sku: boolean }>();
  for (const scan of (scans ?? []) as DbScanEventRow[]) {
    if (!scan.item_id) continue;
    const state = scanState.get(scan.item_id) ?? { location: false, sku: false };
    if (scan.scan_type === "LOCATION") state.location = true;
    if (scan.scan_type === "SKU" || scan.scan_type === "PICK") state.sku = true;
    scanState.set(scan.item_id, state);
  }

  // Keep order lines with valid catalog images, or fall back to all order lines
  // if a test/custom order has items without catalog images so lines are never orphaned.
  const catalogFiltered = typedItems.filter((i) => {
    const product = catalogBySku.get(i.sku);
    return Boolean(product?.image_path && catalogImageUrl(product.image_path));
  });
  const visibleItems = catalogFiltered.length > 0 ? catalogFiltered : typedItems;

  const mappedItems: OrderItem[] = visibleItems.map((i): OrderItem => {
    const pickedQty = Number(i.picked_qty ?? 0);
    const requiredQty = Number(i.required_qty ?? 0);
    return {
      ...mapItem(i, catalogBySku.get(i.sku)),
      lineStatus:
        pickedQty >= requiredQty
          ? "PICKED"
          : scanState.get(i.id)?.sku
            ? "SKU_VALIDATED"
            : "PENDING",
    };
  });

  const summary = mapOrderSummary(o as DbOrderRow, mappedItems);
  return {
    ...summary,
    items: mappedItems,
    exceptions: ((exceptions ?? []) as DbExceptionRow[]).map((e) => ({
      id: e.id,
      itemId: e.item_id,
      type: e.type,
      reason: e.reason,
      quantity: e.quantity,
      note: e.note,
      status: e.status,
      createdAt: e.created_at,
    })),
    packages: ((packages ?? []) as DbPackageRow[]).map((p) => ({
      id: p.id,
      packageNumber: p.package_number,
      packageType: p.package_type,
      weight: p.weight,
      dimensions: p.dimensions ?? null,
      createdAt: p.created_at,
    })),
    packingConfirmations: ((confirmations ?? []) as DbConfirmationRow[]).map((c) => ({
      id: c.id,
      itemId: c.item_id,
      packerId: c.packer_id,
      productName: c.product_name,
      productType: c.product_type,
      productBarcode: c.product_barcode,
      expectedQty: c.expected_qty,
      confirmedQty: c.confirmed_qty,
      condition: c.condition,
      createdAt: c.created_at,
    })),
    recentScans: ((scans ?? []) as DbScanEventRow[])
      .slice(-20)
      .reverse()
      .map((scan) => ({
        itemId: scan.item_id ?? "",
        barcode: scan.barcode ?? "",
        scanType: scan.scan_type,
        createdAt: scan.created_at,
      })),
  };
}

async function listOrders(statuses: string[], role: Role) {
  const p = await profile();
  let q = supabase
    .from("orders")
    .select("*")
    .eq("warehouse_id", p.warehouse_id)
    .in("status", statuses)
    .order("created_at", { ascending: false });
  if (role === "PICKER") {
    q = q.eq("picker_id", p.id);
  } else if (statuses.includes("PACKING")) {
    q = q.or(`status.eq.READY_FOR_PACKING,packer_id.eq.${p.id}`);
  } else {
    q = q.eq("packer_id", p.id);
  }
  const { data, error: e } = await q;
  if (e) error(e.message);

  const rows = (data ?? []) as DbOrderRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((o) => o.id);
  const { data: itemRows, error: ie } = await supabase
    .from("order_items")
    .select(
      "id,order_id,sku,product_name,product_specs,product_type,sku_barcode,location,location_barcode,required_qty,picked_qty,packed_qty",
    )
    .in("order_id", ids);

  if (ie) error(ie.message);

  const typedItemRows = (itemRows ?? []) as DbOrderItemRow[];
  const catalogBySku = await loadCatalogProducts(typedItemRows);
  const scanState = new Map<string, { location: boolean; sku: boolean }>();
  if (role === "PICKER") {
    const { data: scans, error: se } = await supabase
      .from("scan_events")
      .select("item_id,scan_type")
      .in("order_id", ids)
      .eq("user_id", p.id)
      .eq("result", "SUCCESS")
      .in("scan_type", ["LOCATION", "SKU", "PICK"]);
    if (se) error(se.message);

    for (const scan of (scans ?? []) as Array<{ item_id: string | null; scan_type: string }>) {
      if (!scan.item_id) continue;
      const state = scanState.get(scan.item_id) ?? { location: false, sku: false };
      if (scan.scan_type === "LOCATION") state.location = true;
      if (scan.scan_type === "SKU" || scan.scan_type === "PICK") state.sku = true;
      scanState.set(scan.item_id, state);
    }
  }

  const catalogFilteredRows = typedItemRows.filter((row) => {
    const product = catalogBySku.get(row.sku);
    return Boolean(product?.image_path && catalogImageUrl(product.image_path));
  });
  const visibleItemRows =
    catalogFilteredRows.length > 0 ? catalogFilteredRows : typedItemRows;

  const byOrder = new Map<string, OrderItem[]>();
  for (const row of visibleItemRows) {
    const item = mapItem(row, catalogBySku.get(row.sku));
    if (role === "PICKER") {
      const state = scanState.get(item.id);
      if (item.pickedQty >= item.requiredQty) {
        item.lineStatus = "PICKED";
      } else if (state?.sku) {
        item.lineStatus = "SKU_VALIDATED";
      } else {
        item.lineStatus = "PENDING";
      }
    }
    const orderIdKey = row.order_id ?? "";
    const list = byOrder.get(orderIdKey) ?? [];
    list.push(item);
    byOrder.set(orderIdKey, list);
  }

  return rows
    .map((o) => mapOrderSummary(o, byOrder.get(o.id) ?? []))
    .filter((order) => (order.items?.length ?? 0) > 0);
}

export function setAccessToken(_token: string | null) {}
export function getAccessToken() {
  return null;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
  if (e || !data.user || !data.session) error(e?.message || "Login failed", 401);
  const p = await profile();
  return {
    token: data.session.access_token,
    user: {
      id: p.id,
      email: p.email,
      name: p.name,
      role: p.role,
      warehouseId: p.warehouse_id,
    },
  };
}

export async function me() {
  const p = await profile();
  return {
    user: {
      id: p.id,
      email: p.email,
      name: p.name,
      role: p.role,
      warehouseId: p.warehouse_id,
    },
  };
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

export async function pickerOrder(id: string) {
  return { order: await detail(id) };
}

export async function pickerStart(id: string, idempotencyKey: string) {
  const { data, error: e } = await supabase.rpc("picker_start_order", {
    p_order_id: id,
    p_idempotency_key: idempotencyKey,
  });
  if (e) error(e.message);
  return { ok: true as const, status: (data?.status ?? "PICKING") as "PICKING" };
}

export async function pickerComplete(id: string, idempotencyKey: string) {
  const { data, error: e } = await supabase.rpc("picker_complete_order", {
    p_order_id: id,
    p_idempotency_key: idempotencyKey,
  });
  if (e) error(e.message);
  return {
    ok: true as const,
    status: (data?.status ?? "READY_FOR_PACKING") as "READY_FOR_PACKING",
  };
}

export async function validateLocation(id: string, itemId: string, barcode: string, key: string) {
  const { data, error: e } = await supabase.rpc("sync_scan_event", {
    p_id: newClientEventId(),
    p_order_id: id,
    p_item_id: itemId,
    p_scan_type: "LOCATION",
    p_barcode: barcode,
    p_expected_value: "",
    p_result: "SUCCESS",
    p_idempotency_key: key,
    p_device_id: null,
  });
  if (e) error(e.message);
  const expected = String(data?.expectedValue ?? "");
  return {
    valid: true as const,
    expected,
    scanned: barcode,
    duplicate: data?.duplicate === true,
  };
}

export async function validatePickSku(id: string, itemId: string, barcode: string, key: string) {
  const { data, error: e } = await supabase.rpc("sync_scan_event", {
    p_id: newClientEventId(),
    p_order_id: id,
    p_item_id: itemId,
    p_scan_type: "SKU",
    p_barcode: barcode,
    p_expected_value: "",
    p_result: "SUCCESS",
    p_idempotency_key: key,
    p_device_id: null,
  });
  if (e) error(e.message);
  const expected = String(data?.expectedValue ?? "");
  return {
    valid: true as const,
    expected,
    scanned: barcode,
    duplicate: data?.duplicate === true,
  };
}

export async function pickItem(
  id: string,
  itemId: string,
  skuBarcode: string,
  quantity: number,
  idempotencyKey: string,
) {
  const { data, error: e } = await supabase.rpc("picker_pick_item", {
    p_order_id: id,
    p_item_id: itemId,
    p_sku: skuBarcode,
    p_quantity: quantity,
    p_idempotency_key: idempotencyKey,
  });
  if (e) error(e.message);
  const pickedQty = Number(data?.pickedQty ?? 0);
  return {
    ok: true as const,
    pickedQty,
    orderStatus: "PICKING" as const,
  };
}

export type PackerDashboardStats = {
  assigned: number;
  completed: number;
  itemsPackedToday: number;
};

export async function packerDashboardStats(): Promise<PackerDashboardStats> {
  const p = await profile();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [{ data: orders, error: oe }, { data: confirmations, error: ce }] = await Promise.all([
    supabase
      .from("orders")
      .select("status")
      .eq("warehouse_id", p.warehouse_id)
      .eq("packer_id", p.id),
    supabase
      .from("packing_confirmations")
      .select("confirmed_qty,created_at")
      .eq("packer_id", p.id)
      .gte("created_at", start.toISOString()),
  ]);
  if (oe) error(oe.message);
  if (ce) error(ce.message);

  const typedOrders = (orders ?? []) as Array<{ status: OrderStatus }>;
  const typedConfirmations = (confirmations ?? []) as Array<{ confirmed_qty?: number | null }>;

  const assigned = typedOrders.filter((o) =>
    ["READY_FOR_PACKING", "PACKING", "PACKED"].includes(o.status),
  ).length;
  const completed = typedOrders.filter((o) => o.status === "RIDER_ASSIGNED").length;
  const itemsPackedToday = typedConfirmations.reduce(
    (sum, row) => sum + Number(row.confirmed_qty ?? 0),
    0,
  );

  return { assigned, completed, itemsPackedToday };
}

export async function packerOrders() {
  const orders = await listOrders(["READY_FOR_PACKING", "PACKING", "PACKED"], "PACKER");
  return { orders, total: orders.length, page: 1, limit: 50 };
}

export async function packerCompletedOrders() {
  const orders = await listOrders(["PACKED", "RIDER_ASSIGNED"], "PACKER");
  return { orders, total: orders.length, page: 1, limit: 50 };
}

export async function packerOrder(id: string) {
  return { order: await detail(id) };
}

export async function packerScanBarcode(
  id: string,
  barcode: string,
  key: string,
  quantity = 1,
) {
  const value = barcode.trim();
  if (!value) error("Scan a product barcode");

  const d = await detail(id);
  if (d.status === "READY_FOR_PACKING") {
    await packerStart(id, newClientEventId());
    d.status = "PACKING";
  }
  if (d.status !== "PACKING") error("Order is not available for packing");

  const normalized = value.toUpperCase();
  const item = d.items.find(
    (i) =>
      i.packedQty < i.pickedQty &&
      (i.skuBarcode.trim().toUpperCase() === normalized ||
        i.sku.trim().toUpperCase() === normalized),
  );
  if (!item) error("Barcode does not match any remaining item in this order");

  const left = item.pickedQty - item.packedQty;
  const packQty = Math.min(Math.max(1, Math.floor(quantity || 1)), left);
  const scanKey = newClientEventId();
  const { error: scanError } = await supabase.rpc("sync_scan_event", {
    p_id: newClientEventId(),
    p_order_id: id,
    p_item_id: item.id,
    p_scan_type: "SKU",
    p_barcode: item.skuBarcode,
    p_expected_value: item.skuBarcode,
    p_result: "SUCCESS",
    p_idempotency_key: scanKey,
    p_device_id: null,
  });
  if (scanError) error(scanError.message);

  const { error: confirmError } = await supabase.rpc("packer_confirm_item", {
    p_order_id: id,
    p_item_id: item.id,
    p_product_name: item.productName,
    p_product_type: item.productType,
    p_product_barcode: item.skuBarcode,
    p_confirmed_qty: packQty,
    p_condition: "GOOD",
    p_idempotency_key: key,
  });
  if (confirmError) error(confirmError.message);

  const wouldCompleteAll = d.items.every((i) =>
    i.id === item.id ? i.packedQty + packQty >= i.pickedQty : i.packedQty >= i.pickedQty,
  );
  if (wouldCompleteAll) {
    if (d.packages.length === 0) {
      const { error: pkgErr } = await supabase.rpc("packer_create_package", {
        p_order_id: id,
        p_package_type: "STANDARD",
        p_weight: null,
        p_dimensions: null,
        p_idempotency_key: newClientEventId(),
      });
      if (pkgErr) error(pkgErr.message);
    }
    const { error: completeErr } = await supabase.rpc("packer_complete_order", {
      p_order_id: id,
      p_idempotency_key: newClientEventId(),
    });
    if (completeErr) error(completeErr.message);
  }

  const finalOrder = await detail(id);
  const finalItem = finalOrder.items.find((i) => i.id === item.id) ?? item;
  return {
    order: finalOrder,
    item: finalItem,
    allPacked: finalOrder.status === "PACKED" || finalOrder.status === "RIDER_ASSIGNED",
  };
}

export async function packerDispatch() {
  const orders = await listOrders(["PACKED", "RIDER_ASSIGNED"], "PACKER");
  return { orders, total: orders.length };
}

export async function packerRiders() {
  const p = await profile();
  const { data, error: e } = await supabase
    .from("riders")
    .select("id,name,phone")
    .eq("warehouse_id", p.warehouse_id)
    .eq("active", true)
    .order("name");
  if (e) error(e.message);
  return { riders: (data ?? []) as Rider[] };
}

export async function assignRider(
  id: string,
  riderId: string | undefined,
  _riderName: string | undefined,
  key: string,
) {
  if (!riderId) error("Rider is required");
  const { data, error: e } = await supabase.rpc("assign_rider", {
    p_order_id: id,
    p_rider_id: riderId,
    p_idempotency_key: key,
  });
  if (e) error(e.message);
  return {
    ok: true as const,
    order: {
      id,
      status: "RIDER_ASSIGNED" as const,
      riderId,
      riderName: String(data?.riderName ?? ""),
    },
  };
}

export async function packerStart(id: string, key: string) {
  const { data, error: e } = await supabase.rpc("packer_start_order", {
    p_order_id: id,
    p_idempotency_key: key,
  });
  if (e) error(e.message);
  const p = await profile();
  return {
    ok: true as const,
    order: { id, status: "PACKING" as const, packerId: p.id, ...(data ?? {}) },
  };
}

export async function validatePackSku(id: string, itemId: string, barcode: string, _key: string) {
  const d = await detail(id);
  const item = d.items.find((i) => i.id === itemId);
  if (!item) error("Item not found", 404);
  const normalized = barcode.trim().toUpperCase();
  if (
    item.skuBarcode.trim().toUpperCase() !== normalized &&
    item.sku.trim().toUpperCase() !== normalized
  ) {
    error("SKU barcode does not match");
  }
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
  const item = (await detail(id)).items.find((i) => i.id === itemId);
  if (!item) error("Item not found", 404);
  const packedQty = Number(data?.packedQty ?? item.packedQty);
  return {
    item: { id: item.id, packedQty, pickedQty: item.pickedQty },
    remaining: Math.max(0, item.pickedQty - packedQty),
  };
}

export async function createPackage(
  id: string,
  packageType: string,
  weight: number | undefined,
  dimensions: PackageRecord["dimensions"],
  key: string,
) {
  const { data, error: e } = await supabase.rpc("packer_create_package", {
    p_order_id: id,
    p_package_type: packageType,
    p_weight: weight ?? null,
    p_dimensions: dimensions ?? null,
    p_idempotency_key: key,
  });
  if (e) error(e.message);
  const d = await detail(id);
  const created =
    d.packages.find((p) => p.id === data?.id) ?? d.packages[d.packages.length - 1];
  if (!created) error("Package creation succeeded but package could not be reloaded");
  return { package: created };
}

export async function packerComplete(id: string, key: string) {
  const { data, error: e } = await supabase.rpc("packer_complete_order", {
    p_order_id: id,
    p_idempotency_key: key,
  });
  if (e) error(e.message);
  const d = await detail(id);
  return {
    order: { id, status: "PACKED" as const, packages: d.packages },
    nextStep: { status: "PACKED" as const, message: "Ready for dispatch" },
    ...(data ?? {}),
  };
}

export async function createException(
  id: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const key = idempotencyKey ?? newClientEventId();
  const { data, error: e } = await supabase.rpc("create_exception", {
    p_order_id: id,
    p_item_id: (payload.itemId as string) ?? null,
    p_type: String(payload.type ?? "OTHER"),
    p_reason: (payload.reasonCode as string) ?? null,
    p_quantity: (payload.quantity as number) ?? null,
    p_note: (payload.note as string) ?? null,
    p_idempotency_key: key,
  });
  if (e) error(e.message);
  return {
    ok: true as const,
    exception: {
      id: String(data?.id ?? ""),
      orderId: id,
      itemId: (payload.itemId as string) ?? null,
      type: String(payload.type ?? "OTHER"),
      status: "OPEN",
    },
  };
}

export async function grantEvidenceUpload(
  exceptionId: string,
  fileName: string,
  mimeType: string,
  fileSizeBytes?: number,
) {
  const user = await currentUser();
  const safeName =
    fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "evidence.jpg";
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

export async function uploadEvidenceBytes(
  objectKey: string,
  bytes: Uint8Array,
  mimeType: string,
) {
  const { error: e } = await supabase.storage
    .from("exception-evidence")
    .upload(objectKey, bytes, {
      contentType: mimeType,
      upsert: false,
    });
  if (e) error(e.message);
  return { objectKey };
}

export async function completeEvidenceUpload(exceptionId: string, evidenceId: string) {
  void exceptionId;
  const { data, error: e } = await supabase.rpc("complete_evidence_upload", {
    p_evidence_id: evidenceId,
  });
  if (e) error(e.message);
  return data as Record<string, unknown>;
}

export async function listExceptionEvidence(exceptionId: string) {
  const { data, error: e } = await supabase.rpc("list_exception_evidence", {
    p_exception_id: exceptionId,
  });
  if (e) error(e.message);
  return (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
}

export async function syncEvents(batch: { events: Array<OfflineEvent & { deviceId?: string | null }> }) {
  let processedCount = 0;
  const results: Array<{
    clientEventId: string;
    status: "ACCEPTED" | "DUPLICATE" | "REJECTED" | "CONFLICT";
    message: string | null;
    serverEventId: string | null;
  }> = [];
  const conflicts: Array<{
    clientEventId: string;
    conflictType: string;
    serverState: Record<string, unknown>;
  }> = [];

  for (const event of batch.events) {
    const key = String(event.clientEventId ?? newClientEventId());
    try {
      let data: { duplicate?: boolean; id?: string | null } | null = null;
      if (event.eventType === "ORDER_STARTED") {
        const r = await supabase.rpc("picker_start_order", {
          p_order_id: event.orderId,
          p_idempotency_key: key,
        });
        if (r.error) throw r.error;
        data = r.data;
      } else if (
        event.eventType === "LOCATION_SCANNED" ||
        event.eventType === "SKU_SCANNED"
      ) {
        const payload = event.payload ?? {};
        const r = await supabase.rpc("sync_scan_event", {
          p_id: key,
          p_order_id: event.orderId,
          p_item_id: event.lineId,
          p_scan_type: event.eventType === "LOCATION_SCANNED" ? "LOCATION" : "SKU",
          p_barcode: String(payload.scanValue ?? ""),
          p_expected_value: String(payload.expectedValue ?? ""),
          p_result: "SUCCESS",
          p_idempotency_key: key,
          p_device_id: event.deviceId ?? null,
        });
        if (r.error) throw r.error;
        data = r.data;
      } else if (event.eventType === "QTY_CONFIRMED") {
        const payload = event.payload ?? {};
        const r = await supabase.rpc("picker_pick_item", {
          p_order_id: event.orderId,
          p_item_id: event.lineId,
          p_sku: String(payload.sku ?? ""),
          p_quantity: Number(payload.qty),
          p_idempotency_key: key,
        });
        if (r.error) throw r.error;
        data = r.data;
      } else if (event.eventType === "EXCEPTION_RAISED") {
        const payload = event.payload ?? {};
        const r = await supabase.rpc("create_exception", {
          p_order_id: event.orderId,
          p_item_id: event.lineId ?? null,
          p_type: String(payload.type ?? "OTHER"),
          p_reason: String(payload.reasonCode ?? ""),
          p_quantity: payload.qty == null ? null : Number(payload.qty),
          p_note: payload.note == null ? null : String(payload.note),
          p_idempotency_key: key,
        });
        if (r.error) throw r.error;
        data = r.data;
      } else if (event.eventType === "ORDER_COMPLETED") {
        const r = await supabase.rpc("picker_complete_order", {
          p_order_id: event.orderId,
          p_idempotency_key: key,
        });
        if (r.error) throw r.error;
        data = r.data;
      } else {
        throw new Error(`Unsupported offline event ${String(event.eventType)}`);
      }

      const duplicate = data?.duplicate === true;
      results.push({
        clientEventId: key,
        status: duplicate ? "DUPLICATE" : "ACCEPTED",
        message: null,
        serverEventId: data?.id ?? null,
      });
      processedCount += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync event rejected";
      results.push({
        clientEventId: key,
        status: "CONFLICT",
        message,
        serverEventId: null,
      });
      conflicts.push({
        clientEventId: key,
        conflictType: "SERVER_REJECTED",
        serverState: { error: message },
      });
    }
  }

  return { processedCount, results, conflicts };
}

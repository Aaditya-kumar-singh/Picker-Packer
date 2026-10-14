import {
  apiRequest,
  getAuthToken,
  setAuthToken,
  HttpApiError,
} from "@/api/http";
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

export type PackerDashboardStats = {
  assigned: number;
  completed: number;
  itemsPackedToday: number;
};

function error(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function decodeJwt(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

let currentUserCache: User | null = null;
const recentScansCache = new Map<string, RecentScan[]>();

function mapBackendItem(i: any): OrderItem {
  const reqQty = Number(i.orderedQty ?? i.required_qty ?? 0);
  const pckQty = Number(i.pickedQty ?? i.picked_qty ?? 0);
  const pakQty = Number(i.packedQty ?? i.packed_qty ?? 0);
  const loc = i.locationCode || i.location || "DEFAULT";

  let lineStatus: OrderItem["lineStatus"] = "PENDING";
  if (pckQty >= reqQty && reqQty > 0) {
    lineStatus = "PICKED";
  } else if (pckQty > 0) {
    lineStatus = "SKU_VALIDATED";
  }

  return {
    id: String(i.itemId ?? i.id ?? ""),
    sku: String(i.sku ?? ""),
    productName: String(i.productName ?? i.product_name ?? "Item"),
    productSpecs: String(i.variantLabel ?? i.productSpecs ?? ""),
    productImageUrl: i.productImageUrl ?? null,
    productType: i.productType ?? "STANDARD",
    skuBarcode: String(i.skuBarcode ?? i.sku ?? ""),
    location: loc,
    locationBarcode: loc,
    requiredQty: reqQty,
    pickedQty: pckQty,
    packedQty: pakQty,
    lineStatus,
  };
}

function mapBackendOrder(o: any): OrderSummary {
  const rawItems = Array.isArray(o.items) ? o.items : [];
  const items = rawItems.map(mapBackendItem);
  const totalCount = items.length || Number(o.totalItems ?? o.itemCount ?? 0);
  const pickedCount = items.filter((i: OrderItem) => i.pickedQty >= i.requiredQty).length;
  const packedCount = items.reduce((sum: number, i: OrderItem) => sum + i.packedQty, 0);

  let status: OrderStatus = "PICKING";
  const rawStatus = String(o.orderStatus ?? o.status ?? "PICKING").toUpperCase();
  if (rawStatus === "CONFIRMED" || rawStatus === "ASSIGNED") status = "ASSIGNED";
  else if (rawStatus === "PICKING") status = "PICKING";
  else if (rawStatus === "PACKING") status = "PACKING";
  else if (rawStatus === "PACKED") status = "PACKED";
  else if (rawStatus === "RIDER_ASSIGNED") status = "RIDER_ASSIGNED";
  else if (rawStatus === "READY_FOR_PACKING") status = "READY_FOR_PACKING";

  return {
    id: String(o.orderId ?? o.id ?? ""),
    orderNumber: String(o.orderNumber ?? o.id ?? ""),
    customer: o.customerName || o.customer || "Customer",
    warehouseId: o.warehouseId ? String(o.warehouseId) : undefined,
    priority: o.priority || "NORMAL",
    slaMinutes: Number(o.slaMinutes ?? 60),
    status,
    pickerId: o.pickerId ? String(o.pickerId) : null,
    packerId: o.packerId ? String(o.packerId) : null,
    riderId: o.riderId ? String(o.riderId) : null,
    riderName: o.riderName || null,
    createdAt: o.orderDate || o.createdAt || new Date().toISOString(),
    updatedAt: o.updatedAt || new Date().toISOString(),
    itemCount: totalCount,
    pickedCount,
    packedCount,
    packageCount: 0,
    items,
  };
}

export function setAccessToken(token: string | null) {
  void setAuthToken(token);
}

export function getAccessToken(): string | null {
  return null;
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const res = await apiRequest<{ token?: string; accessToken?: string; user?: any }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier,
      password,
      loginMethod: "PASSWORD",
    }),
  });

  const token = res.data?.token || res.data?.accessToken || (res as any)?.token;
  if (!token) {
    error("Token not received from auth server", 401);
  }

  await setAuthToken(token);

  // Determine user details and role
  const jwt = decodeJwt(token);
  let role: Role = "PICKER";
  const roleStr = JSON.stringify(jwt || {}).toUpperCase();
  if (roleStr.includes("PACKER")) {
    role = "PACKER";
  }

  // Try fetching actual profile
  let profileData: any = null;
  try {
    if (role === "PACKER") {
      const pRes = await apiRequest("/api/packer-app/profile");
      profileData = pRes.data;
    } else {
      const pRes = await apiRequest("/api/picker-app/profile");
      profileData = pRes.data;
    }
  } catch {
    // If specific profile endpoint failed, fallback to JWT or default
  }

  const user: User = {
    id: String(profileData?.staffId ?? jwt?.sub ?? jwt?.id ?? "1"),
    email: profileData?.email || profileData?.phone || identifier,
    name: profileData?.name || identifier.split("@")[0],
    role,
    warehouseId: String(profileData?.warehouseId ?? "1"),
  };

  currentUserCache = user;
  return { token, user };
}

export async function me(): Promise<{ user: User }> {
  if (currentUserCache) return { user: currentUserCache };

  // Try picker profile first
  try {
    const res = await apiRequest("/api/picker-app/profile");
    const d = res.data;
    currentUserCache = {
      id: String(d.staffId ?? "1"),
      email: d.email || d.phone || "",
      name: d.name || "Picker",
      role: "PICKER",
      warehouseId: String(d.warehouseId ?? "1"),
    };
    return { user: currentUserCache };
  } catch {
    // Try packer profile
    const res = await apiRequest("/api/packer-app/profile");
    const d = res.data;
    currentUserCache = {
      id: String(d.staffId ?? "1"),
      email: d.email || d.phone || "",
      name: d.name || "Packer",
      role: "PACKER",
      warehouseId: String(d.warehouseId ?? "1"),
    };
    return { user: currentUserCache };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PICKER APIS
// ─────────────────────────────────────────────────────────────────────────────

export async function pickerMetrics(): Promise<PickerMetrics> {
  const res = await apiRequest<{
    assignedOrdersCount?: number;
    completedOrdersCount?: number;
    totalItemsPickedToday?: number;
  }>("/api/picker-app/stats");

  const d = res.data || {};
  const completed = Number(d.completedOrdersCount ?? 0);
  const itemsPicked = Number(d.totalItemsPickedToday ?? 0);

  return {
    period: "24h",
    ordersPicked: completed,
    skuScans: itemsPicked,
    scanAccuracyPercent: 100,
    exceptions: 0,
    firstScanSuccessPercent: 100,
    totalPickedQty: itemsPicked,
    pickedUnitsPerHour: 0,
    ordersPerHour: 0,
    averagePickingMinutes: 0,
    shortPickPercent: 0,
    exceptionPercent: 0,
  };
}

export async function pickerOrders(): Promise<{ orders: OrderSummary[]; total: number; page: number; limit: number }> {
  const res = await apiRequest<any[]>("/api/picker-app/orders/assigned");
  const rawList = Array.isArray(res.data) ? res.data : [];
  const orders = rawList.map(mapBackendOrder);
  return { orders, total: orders.length, page: 1, limit: 50 };
}

export async function pickerOrder(id: string): Promise<{ order: OrderDetail }> {
  // First, check assigned orders for full details
  const { orders } = await pickerOrders();
  let found = orders.find((o) => o.id === id || o.orderNumber === id);

  if (!found || !found.items || found.items.length === 0) {
    // Fetch items directly
    const itemsRes = await apiRequest<any[]>(`/api/picker-app/orders/${id}/items`);
    const items = (Array.isArray(itemsRes.data) ? itemsRes.data : []).map(mapBackendItem);
    if (!found) {
      found = {
        id,
        orderNumber: id,
        customer: "Customer",
        priority: "NORMAL",
        slaMinutes: 60,
        status: "PICKING",
        createdAt: new Date().toISOString(),
        itemCount: items.length,
        items,
      };
    } else {
      found.items = items;
    }
  }

  const orderDetail: OrderDetail = {
    ...found,
    items: found.items ?? [],
    exceptions: [],
    packages: [],
    packingConfirmations: [],
    recentScans: recentScansCache.get(id) || [],
  };

  return { order: orderDetail };
}

export async function pickerStart(id: string, _idempotencyKey: string) {
  // Order is already in PICKING status when assigned
  return { ok: true as const, status: "PICKING" as const };
}

export async function pickerComplete(id: string, _idempotencyKey: string) {
  return { ok: true as const, status: "READY_FOR_PACKING" as const };
}

export async function validateLocation(
  _id: string,
  _itemId: string,
  barcode: string,
  _key: string
) {
  return { valid: true as const, expected: barcode, scanned: barcode, duplicate: false };
}

export async function validatePickSku(
  _id: string,
  _itemId: string,
  barcode: string,
  _key: string
) {
  return { valid: true as const, expected: barcode, scanned: barcode, duplicate: false };
}

export async function pickItem(
  id: string,
  itemId: string,
  skuBarcode: string,
  quantity: number,
  _idempotencyKey: string
) {
  let latestPickedQty = 0;
  // Scan one unit at a time according to backend spec
  const loopCount = Math.max(1, quantity);
  for (let i = 0; i < loopCount; i++) {
    const res = await apiRequest<{
      success: boolean;
      message: string;
      scannedQty?: number;
      orderFullyPicked?: boolean;
      items?: any[];
    }>(`/api/picker-app/orders/${id}/scan`, {
      method: "POST",
      body: JSON.stringify({ barcode: skuBarcode }),
    });

    if (res.success === false) {
      error(res.message || "Scan failed");
    }

    latestPickedQty = Number(res.data?.scannedQty ?? (latestPickedQty + 1));
  }

  return {
    ok: true as const,
    pickedQty: latestPickedQty,
    orderStatus: "PICKING" as const,
  };
}

export async function assignPacker(id: string, packerId: number) {
  const res = await apiRequest(`/api/picker-app/orders/${id}/assign-packer`, {
    method: "POST",
    body: JSON.stringify({ packerId }),
  });
  return res.data;
}

export async function availablePackers() {
  const res = await apiRequest<any[]>("/api/picker-app/available-packers");
  return res.data || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKER APIS
// ─────────────────────────────────────────────────────────────────────────────

export async function packerDashboardStats(): Promise<PackerDashboardStats> {
  const res = await apiRequest<{
    assignedOrders?: number;
    completedOrders?: number;
    todayOrdersPacked?: number;
    todayItemsScanned?: number;
  }>("/api/packer-app/stats");

  const d = res.data || {};
  return {
    assigned: Number(d.assignedOrders ?? 0),
    completed: Number(d.completedOrders ?? 0),
    itemsPackedToday: Number(d.todayItemsScanned ?? 0),
  };
}

export async function packerOrders(): Promise<{ orders: OrderSummary[]; total: number; page: number; limit: number }> {
  const res = await apiRequest<any[]>("/api/packer-app/orders/assigned");
  const list = (Array.isArray(res.data) ? res.data : []).map(mapBackendOrder);
  return { orders: list, total: list.length, page: 1, limit: 50 };
}

export async function packerCompletedOrders(): Promise<{ orders: OrderSummary[]; total: number; page: number; limit: number }> {
  const { orders } = await packerOrders();
  const completed = orders.filter((o) => o.status === "PACKED" || o.status === "RIDER_ASSIGNED");
  return { orders: completed, total: completed.length, page: 1, limit: 50 };
}

export async function packerOrder(id: string): Promise<{ order: OrderDetail }> {
  const res = await apiRequest<any>(`/api/packer-app/orders/${id}`);
  const summary = mapBackendOrder(res.data);
  const detail: OrderDetail = {
    ...summary,
    items: summary.items ?? [],
    exceptions: [],
    packages: [],
    packingConfirmations: [],
    recentScans: recentScansCache.get(id) || [],
  };
  return { order: detail };
}

export async function packerScanBarcode(id: string, barcode: string, _key: string) {
  const trimmed = barcode.trim();
  if (!trimmed) error("Scan a product barcode");

  const res = await apiRequest<{
    success: boolean;
    message: string;
    scannedItemName?: string;
    scannedQty?: number;
    orderFullyPacked?: boolean;
    orderStatus?: string;
    items?: any[];
  }>(`/api/packer-app/orders/${id}/scan`, {
    method: "POST",
    body: JSON.stringify({ barcode: trimmed }),
  });

  if (res.success === false) {
    error(res.message || "Scan failed");
  }

  // Update recent scans cache
  const scans = recentScansCache.get(id) || [];
  scans.push({
    itemId: trimmed,
    barcode: trimmed,
    scanType: "SKU",
    createdAt: new Date().toISOString(),
  });
  recentScansCache.set(id, scans);

  // Fetch updated order detail
  const { order } = await packerOrder(id);
  const matchedItem = order.items.find((i) => i.skuBarcode.toUpperCase() === trimmed.toUpperCase()) || order.items[0];

  return {
    order,
    item: matchedItem,
    allPacked: res.data?.orderFullyPacked === true || order.status === "PACKED",
  };
}

export async function packerDispatch(): Promise<{ orders: OrderSummary[]; total: number }> {
  const { orders } = await packerOrders();
  const dispatchable = orders.filter((o) => o.status === "PACKED" || o.status === "RIDER_ASSIGNED");
  return { orders: dispatchable, total: dispatchable.length };
}

export async function packerRiders(): Promise<{ riders: Rider[] }> {
  const res = await apiRequest<any[]>("/api/packer-app/riders/available");
  const rawList = Array.isArray(res.data) ? res.data : [];
  const riders: Rider[] = rawList.map((r) => ({
    id: String(r.id),
    name: String(r.name || "Rider"),
    phone: r.phone ? String(r.phone) : null,
  }));
  return { riders };
}

export async function assignRider(id: string, riderId: string | undefined, riderName: string | undefined, _key: string) {
  if (!riderId) error("Rider is required");
  await apiRequest(`/api/packer-app/orders/${id}/assign-rider`, {
    method: "POST",
    body: JSON.stringify({ riderId: Number(riderId) }),
  });

  return {
    ok: true as const,
    order: {
      id,
      status: "RIDER_ASSIGNED" as const,
      riderId,
      riderName: riderName ?? "",
    },
  };
}

export async function packerStart(id: string, _key: string) {
  return { ok: true as const, order: { id, status: "PACKING" as const } };
}

export async function validatePackSku(id: string, itemId: string, barcode: string, _key: string) {
  const { order } = await packerOrder(id);
  const item = order.items.find((i) => i.id === itemId);
  if (!item) error("Item not found", 404);
  if (item.sku.trim().toUpperCase() !== barcode.trim().toUpperCase()) error("SKU barcode does not match");
  return { valid: true as const, item };
}

export async function confirmPackItem(
  id: string,
  itemId: string,
  _productName: string,
  _productType: string,
  productBarcode: string,
  _quantity: number,
  _condition: "GOOD" | "DAMAGED" | "OTHER",
  key: string
) {
  const scanRes = await packerScanBarcode(id, productBarcode, key);
  const item = scanRes.item;
  return {
    item: { id: item.id, packedQty: item.packedQty, pickedQty: item.pickedQty },
    remaining: Math.max(0, item.pickedQty - item.packedQty),
  };
}

export async function createPackage(
  id: string,
  packageType: string,
  weight: number | undefined,
  dimensions: PackageRecord["dimensions"],
  _key: string
) {
  return {
    package: {
      id: newClientEventId(),
      packageNumber: 1,
      packageType,
      weight: weight ?? null,
      dimensions: dimensions ?? null,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function packerComplete(id: string, _key: string) {
  const { order } = await packerOrder(id);
  return {
    order: { id, status: "PACKED" as const, packages: order.packages },
    nextStep: { status: "PACKED" as const, message: "Ready for dispatch" },
  };
}

export async function createException(id: string, payload: Record<string, unknown>, idempotencyKey?: string) {
  const key = idempotencyKey ?? newClientEventId();
  return {
    ok: true as const,
    exception: {
      id: key,
      orderId: id,
      itemId: (payload.itemId as string) ?? null,
      type: String(payload.type ?? "OTHER"),
      status: "OPEN",
    },
  };
}

export async function grantEvidenceUpload(exceptionId: string, fileName: string, mimeType: string, fileSizeBytes?: number) {
  const objectKey = `evidence/${exceptionId}/${fileName}`;
  return {
    uploadUrl: objectKey,
    objectKey,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}

export async function uploadEvidenceBytes(objectKey: string, _bytes: Uint8Array, _mimeType: string) {
  return { objectKey };
}

export async function completeEvidenceUpload(_exceptionId: string, evidenceId: string) {
  return { id: evidenceId, status: "COMPLETED" };
}

export async function listExceptionEvidence(_exceptionId: string) {
  return [] as Array<Record<string, unknown>>;
}

export async function syncEvents(batch: { events: Array<any> }) {
  let processedCount = 0;
  const results: Array<{
    clientEventId: string;
    status: "ACCEPTED" | "DUPLICATE" | "REJECTED" | "CONFLICT";
    message: string | null;
    serverEventId: string | null;
  }> = [];

  for (const event of batch.events) {
    const key = String(event.clientEventId ?? newClientEventId());
    try {
      if (event.eventType === "QTY_CONFIRMED") {
        const payload = event.payload ?? {};
        await apiRequest(`/api/picker-app/orders/${event.orderId}/scan`, {
          method: "POST",
          body: JSON.stringify({ barcode: payload.sku }),
        });
      }
      results.push({ clientEventId: key, status: "ACCEPTED", message: null, serverEventId: key });
      processedCount += 1;
    } catch (e) {
      results.push({
        clientEventId: key,
        status: "CONFLICT",
        message: e instanceof Error ? e.message : "Sync error",
        serverEventId: null,
      });
    }
  }

  return { processedCount, results, conflicts: [] };
}

export async function updateProfile(role: Role, data: Record<string, any>) {
  const endpoint = role === "PACKER" ? "/api/packer-app/profile" : "/api/picker-app/profile";
  const res = await apiRequest(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function changePassword(role: Role, currentPassword: string, newPassword: string) {
  const endpoint = role === "PACKER" ? "/api/packer-app/change-password" : "/api/picker-app/change-password";
  const res = await apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return res.data;
}

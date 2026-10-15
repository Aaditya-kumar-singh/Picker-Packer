import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const API_BASE = "https://test.yourbuildmart.com/api";
const TOKEN_KEY = "ybm.warehouse.jwt";
let token: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
const assignedCache = new Map<StaffRole, WarehouseOrder[]>();
export function onUnauthorized(handler: (() => void) | null) { unauthorizedHandler = handler; }

export type StaffRole = "PICKER" | "PACKER";
export type StaffProfile = {
  staffId: number; name: string; phone: string; email: string; status: string;
  idCardType: string | null; idCardNumber: string | null; address: string | null;
  photoFilePath?: string | null;
};
export type WarehouseItem = {
  itemId: number; sku: string; productName: string; variantLabel: string | null;
  barcode?: string | null; productBarcode?: string | null;
  orderedQty: number; pickedQty: number; packedQty: number;
  locationCode?: string | null;
};
export type WarehouseOrder = {
  orderId: number; orderNumber: string; orderStatus: string; orderDate: string;
  totalItems: number; totalItemsScanned: number; items: WarehouseItem[];
};
export type ScanResult = {
  success: boolean;
  message: string;
  barcode: string | null;
  scannedItemName: string | null;
  scannedQty: number | null;
  orderedQty: number | null;
  totalItemsPicked?: number | null;
  totalItemsScanned?: number | null;
  totalItems: number | null;
  orderStatus: string;
  orderFullyPicked?: boolean;
  orderFullyPacked?: boolean;
  scannedAt?: string | null;
  items: WarehouseItem[];
};
export type RawWarehouseItem = {
  id: number; sku: string; productName: string; barcode?: string | null; productBarcode?: string | null; orderedQty: number;
  pickedQty: number; packedQty: number; unitPrice?: number; lineTotal?: number;
};
export type Candidate = { id: number; name: string; phone: string; rating?: number };

export async function saveToken(value: string | null) {
  assignedCache.clear();
  token = value;
  if (Platform.OS === "web") {
    if (value) window.localStorage.setItem(TOKEN_KEY, value);
    else window.localStorage.removeItem(TOKEN_KEY);
  } else if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function restoreToken() {
  token = Platform.OS === "web" ? window.localStorage.getItem(TOKEN_KEY) : await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = Platform.OS === "web" ? `/warehouse-proxy?path=${encodeURIComponent(path)}` : `${API_BASE}${path}`;
  const controller = new AbortController();
  // Allow the same-origin web proxy to finish its own 30-second upstream
  // timeout and return a useful 502/504 response before aborting the UI call.
  const timeout = setTimeout(() => controller.abort(), Platform.OS === "web" ? 35000 : 30000);
  let response: Response;
  let body: any;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    body = await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`No response for ${path} within ${Platform.OS === "web" ? 35 : 30} seconds. Check your connection and retry.`);
    if (error instanceof SyntaxError) throw new Error(`Invalid API response for ${path}`);
    throw new Error(`Network request failed: ${path}`);
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 401 && !path.startsWith("/auth/")) {
    await saveToken(null);
    unauthorizedHandler?.();
    throw new Error("Session expired. Please log in again.");
  }
  if (!response.ok || body?.success === false) {
    throw new Error(body?.data?.message || body?.message || `Request failed (HTTP ${response.status})`);
  }
  return (Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body) as T;
}

function findToken(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;
  if (typeof value === "string") {
    // Some auth services return the JWT directly as the response data.
    return value.split(".").length === 3 && value.length > 40 ? value : null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["token", "accessToken", "access_token", "jwt", "jwtToken", "jwt_token", "authToken", "idToken"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  for (const [key, nested] of Object.entries(record)) {
    if (/refresh|password|secret/i.test(key)) continue;
    const found = findToken(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

async function finishLogin(data: unknown) {
  const jwt = findToken(data);
  if (!jwt) {
    const fields = data && typeof data === "object" ? Object.keys(data).join(", ") : typeof data;
    throw new Error(`Login succeeded, but token was not found in response fields: ${fields || "none"}`);
  }
  await saveToken(jwt);
  return data;
}

export async function login(identifier: string, password: string) {
  return finishLogin(await request<unknown>("/auth/login", {
    method: "POST", body: JSON.stringify({ identifier, password, loginMethod: "PASSWORD" }),
  }));
}
export async function requestOtp(identifier: string) {
  return request<{ expiresInSeconds?: number; expiresIn?: number; maskedContact?: string; masked?: string }>("/auth/otp/request", {
    method: "POST", body: JSON.stringify({ identifier }),
  });
}
export async function loginWithOtp(identifier: string, otp: string) {
  return finishLogin(await request<unknown>("/auth/login", {
    method: "POST", body: JSON.stringify({ identifier, otp, loginMethod: "OTP" }),
  }));
}

export const rolePath = (role: StaffRole) => role === "PACKER" ? "/packer-app" : "/picker-app";
export const profile = (role: StaffRole) => request<StaffProfile>(`${rolePath(role)}/profile`);
export const updateProfile = (role: StaffRole, values: Partial<StaffProfile>) => request<StaffProfile>(`${rolePath(role)}/profile`, { method: "PUT", body: JSON.stringify(values) });
export const changePassword = (role: StaffRole, currentPassword: string, newPassword: string) => request<unknown>(`${rolePath(role)}/change-password`, { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
export async function assignedOrders(role: StaffRole) {
  const orders = await request<WarehouseOrder[]>(`${rolePath(role)}/orders/assigned`);
  assignedCache.set(role, Array.isArray(orders) ? orders : []);
  return orders;
}
export const cachedAssignedOrder = (role: StaffRole, id: number) => assignedCache.get(role)?.find(item => item.orderId === id) ?? null;
export const stats = (role: StaffRole) => request<Record<string, number>>(`${rolePath(role)}/stats`);
export const order = (role: StaffRole, id: number) => request<WarehouseOrder>(`${rolePath(role)}/orders/${id}`);
export const pickerItems = (id: number) => request<WarehouseItem[]>(`/picker-app/orders/${id}/items`);
export const packerItems = (id: number) => request<RawWarehouseItem[]>(`/packer-app/orders/${id}/items`);
export const scan = (role: StaffRole, id: number, barcode: string) => request<ScanResult>(`${rolePath(role)}/orders/${id}/scan`, { method: "POST", body: JSON.stringify({ barcode }) });
export const packers = () => request<Candidate[]>("/picker-app/available-packers");
export const riders = () => request<Candidate[]>("/packer-app/riders/available");
export const assignPacker = (id: number, packerId: number) => request<unknown>(`/picker-app/orders/${id}/assign-packer`, { method: "POST", body: JSON.stringify({ packerId }) });
export const assignRider = (id: number, riderId: number) => request<unknown>(`/packer-app/orders/${id}/assign-rider`, { method: "POST", body: JSON.stringify({ riderId }) });

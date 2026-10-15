import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApiErrorEnvelope, ApiResponseEnvelope } from "@/types";

const TOKEN_KEY = "ybm.auth.jwt";
const ROLE_KEY = "ybm.auth.role";

function getBaseUrl(): string {
  // If running in a web browser on localhost, route through Metro proxy to avoid browser CORS preflight blocks
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    return `${window.location.origin}/api`;
  }

  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.trim().length > 0) {
    let clean = envUrl.trim().replace(/\/+$/, "");
    if (clean.includes("test-admin.yourbuildmart.com")) {
      clean = clean.replace("test-admin.yourbuildmart.com", "test.yourbuildmart.com");
      if (!clean.endsWith("/api")) {
        clean = `${clean}/api`;
      }
    }
    return clean;
  }
  return "https://test.yourbuildmart.com/api";
}

export const API_BASE_URL = getBaseUrl();

/** Resolves relative photo paths (e.g. "staff/ravi.jpg") against backend base URL */
export function resolvePhotoUrl(filePath?: string | null): string | null {
  if (!filePath || filePath.trim().length === 0) return null;
  if (filePath.startsWith("http://") || filePath.startsWith("https://") || filePath.startsWith("data:")) {
    return filePath;
  }
  const clean = filePath.replace(/^\/+/, "");
  const originBase = (API_BASE_URL.includes("localhost") || API_BASE_URL.includes("127.0.0.1"))
    ? "https://test.yourbuildmart.com"
    : API_BASE_URL.replace(/\/api$/, "");
  return `${originBase}/${clean}`;
}

export class ApiHttpError extends Error {
  traceId?: string;
  error: string;
  status: number;
  fieldErrors?: Array<{ field: string; message: string }> | null;
  timestamp?: string;

  constructor(envelope: ApiErrorEnvelope) {
    super(envelope.message || envelope.error || "API Request Failed");
    this.name = "ApiHttpError";
    this.error = envelope.error || "HTTP_ERROR";
    this.status = envelope.status || 500;
    this.traceId = envelope.traceId;
    this.fieldErrors = envelope.fieldErrors;
    this.timestamp = envelope.timestamp;
  }
}

// In-memory cache for fast synchronous access
let memoryToken: string | null = null;
let memoryRole: "PICKER" | "PACKER" | null = null;

export async function getStoredToken(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  try {
    if (Platform.OS !== "web") {
      const val = await SecureStore.getItemAsync(TOKEN_KEY);
      if (val) {
        memoryToken = val;
        return val;
      }
    }
  } catch {
    // fallback to AsyncStorage
  }
  const val = await AsyncStorage.getItem(TOKEN_KEY);
  memoryToken = val;
  return val;
}

export async function setStoredToken(token: string | null): Promise<void> {
  memoryToken = token;
  if (!token) {
    try {
      if (Platform.OS !== "web") await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {}
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  try {
    if (Platform.OS !== "web") {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      return;
    }
  } catch {}
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getStoredRole(): Promise<"PICKER" | "PACKER" | null> {
  if (memoryRole) return memoryRole;
  const val = await AsyncStorage.getItem(ROLE_KEY);
  if (val === "PICKER" || val === "PACKER") {
    memoryRole = val;
    return val;
  }
  return null;
}

export async function setStoredRole(role: "PICKER" | "PACKER" | null): Promise<void> {
  memoryRole = role;
  if (!role) {
    await AsyncStorage.removeItem(ROLE_KEY);
    return;
  }
  await AsyncStorage.setItem(ROLE_KEY, role);
}

export async function clearStoredAuth(): Promise<void> {
  await setStoredToken(null);
  await setStoredRole(null);
}

type UnauthorizedHandler = () => void;
const unauthorizedHandlers: Set<UnauthorizedHandler> = new Set();

export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

function triggerUnauthorized(): void {
  void clearStoredAuth();
  for (const handler of unauthorizedHandlers) {
    try {
      handler();
    } catch (e) {
      console.warn("Error in unauthorized handler:", e);
    }
  }
}

export interface HttpRequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

/**
 * Universal JSON request helper.
 * Automatically unwraps `{ success: true, message, data }` envelopes.
 * Transparently captures 400 scan soft-failures (`{ success: false, data: { ... } }`).
 */
export async function apiRequest<T>(
  path: string,
  options: HttpRequestOptions = {}
): Promise<T> {
  const { skipAuth = false, headers = {}, ...rest } = options;
  let normalizedPath = path.startsWith("/") ? path : `/${path}`;
  let base = API_BASE_URL;
  if (base.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    normalizedPath = normalizedPath.slice(4);
  }
  const url = path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `${base}${normalizedPath}`;

  const requestHeaders: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    ...headers,
  };

  if (!skipAuth) {
    const token = await getStoredToken();
    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: requestHeaders,
    });
  } catch (netErr: any) {
    throw new ApiHttpError({
      error: "NETWORK_ERROR",
      message: netErr?.message || "Unable to connect to server. Please check your network.",
      status: 0,
      fieldErrors: null,
    });
  }

  if (response.status === 401) {
    triggerUnauthorized();
    throw new ApiHttpError({
      error: "UNAUTHORIZED",
      message: "Session expired. Please log in again.",
      status: 401,
      fieldErrors: null,
    });
  }

  const rawText = await response.text();
  let body: any = null;
  if (rawText && rawText.trim().length > 0) {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = rawText;
    }
  }

  if (typeof body === "string" && (body.trim().startsWith("<!doctype") || body.trim().startsWith("<html"))) {
    throw new ApiHttpError({
      error: "INVALID_RESPONSE",
      message: "Received web HTML page instead of API JSON response. Please check your API URL configuration.",
      status: response.status,
      fieldErrors: null,
    });
  }

  // Handle 400 Soft-Failures:
  // picker-app-api.md and packer-app-api.md specify that POST /orders/{id}/scan
  // returns HTTP 400 with a success envelope where "success": false.
  if (response.status === 400 && body && typeof body === "object" && body.success === false) {
    // Return this as a valid soft-failure response payload
    return (body.data ?? body) as T;
  }

  if (!response.ok) {
    if (body && typeof body === "object" && ("error" in body || "message" in body)) {
      throw new ApiHttpError({
        traceId: body.traceId,
        error: body.error || `HTTP_${response.status}`,
        message: body.message || `Request failed with status ${response.status}`,
        status: body.status || response.status,
        fieldErrors: body.fieldErrors,
        timestamp: body.timestamp,
      });
    }
    throw new ApiHttpError({
      error: `HTTP_${response.status}`,
      message: typeof body === "string" ? body : `Request failed with status ${response.status}`,
      status: response.status,
      fieldErrors: null,
    });
  }

  // If response is standard success envelope, unwrap data
  if (body && typeof body === "object" && "success" in body && "data" in body) {
    return body.data as T;
  }

  return body as T;
}

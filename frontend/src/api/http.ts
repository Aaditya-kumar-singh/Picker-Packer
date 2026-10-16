import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApiErrorEnvelope, ApiResponseEnvelope } from "@/types";

const TOKEN_KEY = "ybm.auth.jwt";
const ROLE_KEY = "ybm.auth.role";
const TEST_API_HOSTS = new Set(["test.yourbuildmart.com", "test-admin.yourbuildmart.com"]);

function getBaseUrl(): string {
  // Local web development uses Metro's proxy to avoid browser CORS preflight blocks.
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    return `${window.location.origin}/api`;
  }

  // Native/release builds must receive their API URL explicitly; do not silently fall back to test.
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!configuredUrl) return "";
  const apiEnvironment = process.env.EXPO_PUBLIC_API_ENV?.trim().toLowerCase();
  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "https:") return "";
    const isTestHost = TEST_API_HOSTS.has(parsed.hostname.toLowerCase());
    const isProductionBuild = process.env.NODE_ENV === "production";
    if (isProductionBuild && apiEnvironment !== "test" && apiEnvironment !== "production") return "";
    if (apiEnvironment === "test" && !isTestHost) return "";
    if (apiEnvironment === "production" && isTestHost) return "";
    if (parsed.hostname === "test-admin.yourbuildmart.com") {
      parsed.hostname = "test.yourbuildmart.com";
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export const API_BASE_URL = getBaseUrl();

/** Resolves relative photo paths (e.g. "staff/ravi.jpg") against backend base URL */
export function resolvePhotoUrl(filePath?: string | null): string | null {
  if (!filePath || filePath.trim().length === 0) return null;
  if (filePath.startsWith("http://") || filePath.startsWith("https://") || filePath.startsWith("data:")) {
    return filePath;
  }
  if (!API_BASE_URL) return null;
  const clean = filePath.replace(/^\/+/, "");
  const originBase = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${originBase}/${clean}`;
}

export class ApiHttpError extends Error {
  traceId?: string;
  error: string;
  status: number;
  fieldErrors?: Array<{ field: string; message: string }> | null;
  timestamp?: string;

  constructor(envelope: ApiErrorEnvelope) {
    const baseMessage = envelope.message || envelope.error || "API Request Failed";
    const details = envelope.fieldErrors?.filter((item) => item?.field && item?.message).map((item) => `${item.field}: ${item.message}`) ?? [];
    super(details.length > 0 ? `${baseMessage}\n${details.join("\n")}` : baseMessage);
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

  if (Platform.OS !== "web") {
    let secureToken: string | null;
    try {
      secureToken = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      throw new Error("Secure session storage is unavailable. Restart the app and sign in again.");
    }

    if (secureToken) {
      memoryToken = secureToken;
      return secureToken;
    }

    // One-time migration for tokens saved by older builds using AsyncStorage as a fallback.
    const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
    if (!legacyToken) return null;
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, legacyToken);
      await AsyncStorage.removeItem(TOKEN_KEY);
      memoryToken = legacyToken;
      return legacyToken;
    } catch {
      throw new Error("Could not migrate your session to secure storage. Please sign in again.");
    }
  }

  const val = await AsyncStorage.getItem(TOKEN_KEY);
  memoryToken = val;
  return val;
}

export async function setStoredToken(token: string | null): Promise<void> {
  if (!token) {
    memoryToken = null;
    if (Platform.OS !== "web") {
      try {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } catch {
        // Remove any legacy copy even if the secure store is temporarily unavailable.
        await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
        throw new Error("Could not clear the secure session. Restart the app before signing in again.");
      }
    }
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }

  if (Platform.OS !== "web") {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await AsyncStorage.removeItem(TOKEN_KEY);
      memoryToken = token;
      return;
    } catch {
      memoryToken = null;
      throw new Error("Could not save the session securely. Please try signing in again.");
    }
  }

  await AsyncStorage.setItem(TOKEN_KEY, token);
  memoryToken = token;
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
  if (!API_BASE_URL) {
    throw new ApiHttpError({
      error: "API_CONFIGURATION_ERROR",
      message: "The API server is not configured for this build. Set EXPO_PUBLIC_API_ENV and EXPO_PUBLIC_API_BASE_URL for the intended backend, then rebuild the app.",
      status: 0,
      fieldErrors: null,
    });
  }

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

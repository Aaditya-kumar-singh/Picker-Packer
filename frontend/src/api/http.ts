import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:8080"
).replace(/\/+$/, "");

const TOKEN_KEY = "ybm.auth.jwt-token";

let inMemoryToken: string | null = null;

export async function getAuthToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  try {
    const stored = await AsyncStorage.getItem(TOKEN_KEY);
    inMemoryToken = stored;
    return stored;
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string | null): Promise<void> {
  inMemoryToken = token;
  try {
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export interface ApiSuccessEnvelope<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiErrorEnvelope {
  traceId?: string;
  error?: string;
  message?: string;
  status?: number;
  fieldErrors?: Array<{ field: string; message: string }> | null;
  timestamp?: string;
}

export class HttpApiError extends Error {
  status: number;
  code: string;
  fieldErrors?: Array<{ field: string; message: string }> | null;
  traceId?: string;
  data?: unknown;

  constructor(message: string, status = 400, code = "API_ERROR", details?: { fieldErrors?: any; traceId?: string; data?: unknown }) {
    super(message);
    this.name = "HttpApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = details?.fieldErrors;
    this.traceId = details?.traceId;
    this.data = details?.data;
  }
}

/**
 * Standard fetch wrapper for Backend REST APIs with JWT & envelopes.
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiSuccessEnvelope<T>> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err) {
    throw new HttpApiError(
      err instanceof Error ? err.message : "Network request failed",
      0,
      "NETWORK_ERROR"
    );
  }

  let json: any = null;
  const text = await response.text();
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      throw new HttpApiError(text || `HTTP ${response.status}`, response.status, "SERVER_ERROR");
    }
    return { success: true, message: "OK", data: text as any };
  }

  // Handle 401 Unauthorized
  if (response.status === 401) {
    await setAuthToken(null);
    throw new HttpApiError(
      json.message || "Unauthorized. Please log in again.",
      401,
      "UNAUTHORIZED"
    );
  }

  // Handle scan soft-failures: HTTP 400 with success envelope ({ success: false, data: ... })
  if (response.status === 400 && json && json.success === false) {
    return json as ApiSuccessEnvelope<T>;
  }

  // Handle error envelope ({ error, message, status, ... })
  if (!response.ok || json.error) {
    throw new HttpApiError(
      json.message || `Request failed with status ${response.status}`,
      json.status || response.status,
      json.error || "BUSINESS_ERROR",
      {
        fieldErrors: json.fieldErrors,
        traceId: json.traceId,
        data: json.data,
      }
    );
  }

  return json as ApiSuccessEnvelope<T>;
}

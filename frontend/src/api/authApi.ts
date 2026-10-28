import {
  apiRequest,
  setStoredToken,
  setStoredRole,
  clearStoredAuth,
  getStoredRole,
} from "./http";
import type { UserRole } from "@/types";
import { FULFILLMENT_OTP_LOGIN_ENABLED } from "@/config/auth";

export interface PasswordLoginPayload {
  identifier: string;
  password: string;
}

export interface OtpRequestPayload {
  identifier: string;
}

export interface OtpLoginPayload {
  identifier: string;
  otp: string;
}

export interface AuthSession {
  token: string;
  role: UserRole;
  user?: any;
}

const FULFILLMENT_LOGIN_PATH = "/api/auth/fulfillment/login";

function normalizeRole(roleClaim: unknown): UserRole | null {
  if (typeof roleClaim !== "string") return null;
  const normalized = roleClaim.trim().toUpperCase().replace(/^ROLE[_: -]?/, "");
  if (normalized === "PACKER") return "PACKER";
  if (normalized === "PICKER") return "PICKER";
  return null;
}

function parseJwtRole(token: string): UserRole | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const parsed = JSON.parse(jsonPayload);
    const roleClaim =
      parsed.role ??
      parsed.roles?.[0] ??
      parsed.authorities?.[0] ??
      parsed.authority;
    return normalizeRole(roleClaim);
  } catch {
    return null;
  }
}

function extractRole(data: any, token: string): UserRole {
  const directRole =
    data?.role ??
    data?.user?.role ??
    data?.roles?.[0] ??
    data?.authorities?.[0] ??
    data?.authority;

  if (directRole !== undefined && directRole !== null) {
    const normalized = normalizeRole(directRole);
    if (normalized) return normalized;
    throw new Error("Authentication response contained an unsupported staff role.");
  }

  const fromJwt = parseJwtRole(token);
  if (fromJwt) return fromJwt;

  throw new Error("Authentication response did not contain a recognized PICKER or PACKER role.");
}

function extractToken(res: any): string {
  if (typeof res === "string" && res.split(".").length === 3) {
    return res;
  }
  const token = res?.token ?? res?.accessToken ?? res?.jwt ?? res?.data?.token ?? res?.data?.accessToken;
  if (!token || typeof token !== "string") {
    throw new Error("Authentication response did not contain a valid security token.");
  }
  return token;
}

export async function loginWithPassword(payload: PasswordLoginPayload): Promise<AuthSession> {
  const res = await apiRequest<any>(FULFILLMENT_LOGIN_PATH, {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({
      identifier: payload.identifier.trim(),
      password: payload.password,
      loginMethod: "PASSWORD",
    }),
  });

  const token = extractToken(res);
  const role = extractRole(res, token);

  await setStoredToken(token);
  await setStoredRole(role);

  return { token, role, user: res?.user ?? res?.data?.user };
}

export async function requestOtp(payload: OtpRequestPayload): Promise<{ success: boolean; message: string }> {
  if (!FULFILLMENT_OTP_LOGIN_ENABLED) {
    throw new Error("OTP login is unavailable. Sign in with your password.");
  }
  await apiRequest<any>("/api/auth/otp/request", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({
      identifier: payload.identifier.trim(),
      purpose: "LOGIN",
    }),
  });
  return {
    success: true,
    message: "Verification code requested.",
  };
}

export async function loginWithOtp(payload: OtpLoginPayload): Promise<AuthSession> {
  if (!FULFILLMENT_OTP_LOGIN_ENABLED) {
    throw new Error("OTP login is unavailable. Sign in with your password.");
  }
  const res = await apiRequest<any>(FULFILLMENT_LOGIN_PATH, {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({
      identifier: payload.identifier.trim(),
      otp: payload.otp.trim(),
      loginMethod: "OTP",
    }),
  });

  const token = extractToken(res);
  const role = extractRole(res, token);

  await setStoredToken(token);
  await setStoredRole(role);

  return { token, role, user: res?.user ?? res?.data?.user };
}

export async function logout(): Promise<void> {
  await clearStoredAuth();
}

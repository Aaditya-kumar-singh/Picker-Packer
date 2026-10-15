import {
  apiRequest,
  setStoredToken,
  setStoredRole,
  clearStoredAuth,
  getStoredRole,
} from "./http";
import type { UserRole } from "@/types";

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

function parseJwtRole(token: string): UserRole | null {
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
    const parsed = JSON.parse(jsonPayload);
    const roleClaim =
      parsed.role ||
      parsed.roles?.[0] ||
      parsed.authorities?.[0] ||
      parsed.authority;
    if (typeof roleClaim === "string") {
      if (roleClaim.toUpperCase().includes("PACKER")) return "PACKER";
      if (roleClaim.toUpperCase().includes("PICKER")) return "PICKER";
    }
  } catch {}
  return null;
}

function extractRole(data: any, token: string): UserRole {
  const directRole =
    data?.role ??
    data?.user?.role ??
    data?.roles?.[0] ??
    data?.authorities?.[0] ??
    data?.authority;

  if (typeof directRole === "string") {
    if (directRole.toUpperCase().includes("PACKER")) return "PACKER";
    if (directRole.toUpperCase().includes("PICKER")) return "PICKER";
  }

  const fromJwt = parseJwtRole(token);
  if (fromJwt) return fromJwt;

  // Default fallback if unknown
  return "PICKER";
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
  const res = await apiRequest<any>("/api/auth/login", {
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
  const res = await apiRequest<any>("/api/auth/otp/request", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({
      identifier: payload.identifier.trim(),
      phone: payload.identifier.trim(),
    }),
  });
  return {
    success: true,
    message: typeof res === "string" ? res : (res?.message ?? "OTP requested successfully"),
  };
}

export async function loginWithOtp(payload: OtpLoginPayload): Promise<AuthSession> {
  const res = await apiRequest<any>("/api/auth/login", {
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

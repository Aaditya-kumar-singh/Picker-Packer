import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { router } from "expo-router";
import * as api from "@/api/warehouseApi";
import type { PickerProfile } from "@/types";

interface AuthState {
  picker: PickerProfile | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  requestOtp: (pickerId: string) => Promise<{ expiresIn: number; masked: string } | null>;
  verifyOtp: (pickerId: string, otp: string) => Promise<boolean>;
  loginWithEmail: (identifier: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
const AuthCtx = createContext<AuthState | null>(null);

async function resolveProfile(): Promise<PickerProfile> {
  let lastError: unknown;
  for (const role of ["PICKER", "PACKER"] as const) {
    try {
      const staff = await api.profile(role);
      return {
        id: String(staff.staffId), pickerCode: staff.phone,
        name: staff.name, role, warehouseId: staff.address || "",
        warehouseName: staff.address || "",
      };
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("No picker or packer profile found for this login");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [picker, setPicker] = useState<PickerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.onUnauthorized(() => { if (active) { setPicker(null); router.replace("/login" as never); } });
    void api.restoreToken().then(async (token) => {
      if (token && active) setPicker(await resolveProfile());
    }).catch(async () => {
      await api.saveToken(null);
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; api.onUnauthorized(null); };
  }, []);

  const loginWithEmail = useCallback(async (identifier: string, password: string) => {
    setLoading(true); setError(null);
    try {
      await api.login(identifier, password);
      setPicker(await resolveProfile());
      return true;
    } catch (e) {
      await api.saveToken(null);
      setError(e instanceof Error ? e.message : "Login failed");
      return false;
    } finally { setLoading(false); }
  }, []);

  const refreshProfile = useCallback(async () => { setPicker(await resolveProfile()); }, []);
  const logout = useCallback(async () => {
    await api.saveToken(null);
    setPicker(null);
    router.replace("/login" as never);
  }, []);
  const requestOtp = useCallback(async (identifier: string) => {
    setLoading(true); setError(null);
    try {
      const result = await api.requestOtp(identifier);
      return { expiresIn: result?.expiresInSeconds ?? result?.expiresIn ?? 0, masked: result?.maskedContact ?? result?.masked ?? identifier };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send OTP");
      return null;
    } finally { setLoading(false); }
  }, []);
  const verifyOtp = useCallback(async (identifier: string, otp: string) => {
    setLoading(true); setError(null);
    try {
      await api.loginWithOtp(identifier, otp);
      setPicker(await resolveProfile());
      return true;
    } catch (e) {
      await api.saveToken(null);
      setError(e instanceof Error ? e.message : "OTP login failed");
      return false;
    } finally { setLoading(false); }
  }, []);
  const value = useMemo(() => ({ picker, loading, ready, error, requestOtp, verifyOtp, loginWithEmail, logout, refreshProfile }), [picker, loading, ready, error, requestOtp, verifyOtp, loginWithEmail, logout, refreshProfile]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export function useAuth() {
  const value = useContext(AuthCtx);
  if (!value) throw new Error("useAuth outside provider");
  return value;
}

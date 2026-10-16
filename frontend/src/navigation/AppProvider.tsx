import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getStoredToken,
  getStoredRole,
  onUnauthorized,
  setStoredToken,
  setStoredRole,
  clearStoredAuth,
} from "@/api/http";
import * as authApi from "@/api/authApi";
import { pickerAppApi } from "@/api/pickerAppApi";
import { packerAppApi } from "@/api/packerAppApi";
import type { FulfillmentStaffProfileDto, UserRole } from "@/types";

export interface UserSessionProfile {
  id: number;
  staffId: number;
  pickerCode: string;
  name: string;
  role: UserRole;
  phone: string;
  email: string | null;
  warehouseId?: number | string;
  warehouseName?: string;
  profile: FulfillmentStaffProfileDto;
}

interface AuthState {
  picker: UserSessionProfile | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  loginWithPassword: (identifier: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  loginWithEmail: (email: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  requestOtp: (identifier: string) => Promise<{ expiresIn: number; masked: string } | null>;
  verifyOtp: (identifier: string, otp: string) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<FulfillmentStaffProfileDto>) => Promise<{ ok: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);
const REMEMBER_ME_KEY = "ybm.auth.remember-me";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [picker, setPicker] = useState<UserSessionProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfileForRole = useCallback(async (role: UserRole): Promise<UserSessionProfile> => {
    const profile = role === "PACKER"
      ? await packerAppApi.getProfile()
      : await pickerAppApi.getProfile();

    return {
      id: profile.staffId,
      staffId: profile.staffId,
      pickerCode: profile.phone || String(profile.staffId),
      name: profile.name,
      role,
      phone: profile.phone,
      email: profile.email,
      warehouseId: (profile as FulfillmentStaffProfileDto & { warehouseId?: number | string | null }).warehouseId ?? undefined,
      warehouseName: (profile as FulfillmentStaffProfileDto & { warehouseName?: string | null }).warehouseName ?? undefined,
      profile,
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        const rememberMe = (await AsyncStorage.getItem(REMEMBER_ME_KEY)) !== "false";
        const token = await getStoredToken();
        const role = await getStoredRole();

        if (!rememberMe || !token || !role) {
          if (mounted) setReady(true);
          return;
        }

        const userProfile = await fetchProfileForRole(role);
        if (mounted) {
          setPicker(userProfile);
        }
      } catch (err: any) {
        if (mounted) {
          // If profile fetch failed or token is invalid, clear stored auth
          await clearStoredAuth();
          setPicker(null);
        }
      } finally {
        if (mounted) setReady(true);
      }
    };

    void restoreSession();

    // Auto-logout listener on 401 Unauthorized
    const unregister = onUnauthorized(() => {
      pickerAppApi.clearSession();
      packerAppApi.clearSession();
      if (mounted) {
        setPicker(null);
        router.replace("/login" as never);
      }
    });

    return () => {
      mounted = false;
      unregister();
    };
  }, [fetchProfileForRole]);

  const loginWithPassword = useCallback(
    async (identifier: string, password: string, rememberMe = true): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await AsyncStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");
        const session = await authApi.loginWithPassword({ identifier, password });
        const userProfile = await fetchProfileForRole(session.role);
        setPicker(userProfile);
        return true;
      } catch (e: any) {
        const msg = e?.message || "Login failed. Please verify your credentials.";
        setError(msg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchProfileForRole]
  );

  const requestOtp = useCallback(async (identifier: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.requestOtp({ identifier });
      // Never expose a server-returned development OTP to navigation or UI state.
      return { expiresIn: 300, masked: identifier };
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(
    async (identifier: string, otp: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const session = await authApi.loginWithOtp({ identifier, otp });
        const userProfile = await fetchProfileForRole(session.role);
        setPicker(userProfile);
        return true;
      } catch (e: any) {
        setError(e?.message || "Invalid OTP entered.");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchProfileForRole]
  );

  const refreshProfile = useCallback(async () => {
    if (!picker) return;
    try {
      const updated = await fetchProfileForRole(picker.role);
      setPicker(updated);
    } catch {}
  }, [picker, fetchProfileForRole]);

  const updateProfile = useCallback(
    async (patch: Partial<FulfillmentStaffProfileDto>): Promise<{ ok: boolean; error?: string }> => {
      if (!picker) return { ok: false, error: "No active session." };
      setError(null);
      setLoading(true);
      try {
        const updated = picker.role === "PACKER"
          ? await packerAppApi.updateProfile(patch)
          : await pickerAppApi.updateProfile(patch);

        setPicker((prev) => (prev ? { ...prev, name: updated.name, phone: updated.phone, email: updated.email, profile: updated } : null));
        return { ok: true };
      } catch (e: any) {
        const message = e?.message || "Failed to update profile.";
        setError(message);
        return { ok: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [picker]
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> => {
      if (!picker) return { ok: false, error: "No active session." };
      setError(null);
      setLoading(true);
      try {
        if (picker.role === "PACKER") {
          await packerAppApi.changePassword({ currentPassword, newPassword });
        } else {
          await pickerAppApi.changePassword({ currentPassword, newPassword });
        }
        return { ok: true };
      } catch (e: any) {
        const message = e?.message || "Failed to change password.";
        setError(message);
        return { ok: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [picker]
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    pickerAppApi.clearSession();
    packerAppApi.clearSession();
    setPicker(null);
    router.replace("/login" as never);
  }, []);

  const value = useMemo(
    () => ({
      picker,
      loading,
      ready,
      error,
      loginWithPassword,
      loginWithEmail: loginWithPassword,
      requestOtp,
      verifyOtp,
      refreshProfile,
      updateProfile,
      changePassword,
      logout,
    }),
    [
      picker,
      loading,
      ready,
      error,
      loginWithPassword,
      requestOtp,
      verifyOtp,
      refreshProfile,
      updateProfile,
      changePassword,
      logout,
    ]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthCtx);
  if (!context) throw new Error("useAuth outside provider");
  return context;
}

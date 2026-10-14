import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as client from "@/api/client";
import { getAuthToken, setAuthToken, apiRequest } from "@/api/http";
import { pickerRepository } from "@/repositories/pickerRepository";
import type { PickerProfile } from "@/types";

interface AuthState {
  picker: PickerProfile | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  requestOtp: (pickerId: string) => Promise<{ expiresIn: number; masked: string } | null>;
  verifyOtp: (pickerId: string, otp: string) => Promise<boolean>;
  loginWithEmail: (email: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  switchRole: () => void;
  loginAsTestUser: (role?: "PICKER" | "PACKER") => void;
}

const AuthCtx = createContext<AuthState | null>(null);
const REMEMBER_ME_KEY = "ybm.auth.remember-me";

// Default test session for direct Dashboard access without login barrier
const DEFAULT_TEST_PICKER: PickerProfile = {
  id: "12",
  pickerCode: "picker.test@yourbuildmart.com",
  name: "Amit Verma (Test Picker)",
  role: "PICKER",
  warehouseId: "3",
  warehouseName: "Warehouse 3",
};

function userToProfile(user: client.User): PickerProfile {
  return {
    id: user.id,
    pickerCode: user.email,
    name: user.name,
    role: user.role === "PACKER" ? "PACKER" : "PICKER",
    warehouseId: user.warehouseId,
    warehouseName: `Warehouse ${user.warehouseId}`,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Directly set test user so login is skipped and Dashboard loads immediately
  const [picker, setPicker] = useState<PickerProfile | null>(DEFAULT_TEST_PICKER);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      try {
        const token = await getAuthToken();
        if (token && mounted) {
          try {
            const { user } = await client.me();
            if (mounted) {
              setPicker(userToProfile(user));
            }
          } catch {
            // Keep default test user if server profile call fails
          }
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Session restore failed");
      }
    };
    void restore();

    return () => {
      mounted = false;
    };
  }, []);

  const switchRole = useCallback(() => {
    setPicker((current) => {
      if (!current) return DEFAULT_TEST_PICKER;
      const nextRole = current.role === "PICKER" ? "PACKER" : "PICKER";
      return {
        ...current,
        role: nextRole,
        name: nextRole === "PACKER" ? "Ravi Kumar (Test Packer)" : "Amit Verma (Test Picker)",
      };
    });
  }, []);

  const loginAsTestUser = useCallback((role: "PICKER" | "PACKER" = "PICKER") => {
    setPicker({
      ...DEFAULT_TEST_PICKER,
      role,
      name: role === "PACKER" ? "Ravi Kumar (Test Packer)" : "Amit Verma (Test Picker)",
    });
    router.replace(role === "PACKER" ? "/packer-dashboard" : "/dashboard");
  }, []);

  const requestOtp = useCallback(async (identifier: string) => {
    setError(null);
    try {
      const res = await apiRequest<{ expiresInSeconds?: number; maskedContact?: string }>(
        "/api/auth/otp/request",
        {
          method: "POST",
          body: JSON.stringify({ identifier }),
        }
      );
      return {
        expiresIn: res.data?.expiresInSeconds ?? 60,
        masked: res.data?.maskedContact ?? identifier,
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request OTP");
      return null;
    }
  }, []);

  const verifyOtp = useCallback(async (identifier: string, otp: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ token?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier,
          otp,
          loginMethod: "OTP",
        }),
      });
      const token = res.data?.token;
      if (!token) throw new Error("No token returned for OTP login");
      await setAuthToken(token);
      const { user } = await client.me();
      setPicker(userToProfile(user));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP verification failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string, rememberMe = true) => {
    setLoading(true);
    setError(null);
    try {
      await AsyncStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");
      const { user } = await client.login(email, password);
      setPicker(userToProfile(user));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await setAuthToken(null);
    await pickerRepository.logout();
    setPicker(null);
    router.replace("/login" as never);
  }, []);

  const value = useMemo(
    () => ({ picker, loading, ready, error, requestOtp, verifyOtp, loginWithEmail, logout, switchRole, loginAsTestUser }),
    [picker, loading, ready, error, requestOtp, verifyOtp, loginWithEmail, logout, switchRole, loginAsTestUser]
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthCtx);
  if (!context) throw new Error("useAuth outside provider");
  return context;
}

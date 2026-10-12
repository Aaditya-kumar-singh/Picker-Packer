import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/api/supabase";
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
}

const AuthCtx = createContext<AuthState | null>(null);
const REMEMBER_ME_KEY = "ybm.auth.remember-me";

async function loadProfile(userId: string): Promise<PickerProfile> {
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
  if (error || !data) throw new Error("User profile not found in database.");
  return {
    id: data.id,
    pickerCode: data.email,
    name: data.name,
    role: data.role,
    warehouseId: data.warehouse_id,
    warehouseName: data.warehouse_id,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [picker, setPicker] = useState<PickerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      try {
        const rememberMe = (await AsyncStorage.getItem(REMEMBER_ME_KEY)) !== "false";
        const { data } = await supabase.auth.getSession();
        if (!rememberMe && data.session) {
          await supabase.auth.signOut();
        } else if (data.session && mounted) {
          setPicker(await loadProfile(data.session.user.id));
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Session restore failed");
      } finally {
        if (mounted) setReady(true);
      }
    };
    void restore();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      // getSession() above already restores INITIAL_SESSION. Avoid loading the
      // same profile a second time when Supabase emits that event.
      if (event === "INITIAL_SESSION") return;
      if (!mounted) return;
      if (!session) {
        setPicker(null);
        return;
      }
      try {
        setPicker(await loadProfile(session.user.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Profile load failed");
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const requestOtp = useCallback(async (_pickerId: string) => {
    setError("OTP login has been replaced by Supabase email/password authentication.");
    return null;
  }, []);

  const verifyOtp = useCallback(async (_pickerId: string, _otp: string) => {
    setError("OTP login has been replaced by Supabase email/password authentication.");
    return false;
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string, rememberMe = true) => {
    setLoading(true);
    setError(null);
    try {
      await AsyncStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !data.user) throw new Error(authError?.message || "Login failed");
      setPicker(await loadProfile(data.user.id));
      if (!rememberMe) {
        // Keep the current shift active in memory, but discard the persisted
        // Supabase session so the next app launch requires sign-in again.
        await supabase.auth.signOut({ scope: "local" });
        setPicker(await loadProfile(data.user.id));
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    await pickerRepository.logout();
    setPicker(null);
    router.replace("/login" as never);
  }, []);

  const value = useMemo(
    () => ({ picker, loading, ready, error, requestOtp, verifyOtp, loginWithEmail, logout }),
    [picker, loading, ready, error, requestOtp, verifyOtp, loginWithEmail, logout],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthCtx);
  if (!context) throw new Error("useAuth outside provider");
  return context;
}

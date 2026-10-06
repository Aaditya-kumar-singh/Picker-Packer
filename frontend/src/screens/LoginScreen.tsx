import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppHeader, ErrorBanner, FieldInput, PrimaryButton, Screen, theme } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";

const DEV_QUICK_LOGIN = process.env.EXPO_PUBLIC_DEV_QUICK_LOGIN === "true";
const DEV_ACCOUNTS = {
  picker: {
    label: "QUICK LOGIN • PICKER",
    email: process.env.EXPO_PUBLIC_DEV_PICKER_EMAIL ?? "",
    password: process.env.EXPO_PUBLIC_DEV_PICKER_PASSWORD ?? "",
  },
  packer: {
    label: "QUICK LOGIN • PACKER",
    email: process.env.EXPO_PUBLIC_DEV_PACKER_EMAIL ?? "",
    password: process.env.EXPO_PUBLIC_DEV_PACKER_PASSWORD ?? "",
  },
} as const;

export function LoginScreen() {
  const { loginWithEmail, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const quickLoginVisible = useMemo(() => __DEV__ || DEV_QUICK_LOGIN, []);
  const quickLoginReady = useMemo(
    () => ({
      picker: Boolean(DEV_ACCOUNTS.picker.email && DEV_ACCOUNTS.picker.password),
      packer: Boolean(DEV_ACCOUNTS.packer.email && DEV_ACCOUNTS.packer.password),
    }),
    [],
  );

  async function onContinue() {
    if (!email.trim() || !password.trim()) {
      setLocalError("Enter both Email and Password");
      return;
    }
    setLocalError(null);
    const success = await loginWithEmail(email.trim(), password.trim());
    if (success) router.replace("/");
  }

  async function onQuickLogin(role: "picker" | "packer") {
    const account = DEV_ACCOUNTS[role];
    if (!account.email || !account.password) {
      setLocalError("Development quick login is not configured.");
      return;
    }
    setLocalError(null);
    setEmail(account.email);
    setPassword(account.password);
    const success = await loginWithEmail(account.email, account.password);
    if (success) router.replace("/");
  }

  const busy = loading;

  return (
    <Screen center>
      <View style={ls.brandBox}>
        <View style={ls.monogram}>
          <Text style={ls.monogramText}>YBM</Text>
          <Text style={ls.monogramSub}>WAREHOUSE</Text>
        </View>
        <Text style={ls.version}>WAREHOUSE MANAGEMENT SYSTEM v4.2</Text>
      </View>

      <View style={ls.heroCard}>
        <Text style={ls.heroTitle}>Staff Login</Text>
        <Text style={ls.heroDesc}>Enter your email and password to begin your shift</Text>
        <View style={ls.scannerBar}>
          <View style={ls.scannerDot} />
          <Text style={ls.scannerLabel}>SCANNER READY</Text>
          <View style={ls.activeChip}>
            <View style={ls.activeDot} />
            <Text style={ls.activeText}>ACTIVE</Text>
          </View>
        </View>
      </View>

      <FieldInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="e.g. picker@ybm.com"
        returnKeyType="next"
        editable={!busy}
      />
      <View style={{ height: 16 }} />
      <FieldInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Enter password"
        returnKeyType="go"
        onSubmitEditing={onContinue}
        error={localError}
        editable={!busy}
      />
      <ErrorBanner message={localError ? null : error} />
      <PrimaryButton label={busy ? "Working…" : "LOGIN"} onPress={onContinue} disabled={busy} />

      {quickLoginVisible ? (
        <View style={ls.quickButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !quickLoginReady.picker }}
            onPress={() => void onQuickLogin("picker")}
            disabled={busy || !quickLoginReady.picker}
            style={({ pressed }) => [
              ls.quickPicker,
              (busy || !quickLoginReady.picker) && ls.quickDisabled,
              pressed && !busy && quickLoginReady.picker && ls.quickPressed,
            ]}
          >
            <Text style={ls.quickButtonText}>Test • LogIn as Picker</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !quickLoginReady.packer }}
            onPress={() => void onQuickLogin("packer")}
            disabled={busy || !quickLoginReady.packer}
            style={({ pressed }) => [
              ls.quickPacker,
              (busy || !quickLoginReady.packer) && ls.quickDisabled,
              pressed && !busy && quickLoginReady.packer && ls.quickPressed,
            ]}
          >
            <Text style={ls.quickButtonText}>Test • LogIn as Packer</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={ls.footer}>
        <Text style={ls.footerText}>Protected by YBM Enterprise Security</Text>
      </View>
    </Screen>
  );
}

const ls = StyleSheet.create({
  brandBox: { alignItems: "center", marginBottom: theme.space.lg },
  monogram: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.sm,
    alignItems: "center",
    shadowColor: theme.color.ink,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: theme.space.xs,
  },
  monogramText: {
    fontSize: 32,
    fontWeight: "800",
    color: theme.color.primary,
    letterSpacing: 4,
  },
  monogramSub: {
    ...(theme.type.labelMd as object),
    color: theme.color.primaryContainer,
    letterSpacing: 3,
  },
  version: {
    ...(theme.type.secondary as object),
    color: theme.color.secondary,
    letterSpacing: 1.2,
    fontWeight: "600",
  },
  heroCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginBottom: theme.space.md,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  heroTitle: { ...(theme.type.display as object), color: theme.color.ink, marginBottom: theme.space.xxs },
  heroDesc: { ...(theme.type.bodyMd as object), color: theme.color.muted },
  scannerBar: {
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginTop: theme.space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
  },
  scannerDot: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
  },
  scannerLabel: {
    ...(theme.type.labelMd as object),
    color: theme.color.primaryContainer,
    flex: 1,
  },
  activeChip: {
    backgroundColor: theme.color.surfaceContainerHigh,
    paddingHorizontal: theme.space.xs,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.primary,
  },
  activeText: { ...(theme.type.caption as object), color: theme.color.ink },
  quickButtons: {
    marginTop: theme.space.xs,
    gap: theme.space.xs,
  },
  quickPicker: {
    backgroundColor: "#1f7a4d",
    minHeight: theme.touch.primary,
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    alignItems: "center",
    marginTop: theme.space.sm,
  },
  quickPacker: {
    backgroundColor: "#7a4f1f",
    minHeight: theme.touch.primary,
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    alignItems: "center",
    marginTop: theme.space.sm,
  },
  quickButtonText: { ...(theme.type.button as object), color: theme.color.onPrimary },
  quickDisabled: { opacity: 0.45 },
  quickPressed: { opacity: 0.88 },
  footer: { alignItems: "center", marginTop: theme.space.md },
  footerText: { ...(theme.type.secondary as object), color: theme.color.muted },
});

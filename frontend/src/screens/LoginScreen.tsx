import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ErrorBanner, FieldInput, PrimaryButton, Screen, theme } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";

export function LoginScreen() {
  const { loginWithEmail, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onContinue() {
    if (!email.trim() || !password.trim()) {
      setLocalError("Enter both Email and Password");
      return;
    }
    setLocalError(null);
    const success = await loginWithEmail(email.trim(), password.trim(), rememberMe);
    if (success) router.replace("/");
  }

  const busy = loading;

  return (
    <Screen center backgroundColor={theme.color.bg}>
      <View style={ls.brandBox}>
        <View style={ls.logoCircle}>
          <Text style={ls.logoLetter}>Y</Text>
        </View>
        <Text style={ls.brandTitle}>YBM WAREHOUSE</Text>
        <Text style={ls.version}>Warehouse Execution System</Text>
      </View>

      <View style={ls.heroCard}>
        <View style={ls.heroCopy}>
          <Text style={ls.heroTitle}>Staff Sign In</Text>
          <Text style={ls.heroDesc}>Enter your warehouse credentials to begin your active shift</Text>
        </View>
        <View style={ls.scannerBar}>
          <Ionicons name="barcode-outline" size={20} color={theme.color.primaryContainer} />
          <Text style={ls.scannerLabel}>HARDWARE SCANNER</Text>
          <View style={ls.activeChip}>
            <View style={ls.activeDot} />
            <Text style={ls.activeText}>ONLINE</Text>
          </View>
        </View>
      </View>

      <FieldInput
        label="Work Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="username@ybm.internal"
        returnKeyType="next"
        editable={!busy}
      />
      <View style={{ height: 8 }} />
      <FieldInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Enter your shift password"
        returnKeyType="go"
        onSubmitEditing={onContinue}
        error={localError}
        editable={!busy}
      />

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: rememberMe, disabled: busy }}
        accessibilityLabel="Remember me on this device"
        onPress={() => setRememberMe((value) => !value)}
        disabled={busy}
        style={ls.rememberRow}
        hitSlop={6}
      >
        <View style={[ls.checkbox, rememberMe && ls.checkboxChecked]}>
          {rememberMe ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
        </View>
        <Text style={ls.rememberText}>Remember me</Text>
      </Pressable>

      <ErrorBanner message={localError ? null : error} />
      <PrimaryButton
        label={busy ? "Authenticating…" : "LOG IN TO SHIFT"}
        icon="log-in-outline"
        onPress={onContinue}
        disabled={busy}
      />

      <View style={ls.footer}>
        <Ionicons name="shield-checkmark-outline" size={14} color={theme.color.muted} style={{ marginRight: 4 }} />
        <Text style={ls.footerText}>Protected by YBM Enterprise Multi-Tenant Security</Text>
      </View>
    </Screen>
  );
}

const ls = StyleSheet.create({
  brandBox: {
    alignItems: "center",
    marginBottom: theme.space.md,
    paddingTop: theme.space.xs,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.color.ink,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: theme.space.xs,
  },
  logoLetter: {
    fontSize: 36,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#ffffff",
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.color.ink,
    letterSpacing: 2,
  },
  version: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 2,
    fontWeight: "600",
  },
  heroCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  heroCopy: { marginBottom: theme.space.xs },
  heroTitle: {
    ...(theme.type.titleMd as object),
    color: theme.color.ink,
  },
  heroDesc: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  scannerBar: {
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 8,
    marginTop: theme.space.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  scannerLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.primaryContainer,
    flex: 1,
    fontWeight: "800",
  },
  activeChip: {
    backgroundColor: theme.color.okBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.okInk,
  },
  activeText: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.color.okInk,
  },
  rememberRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 10,
    marginTop: theme.space.xs,
    marginBottom: theme.space.xs,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: theme.color.muted,
    backgroundColor: theme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: theme.color.primaryContainer,
    borderColor: theme.color.primaryContainer,
  },
  rememberText: {
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.space.md,
  },
  footerText: {
    fontSize: 11,
    color: theme.color.muted,
    fontWeight: "500",
  },
});

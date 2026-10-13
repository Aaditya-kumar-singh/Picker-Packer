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
      {/* Brand */}
      <View style={ls.brandBox}>
        <View style={ls.logoCircle}>
          <Text style={ls.logoLetter}>Y</Text>
        </View>
        <Text style={ls.brandTitle}>YBM WAREHOUSE</Text>
        <Text style={ls.version}>Warehouse Execution System</Text>
      </View>

      {/* Sign In heading */}
      <View style={ls.headingCard}>
        <Text style={ls.headingTitle}>Sign In</Text>
        <Text style={ls.headingDesc}>Enter your credentials to start your shift</Text>
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
        label={busy ? "Authenticating…" : "LOG IN"}
        icon="log-in-outline"
        onPress={onContinue}
        disabled={busy}
      />

      <View style={ls.footer}>
        <Ionicons name="shield-checkmark-outline" size={13} color={theme.color.muted} style={{ marginRight: 4 }} />
        <Text style={ls.footerText}>Protected by YBM Enterprise Security</Text>
      </View>
    </Screen>
  );
}

const ls = StyleSheet.create({
  brandBox: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginBottom: 8,
  },
  logoLetter: {
    fontSize: 30,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#ffffff",
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: theme.color.ink,
    letterSpacing: 2,
  },
  version: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  headingCard: {
    marginBottom: 6,
  },
  headingTitle: {
    ...(theme.type.titleMd as object),
    color: theme.color.ink,
  },
  headingDesc: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  rememberRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
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
    marginTop: 16,
  },
  footerText: {
    fontSize: 11,
    color: theme.color.muted,
    fontWeight: "500",
  },
});

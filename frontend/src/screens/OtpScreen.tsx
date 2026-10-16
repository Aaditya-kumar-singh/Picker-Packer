// Screen 2 — OTP verification. Shift authentication, 6-digit pin, and device session lock.
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { ErrorBanner, PrimaryButton, Screen, SecondaryButton, theme } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";

export function OtpScreen() {
  const { pickerId, expiresIn, masked, developmentOtp } = useLocalSearchParams<{ pickerId: string; expiresIn?: string; masked?: string; developmentOtp?: string }>();
  const { verifyOtp, requestOtp, loading, error } = useAuth();
  const [otp, setOtp] = useState("");
  const [info, setInfo] = useState<string | null>(__DEV__ && developmentOtp ? `Development OTP: ${developmentOtp}` : null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [otpMeta, setOtpMeta] = useState<{ expiresIn: string; masked: string } | null>(null);
  const showExpires = otpMeta?.expiresIn ?? expiresIn ?? null;
  const showMasked = otpMeta?.masked ?? masked ?? null;

  async function onVerify() {
    if (otp.trim().length !== 6) {
      setLocalError("Enter the 6-digit verification code");
      return;
    }
    setLocalError(null);
    setInfo(null);
    const ok = await verifyOtp(String(pickerId ?? ""), otp.trim());
    if (ok) router.replace("/" as never);
  }

  async function onResend() {
    const r = await requestOtp(String(pickerId ?? ""));
    if (r) {
      setOtpMeta({ expiresIn: String(r.expiresIn), masked: r.masked });
      setInfo(__DEV__ && r.developmentOtp ? `Development OTP: ${r.developmentOtp}` : `New code sent to ${r.masked}`);
    } else {
      setInfo(null);
    }
  }

  return (
    <Screen center>
      {/* Shift authentication badge + timer */}
      <View style={os.authRow}>
        <View style={os.authBadge}>
          <View style={os.authDot} />
          <Text style={os.authLabel}>SHIFT AUTHENTICATION</Text>
        </View>
        {showExpires ? (
          <View style={os.expBadge}>
            <Ionicons name="time-outline" size={13} color={theme.color.primary} />
            <Text style={os.expText}>{showExpires}s</Text>
          </View>
        ) : null}
      </View>

      <Text style={os.headline}>Enter Verification Code</Text>
      <Text style={os.maskedText}>
        {showMasked
          ? `Code sent to terminal ${showMasked}`
          : `Operator ${pickerId} — enter your 6-digit shift code`}
      </Text>

      {/* OTP digit input */}
      <TextInput
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="● ● ● ● ● ●"
        textAlign="center"
        style={os.otpInput}
        returnKeyType="go"
        onSubmitEditing={onVerify}
        editable={!loading}
        placeholderTextColor={theme.color.line}
        autoFocus
      />

      {/* Resend info */}
      <View style={os.resendRow}>
        <Text style={os.resendText}>
          {showExpires ? `Code expires in ${showExpires}s` : "Didn't receive code?"}
        </Text>
      </View>

      <ErrorBanner message={localError ? null : error} />
      {info ? (
        <View style={os.infoBanner}>
          <Ionicons name="checkmark-circle" size={16} color={theme.color.okInk} />
          <Text style={os.infoText}>{info}</Text>
        </View>
      ) : null}

      <View style={os.actions}>
        <PrimaryButton
          label={loading ? "Verifying…" : "VERIFY & START SHIFT"}
          icon="shield-checkmark"
          onPress={onVerify}
          disabled={loading || otp.trim().length !== 6}
        />
        <SecondaryButton
          label="Resend OTP"
          icon="refresh"
          onPress={onResend}
          disabled={loading}
        />
      </View>

      {/* Session footer */}
      <View style={os.sessionFooter}>
        <Ionicons name="lock-closed-outline" size={13} color={theme.color.muted} />
        <Text style={os.sessionText}>Active session locked to this device for shift duration</Text>
      </View>
    </Screen>
  );
}

const os = StyleSheet.create({
  authRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.space.md,
  },
  authBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.color.surfaceContainerLow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  authDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.color.primaryContainer,
  },
  authLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.color.primaryContainer,
    letterSpacing: 0.5,
  },
  expBadge: {
    backgroundColor: theme.color.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  expText: {
    ...(theme.type.codeMd as object),
    fontSize: 12,
    color: theme.color.primary,
    fontWeight: "700",
  },
  headline: {
    ...(theme.type.title as object),
    color: theme.color.ink,
    fontSize: 20,
    textAlign: "center",
    marginBottom: 4,
  },
  maskedText: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    textAlign: "center",
    marginBottom: theme.space.md,
    fontSize: 13,
  },
  otpInput: {
    backgroundColor: theme.color.surface,
    borderWidth: 2,
    borderColor: theme.color.primaryContainer,
    borderRadius: theme.radius.lg,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 10,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    color: theme.color.ink,
    minHeight: 64,
    textAlign: "center",
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: theme.space.xs,
    marginBottom: theme.space.xs,
  },
  resendText: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    fontSize: 12,
  },
  infoBanner: {
    backgroundColor: theme.color.okBg,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginVertical: theme.space.xs,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    ...(theme.type.bodyMd as object),
    color: theme.color.okInk,
    fontWeight: "600",
    fontSize: 12,
    flex: 1,
  },
  actions: {
    marginTop: theme.space.xs,
    gap: 6,
  },
  sessionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: theme.space.md,
  },
  sessionText: {
    fontSize: 11,
    color: theme.color.muted,
  },
});

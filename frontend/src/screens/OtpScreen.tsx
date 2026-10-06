// Screen 2 — OTP verification. Stitch design: shift authentication badge,
// large 6-digit input, resend timer, industrial verify button. Dev code 123456.
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ErrorBanner, PrimaryButton, Screen, SecondaryButton, theme } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";

export function OtpScreen() {
  const { pickerId, expiresIn, masked } = useLocalSearchParams<{ pickerId: string; expiresIn?: string; masked?: string }>();
  const { verifyOtp, requestOtp, loading, error } = useAuth();
  const [otp, setOtp] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [otpMeta, setOtpMeta] = useState<{ expiresIn: string; masked: string } | null>(null);
  const showExpires = otpMeta?.expiresIn ?? expiresIn ?? null;
  const showMasked = otpMeta?.masked ?? masked ?? null;

  async function onVerify() {
    if (otp.trim().length !== 6) {
      setLocalError("Enter the 6-digit code");
      return;
    }
    setLocalError(null);
    setInfo(null);
    const ok = await verifyOtp(String(pickerId ?? ""), otp.trim());
    if (ok) router.replace("/dashboard" as never);
  }

  async function onResend() {
    const r = await requestOtp(String(pickerId ?? ""));
    if (r) {
      setOtpMeta({ expiresIn: String(r.expiresIn), masked: r.masked });
      setInfo(`New code sent to ${r.masked}`);
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
            <Text style={os.expText}>{showExpires}s</Text>
          </View>
        ) : null}
      </View>

      <Text style={os.headline}>Enter Verification Code</Text>
      <Text style={os.maskedText}>
        {showMasked
          ? `Security code sent to handheld terminal ${showMasked}`
          : `Picker ${pickerId} — enter the code sent to your device`}
      </Text>

      {/* OTP digit input — large monospace for warehouse gloves */}
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
      />

      {/* Resend timer */}
      <View style={os.resendRow}>
        <Text style={os.resendText}>
          {showExpires ? `Resend code in ${showExpires}s` : "Didn't receive the code?"}
        </Text>
      </View>

      <ErrorBanner message={localError ? null : error} />
      {info ? (
        <View style={os.infoBanner}>
          <Text style={os.infoText}>✓ {info}</Text>
        </View>
      ) : null}

      <PrimaryButton label={loading ? "Verifying…" : "VERIFY & START SHIFT"} onPress={onVerify} disabled={loading} />
      <SecondaryButton label="Resend OTP" onPress={onResend} />

      {/* Session footer */}
      <View style={os.sessionFooter}>
        <Text style={os.sessionText}>Session valid for 8 hours on this device</Text>
      </View>
    </Screen>
  );
}

const os = StyleSheet.create({
  authRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.space.lg,
  },
  authBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    backgroundColor: theme.color.surfaceContainerLow,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radius.pill,
  },
  authDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.primaryContainer,
  },
  authLabel: {
    ...(theme.type.labelMd as object),
    color: theme.color.primaryContainer,
  },
  expBadge: {
    backgroundColor: theme.color.surfaceContainerHigh,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radius.pill,
  },
  expText: {
    ...(theme.type.codeMd as object),
    color: theme.color.primary,
  },
  headline: {
    ...(theme.type.display as object),
    color: theme.color.ink,
    marginBottom: theme.space.xxs,
  },
  maskedText: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    marginBottom: theme.space.lg,
  },
  otpInput: {
    backgroundColor: theme.color.surface,
    borderWidth: 2,
    borderColor: theme.color.primaryContainer,
    borderRadius: theme.radius.lg,
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: 12,
    padding: theme.space.md,
    color: theme.color.ink,
    minHeight: 72,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: theme.space.sm,
  },
  resendText: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
  infoBanner: {
    backgroundColor: theme.color.okBg,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    borderLeftWidth: 4,
    borderLeftColor: theme.color.okInk,
  },
  infoText: { ...(theme.type.bodyMd as object), color: theme.color.okInk, fontWeight: "600" },
  sessionFooter: {
    alignItems: "center",
    marginTop: theme.space.lg,
  },
  sessionText: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
});

// YBM warehouse design system — shared tokens + primitives.
// Every screen consumes these; no per-screen color/type reinvention.
// Status is never color alone: badges always pair tone with a text label
// (and a glyph where space allows).
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import type { TextInputProps } from "react-native";

import { theme as rawTheme } from "../theme";
export const theme = rawTheme;

export type Tone = "ok" | "bad" | "info" | "warn";

const toneBg = (tone: Tone): string =>
  tone === "ok"
    ? theme.color.okBg
    : tone === "bad"
      ? theme.color.badBg
      : tone === "warn"
        ? theme.color.warnBg
        : theme.color.infoBg;

const toneInk = (tone: Tone): string =>
  tone === "ok"
    ? theme.color.okInk
    : tone === "bad"
      ? theme.color.badInk
      : tone === "warn"
        ? theme.color.warnInk
        : theme.color.infoInk;

/** Single source for order-status tones (was mapped inline per screen). */
export function toneForOrderStatus(status: string): Tone {
  if (status === "COMPLETED") return "ok";
  if (status === "ASSIGNED" || status === "IN_PROGRESS") return "warn";
  if (status === "CANCELLED") return "info";
  return "info";
}

/** Single source for line-status tones. */
export function toneForLineStatus(status: string): Tone {
  if (status === "PICKED") return "ok";
  if (status === "EXCEPTION") return "bad";
  if (status === "SKIPPED") return "warn";
  return "info";
}

// ── Layout ─────────────────────────────────────────────────────────────
// Screen: safe area + scroll + keyboard-aware container. Every screen wraps
// in this so small portrait phones and open keyboards never clip content.
export function Screen({ children, center, backgroundColor }: { children: ReactNode; center?: boolean; backgroundColor?: string }) {
  return (
    <SafeAreaView style={[s.screen, backgroundColor ? { backgroundColor } : null]}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[s.body, center === true && s.center]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AppHeader({ title, sub, showBack }: { title: string; sub?: string; showBack?: boolean }) {
  return (
    <View style={s.header} accessibilityRole="header">
      {showBack && (
        <Pressable onPress={() => router.back()} style={{ marginBottom: theme.space.xs }}>
          <Text style={{ ...(theme.type.bodyMd as object), color: theme.color.primary }}>← Back</Text>
        </Pressable>
      )}
      <Text style={s.headerTitle}>{title}</Text>
      {sub ? <Text style={s.headerSub}>{sub}</Text> : null}
    </View>
  );
}

// Exception-flow header: visually distinct band so report/evidence work is
// unmistakable vs the happy-path pick flow.
export function AlertHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={s.alertHeader} accessibilityRole="header">
      <Text style={s.alertTitle}>⚠ {title}</Text>
      {sub ? <Text style={s.alertSub}>{sub}</Text> : null}
    </View>
  );
}

export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      {hint ? <Text style={s.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={s.divider} />;
}

// ── Buttons (min 56px targets, pressed + disabled states) ──────────────
export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.primary, disabled === true && s.disabled, pressed && !disabled ? s.pressed : null]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.secondary, disabled === true && s.disabled, pressed && !disabled ? s.pressedGhost : null]}
    >
      <Text style={[s.secondaryText, disabled === true && s.secondaryTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

// ── Inputs ─────────────────────────────────────────────────────────────
export function FieldInput({
  label,
  error,
  style,
  secureTextEntry,
  ...rest
}: { label?: string; error?: string | null } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = secureTextEntry === true;

  return (
    <View style={s.field}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <View style={isPassword ? s.passwordInputWrap : null}>
        <TextInput
          {...rest}
          secureTextEntry={isPassword ? !passwordVisible : secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={theme.color.faint}
          style={[s.input, isPassword && s.passwordInput, focused && s.inputFocused, error ? s.inputError : null, style]}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
            onPress={() => setPasswordVisible((visible) => !visible)}
            hitSlop={10}
            style={s.passwordEye}
          >
            <Text style={s.passwordEyeText}>{passwordVisible ? "?" : "??"}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}
export function ScanTarget({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.scan}>
      <Text style={s.scanLabel}>◉ {label}</Text>
      <Text style={s.scanValue}>{value}</Text>
    </View>
  );
}

// Manual entry + submit as one unit so both scan screens stay identical.
export function ScanInput({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder: string;
}) {
  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={theme.color.faint}
        style={s.scanEntry}
        editable={!busy}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <PrimaryButton label={busy ? "Checking…" : "Submit scan"} onPress={onSubmit} disabled={busy} />
    </View>
  );
}

// ── Status ─────────────────────────────────────────────────────────────
const GLYPH: Record<Tone, string> = { ok: "✓ ", bad: "✕ ", info: "• ", warn: "! " };

export function StatusBadge({ text, tone }: { text: string; tone: Tone }) {
  return (
    <View style={[s.badge, { backgroundColor: toneBg(tone) }]}>
      <Text style={[s.badgeText, { color: toneInk(tone) }]}>
        {GLYPH[tone]}
        {text}
      </Text>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.error} accessibilityRole="alert">
      <Text style={s.errorText}>✕ {message}</Text>
    </View>
  );
}

export function SuccessFeedback({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.success}>
      <Text style={s.successText}>✓ {message}</Text>
    </View>
  );
}

export function ProgressIndicator({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <View style={s.progressWrap}>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={s.progressText}>
        {done} of {total} lines • {pct}%
      </Text>
    </View>
  );
}

export function SLAIndicator({ slaDueAt }: { slaDueAt: string }) {
  const mins = Math.max(0, Math.round((+new Date(slaDueAt) - Date.now()) / 60000));
  const urgent = mins < 30;
  const soon = !urgent && mins < 60;
  return (
    <View style={[s.sla, urgent ? s.slaUrgent : soon ? s.slaSoon : s.slaCalm]}>
      <Text style={[s.slaText, urgent ? s.slaTextUrgent : soon ? s.slaTextSoon : s.slaTextCalm]}>
        {urgent ? `⚠ SLA ${mins}m left — URGENT` : `◷ SLA ${mins}m left`}
      </Text>
    </View>
  );
}

export function WmsStatusBadge({ status }: { status: string }) {
  const tone: Tone = status === "SYNCED" ? "ok" : status === "PENDING" ? "warn" : status === "FAILED" ? "bad" : "info";
  return <StatusBadge text={`WMS ${status}`} tone={tone} />;
}

// ── Selection chips (exception types, reasons, dev toggles) ────────────
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [s.chip, selected && s.chipOn, pressed && s.chipPressed]}
    >
      <Text style={[s.chipText, selected && s.chipTextOn]}>
        {selected ? "◉ " : "○ "}
        {label}
      </Text>
    </Pressable>
  );
}

// ── Cards & data ───────────────────────────────────────────────────────
export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function MetricCard({
  value,
  label,
  tone,
  onPress,
}: {
  value: string;
  label: string;
  tone?: Tone;
  onPress?: () => void;
}) {
  const inner = (
    <View style={[s.metric, tone !== undefined && { borderLeftColor: toneInk(tone), borderLeftWidth: 4 }]}>
      <Text style={[s.metricValue, tone !== undefined && { color: toneInk(tone) }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => (pressed ? s.pressed : null)}>
      {inner}
    </Pressable>
  );
}

// ── Async states (never a blank screen) ────────────────────────────────
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={s.stateBox}>
      <View style={s.skeleton} />
      <View style={[s.skeleton, s.skeletonShort]} />
      <Text style={s.stateText}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.stateBox}>
      <Text style={s.emptyGlyph}>○</Text>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.stateText}>{body}</Text> : null}
      {actionLabel && onAction ? <SecondaryButton label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "Retry",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={s.stateBox}>
      <ErrorBanner message={message} />
      {onRetry ? <PrimaryButton label={retryLabel} onPress={onRetry} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: theme.color.bg },
  body: { flexGrow: 1, padding: theme.space.sm, paddingBottom: theme.space.lg },
  center: { justifyContent: "center" },
  // ── Headers ──
  header: { paddingVertical: theme.space.xs, marginBottom: theme.space.xxs },
  headerTitle: { ...(theme.type.display as object), color: theme.color.ink },
  headerSub: { ...(theme.type.secondary as object), color: theme.color.secondary, marginTop: 2, letterSpacing: 0.4 },
  alertHeader: {
    backgroundColor: theme.color.warnBg,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    borderLeftWidth: 4,
    borderLeftColor: theme.color.warnInk,
  },
  alertTitle: { ...(theme.type.title as object), color: theme.color.warnInk },
  alertSub: { ...(theme.type.secondary as object), color: theme.color.warnInk, marginTop: 2 },
  sectionHead: { marginTop: theme.space.md, marginBottom: theme.space.xxs },
  sectionTitle: { ...(theme.type.labelLg as object), color: theme.color.ink, textTransform: "uppercase" },
  sectionHint: { ...(theme.type.secondary as object), color: theme.color.secondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.color.line, marginVertical: theme.space.sm },
  // ── Buttons (Stitch touch-target-primary 56px) ──
  primary: {
    backgroundColor: theme.color.primaryContainer,
    minHeight: theme.touch.primary,
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    alignItems: "center",
    marginTop: theme.space.sm,
    flexDirection: "row",
    gap: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  pressed: { opacity: 0.88 },
  pressedGhost: { backgroundColor: theme.color.surfaceContainerLow },
  disabled: { opacity: 0.45 },
  primaryText: { ...(theme.type.button as object), color: theme.color.onPrimary, textTransform: "uppercase" },
  secondary: {
    borderWidth: 2,
    borderColor: theme.color.primary,
    backgroundColor: theme.color.surface,
    minHeight: theme.touch.min,
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    alignItems: "center",
    marginTop: theme.space.xs,
    flexDirection: "row",
    gap: theme.space.xs,
  },
  secondaryText: { ...(theme.type.button as object), color: theme.color.primary, textTransform: "uppercase" },
  secondaryTextDisabled: { color: theme.color.faint },
  // ── Inputs (Stitch rounded-xl, surfaceContainerLow bg) ──
  field: { marginTop: theme.space.sm },
  fieldLabel: { ...(theme.type.labelLg as object), color: theme.color.ink, marginBottom: 6, textTransform: "uppercase" },
  input: {
    borderWidth: 1.5,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    ...(theme.type.codeMd as object),
    padding: theme.space.sm,
    paddingHorizontal: theme.space.md,
    color: theme.color.ink,
    minHeight: theme.touch.primary,
  },
  inputFocused: { borderColor: theme.color.primaryContainer, backgroundColor: theme.color.surface },
  passwordInputWrap: { position: "relative" },
  passwordInput: { paddingRight: 52 },
  passwordEye: { position: "absolute", right: 12, top: 0, bottom: 0, width: 40, alignItems: "center", justifyContent: "center" },
  passwordEyeText: { fontSize: 20, color: theme.color.secondary },
  inputError: { borderColor: theme.color.critical },
  fieldError: { color: theme.color.badInk, ...(theme.type.labelMd as object), marginTop: 6 },
  // ── Scan targets (industrial blue bordered cards) ──
  scan: {
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginVertical: theme.space.xs,
    borderWidth: 2,
    borderColor: theme.color.primaryContainer,
  },
  scanLabel: { ...(theme.type.labelMd as object), color: theme.color.primaryContainer, textTransform: "uppercase" },
  scanValue: { ...(theme.type.codeLg as object), marginTop: 6, color: theme.color.ink },
  scanEntry: {
    borderWidth: 2,
    borderColor: theme.color.primaryContainer,
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    ...(theme.type.codeLg as object),
    padding: theme.space.sm,
    marginTop: theme.space.sm,
    textAlign: "center",
    color: theme.color.ink,
    minHeight: theme.touch.primary,
  },
  // ── Badges ──
  badge: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xxs,
    marginTop: 6,
  },
  badgeText: { ...(theme.type.badge as object) },
  // ── Feedback banners ──
  error: {
    backgroundColor: theme.color.badBg,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    borderLeftWidth: 4,
    borderLeftColor: theme.color.badInk,
  },
  errorText: { color: theme.color.badInk, ...(theme.type.bodyMd as object), fontWeight: "600" },
  success: {
    backgroundColor: theme.color.okBg,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    borderLeftWidth: 4,
    borderLeftColor: theme.color.okInk,
  },
  successText: { color: theme.color.okInk, ...(theme.type.bodyMd as object), fontWeight: "700" },
  // ── Progress ──
  progressWrap: { marginTop: theme.space.xs },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: theme.color.surfaceContainerHigh, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: theme.color.primaryContainer },
  progressText: { ...(theme.type.labelLg as object), marginTop: 6, color: theme.color.ink },
  // ── SLA ──
  sla: {
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.sm,
    marginTop: theme.space.xs,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slaCalm: { backgroundColor: theme.color.infoBg },
  slaSoon: { backgroundColor: theme.color.warnBg },
  slaUrgent: { backgroundColor: theme.color.badBg, borderWidth: 2, borderColor: theme.color.critical },
  slaText: { ...(theme.type.labelLg as object) },
  slaTextCalm: { color: theme.color.infoInk },
  slaTextSoon: { color: theme.color.warnInk },
  slaTextUrgent: { color: theme.color.badInk },
  // ── Chips (zone-selector style from Stitch) ──
  chip: {
    borderWidth: 1.5,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surfaceContainerHigh,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    minHeight: theme.touch.min,
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
  },
  chipOn: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  chipPressed: { opacity: 0.88 },
  chipText: { ...(theme.type.labelLg as object), color: theme.color.ink },
  chipTextOn: { color: theme.color.onPrimary },
  // ── Cards (elevated Stitch style) ──
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginTop: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // ── Metric cards ──
  metric: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  metricValue: { ...(theme.type.title as object), color: theme.color.ink },
  metricLabel: { ...(theme.type.labelMd as object), color: theme.color.muted, marginTop: 2, textTransform: "uppercase" },
  // ── Async states ──
  stateBox: { paddingVertical: theme.space.lg, alignItems: "stretch" },
  stateText: { ...(theme.type.secondary as object), color: theme.color.muted, marginTop: theme.space.xs, textAlign: "center" },
  emptyGlyph: { fontSize: 48, textAlign: "center", color: theme.color.primaryFixedDim },
  emptyTitle: { ...(theme.type.section as object), textAlign: "center", marginTop: theme.space.xs, color: theme.color.ink },
  skeleton: { height: 14, borderRadius: 7, backgroundColor: theme.color.surfaceContainerHigh, marginTop: theme.space.xs },
  skeletonShort: { width: "55%" },
});


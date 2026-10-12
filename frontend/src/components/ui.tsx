// YBM warehouse design system — shared tokens + primitives.
// High-visibility, tactile, ergonomic UI components for industrial operations.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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

const toneBorder = (tone: Tone): string =>
  tone === "ok"
    ? theme.color.okBorder
    : tone === "bad"
      ? theme.color.badBorder
      : tone === "warn"
        ? theme.color.warnBorder
        : theme.color.infoBorder;

const toneInk = (tone: Tone): string =>
  tone === "ok"
    ? theme.color.okInk
    : tone === "bad"
      ? theme.color.badInk
      : tone === "warn"
        ? theme.color.warnInk
        : theme.color.infoInk;

/** Single source for order-status tones. */
export function toneForOrderStatus(status: string): Tone {
  if (status === "COMPLETED" || status === "PACKED") return "ok";
  if (status === "ASSIGNED" || status === "IN_PROGRESS" || status === "PICKING" || status === "PACKING") return "warn";
  if (status === "READY_FOR_PACKING" || status === "RIDER_ASSIGNED") return "info";
  if (status === "CANCELLED") return "bad";
  return "info";
}

/** Single source for line-status tones. */
export function toneForLineStatus(status: string): Tone {
  if (status === "PICKED") return "ok";
  if (status === "EXCEPTION") return "bad";
  if (status === "SKIPPED") return "warn";
  if (status === "LOCATION_VALIDATED" || status === "SKU_VALIDATED") return "info";
  return "info";
}

// ── Layout ─────────────────────────────────────────────────────────────
export function Screen({
  children,
  center,
  backgroundColor,
}: {
  children: ReactNode;
  center?: boolean;
  backgroundColor?: string;
}) {
  return (
    <SafeAreaView style={[s.screen, backgroundColor ? { backgroundColor } : null]}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[s.body, center === true && s.center]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AppHeader({
  title,
  sub,
  showBack,
}: {
  title: string;
  sub?: string;
  showBack?: boolean;
}) {
  return (
    <View style={s.header} accessibilityRole="header">
      {showBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [s.backButton, pressed ? s.pressedGhost : null]}
        >
          <Ionicons name="arrow-back" size={18} color={theme.color.primary} />
          <Text style={s.backText}>Back</Text>
        </Pressable>
      )}
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      {sub ? <Text style={s.headerSub}>{sub}</Text> : null}
    </View>
  );
}

export function AlertHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={s.alertHeader} accessibilityRole="header">
      <View style={s.alertRow}>
        <Ionicons name="warning" size={24} color={theme.color.warnInk} />
        <Text style={s.alertTitle}>{title}</Text>
      </View>
      {sub ? <Text style={s.alertSub}>{sub}</Text> : null}
    </View>
  );
}

export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      {hint ? (
        <View style={s.hintPill}>
          <Text style={s.sectionHint}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Divider() {
  return <View style={s.divider} />;
}

// ── Buttons (min 54px targets, tactile press feedback) ─────────────────
export function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "success" | "danger" | "amber";
}) {
  const bg =
    variant === "success"
      ? theme.color.okPrimary
      : variant === "danger"
        ? theme.color.badPrimary
        : variant === "amber"
          ? theme.packer.primary
          : theme.color.primaryContainer;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.primary,
        { backgroundColor: bg },
        disabled === true && s.disabled,
        pressed && !disabled ? s.pressed : null,
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color="#ffffff" /> : null}
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.secondary,
        disabled === true && s.disabled,
        pressed && !disabled ? s.pressedGhost : null,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={theme.color.ink} /> : null}
      <Text style={[s.secondaryText, disabled === true && s.secondaryTextDisabled]}>
        {label}
      </Text>
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
          style={[
            s.input,
            isPassword && s.passwordInput,
            focused && s.inputFocused,
            error ? s.inputError : null,
            style,
          ]}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
            onPress={() => setPasswordVisible((v) => !v)}
            hitSlop={12}
            style={s.passwordEye}
          >
            <Ionicons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={theme.color.muted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={s.fieldErrorRow}>
          <Ionicons name="alert-circle" size={16} color={theme.color.badInk} />
          <Text style={s.fieldError}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ScanTarget({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.scan}>
      <View style={s.scanHeader}>
        <Ionicons name="scan-outline" size={18} color={theme.color.primaryContainer} />
        <Text style={s.scanLabel}>{label}</Text>
      </View>
      <Text selectable style={s.scanValue}>{value}</Text>
    </View>
  );
}

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
    <View style={{ marginTop: theme.space.xs }}>
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
      <PrimaryButton
        label={busy ? "Verifying…" : "Submit Scan"}
        onPress={onSubmit}
        disabled={busy}
        icon="barcode-outline"
      />
    </View>
  );
}

// ── Status Badges ──────────────────────────────────────────────────────
const GLYPH_ICON: Record<Tone, keyof typeof Ionicons.glyphMap> = {
  ok: "checkmark-circle",
  bad: "close-circle",
  info: "information-circle",
  warn: "time",
};

export function StatusBadge({ text, tone }: { text: string; tone: Tone }) {
  const icon = GLYPH_ICON[tone];
  const ink = toneInk(tone);
  return (
    <View style={[s.badge, { backgroundColor: toneBg(tone), borderColor: toneBorder(tone) }]}>
      <Ionicons name={icon} size={14} color={ink} style={{ marginRight: 4 }} />
      <Text style={[s.badgeText, { color: ink }]}>{text}</Text>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.error} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={20} color={theme.color.badInk} />
      <Text style={s.errorText}>{message}</Text>
    </View>
  );
}

export function SuccessFeedback({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.success}>
      <Ionicons name="checkmark-circle" size={20} color={theme.color.okInk} />
      <Text style={s.successText}>{message}</Text>
    </View>
  );
}

export function ProgressIndicator({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <View style={s.progressWrap}>
      <View style={s.progressHeader}>
        <Text style={s.progressLabel}>Overall Progress</Text>
        <Text style={s.progressPercentage}>{pct}%</Text>
      </View>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={s.progressText}>
        {done} of {total} lines resolved
      </Text>
    </View>
  );
}

/** 3-Step Breadcrumb Stepper for the sequential Picker flow */
export function PickStepStepper({
  currentStep,
}: {
  currentStep: "location" | "sku" | "quantity";
}) {
  const steps = [
    { key: "location", label: "Location", icon: "location-sharp" as const },
    { key: "sku", label: "SKU Scan", icon: "barcode-sharp" as const },
    { key: "quantity", label: "Quantity", icon: "cube-sharp" as const },
  ];

  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <View style={s.stepperWrap}>
      {steps.map((st, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <View key={st.key} style={s.stepperItemWrap}>
            <View
              style={[
                s.stepCircle,
                isDone && s.stepCircleDone,
                isActive && s.stepCircleActive,
              ]}
            >
              {isDone ? (
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              ) : (
                <Ionicons
                  name={st.icon}
                  size={14}
                  color={isActive ? "#ffffff" : theme.color.muted}
                />
              )}
            </View>
            <Text
              style={[
                s.stepLabel,
                isActive && s.stepLabelActive,
                isDone && s.stepLabelDone,
              ]}
            >
              {st.label}
            </Text>
            {i < steps.length - 1 && (
              <View style={[s.stepLine, isDone && s.stepLineDone]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

export function SLAIndicator({ slaDueAt }: { slaDueAt: string }) {
  const mins = Math.max(0, Math.round((+new Date(slaDueAt) - Date.now()) / 60000));
  const urgent = mins < 30;
  const soon = !urgent && mins < 60;
  return (
    <View style={[s.sla, urgent ? s.slaUrgent : soon ? s.slaSoon : s.slaCalm]}>
      <Ionicons
        name={urgent ? "warning" : "time-outline"}
        size={15}
        color={urgent ? theme.color.badInk : soon ? theme.color.warnInk : theme.color.infoInk}
      />
      <Text style={[s.slaText, urgent ? s.slaTextUrgent : soon ? s.slaTextSoon : s.slaTextCalm]}>
        {urgent ? `SLA: ${mins}m left — URGENT` : `SLA: ${mins}m left`}
      </Text>
    </View>
  );
}

export function WmsStatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "SYNCED" ? "ok" : status === "PENDING" ? "warn" : status === "FAILED" ? "bad" : "info";
  return <StatusBadge text={`WMS: ${status}`} tone={tone} />;
}

// ── Selection Chips ────────────────────────────────────────────────────
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
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={18}
        color={selected ? "#ffffff" : theme.color.muted}
      />
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

// ── Cards & Data ───────────────────────────────────────────────────────
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
  const accentColor = tone ? toneInk(tone) : theme.color.primaryContainer;
  const inner = (
    <View style={[s.metric, tone !== undefined && { borderTopColor: accentColor, borderTopWidth: 4 }]}>
      <Text style={[s.metricValue, tone !== undefined && { color: accentColor }]}>{value}</Text>
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

// ── Async States ───────────────────────────────────────────────────────
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={s.stateBox}>
      <ActivityIndicator size="large" color={theme.color.primary} />
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
      <View style={s.emptyIconWrap}>
        <Ionicons name="folder-open-outline" size={40} color={theme.color.faint} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.stateText}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: theme.space.md, alignSelf: "center", minWidth: 160 }}>
          <SecondaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
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
      {onRetry ? (
        <View style={{ marginTop: theme.space.sm, alignSelf: "center", minWidth: 160 }}>
          <PrimaryButton label={retryLabel} onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: theme.color.bg },
  body: {
    flexGrow: 1,
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.xl,
  },
  center: { justifyContent: "center" },

  // Headers
  header: { paddingVertical: theme.space.xs, marginBottom: theme.space.xs },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
    marginBottom: theme.space.xs,
    borderRadius: theme.radius.sm,
  },
  backText: {
    ...(theme.type.bodyMd as object),
    fontWeight: "700",
    color: theme.color.primary,
  },
  headerTitle: { ...(theme.type.display as object), color: theme.color.ink },
  headerSub: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  alertHeader: {
    backgroundColor: theme.color.warnBg,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    borderLeftWidth: 4,
    borderLeftColor: theme.color.warnInk,
    borderWidth: 1,
    borderColor: theme.color.warnBorder,
  },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertTitle: { ...(theme.type.title as object), color: theme.color.warnInk },
  alertSub: { ...(theme.type.secondary as object), color: theme.color.warnInk, marginTop: 4 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.space.lg,
    marginBottom: theme.space.xs,
  },
  sectionTitle: {
    ...(theme.type.section as object),
    color: theme.color.ink,
    letterSpacing: 0.2,
  },
  hintPill: {
    backgroundColor: theme.color.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  sectionHint: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.line,
    marginVertical: theme.space.sm,
  },

  // Buttons
  primary: {
    minHeight: theme.touch.primary,
    justifyContent: "center",
    borderRadius: theme.radius.md,
    alignItems: "center",
    marginTop: theme.space.sm,
    flexDirection: "row",
    gap: theme.space.xs,
    paddingHorizontal: theme.space.md,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  pressedGhost: { backgroundColor: theme.color.surfaceContainer },
  disabled: { opacity: 0.45 },
  primaryText: {
    ...(theme.type.button as object),
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: theme.color.lineStrong,
    backgroundColor: theme.color.surface,
    minHeight: theme.touch.min,
    justifyContent: "center",
    borderRadius: theme.radius.md,
    alignItems: "center",
    marginTop: theme.space.xs,
    flexDirection: "row",
    gap: theme.space.xs,
    paddingHorizontal: theme.space.md,
  },
  secondaryText: {
    ...(theme.type.button as object),
    color: theme.color.inkSecondary,
    letterSpacing: 0.4,
  },
  secondaryTextDisabled: { color: theme.color.faint },

  // Inputs
  field: { marginTop: theme.space.sm },
  fieldLabel: {
    ...(theme.type.labelMd as object),
    color: theme.color.inkSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    ...(theme.type.bodyMd as object),
    padding: theme.space.sm,
    paddingHorizontal: theme.space.md,
    color: theme.color.ink,
    minHeight: theme.touch.primary,
  },
  inputFocused: {
    borderColor: theme.color.primary,
    backgroundColor: "#ffffff",
  },
  passwordInputWrap: { position: "relative" },
  passwordInput: { paddingRight: 48 },
  passwordEye: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  inputError: { borderColor: theme.color.critical },
  fieldErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  fieldError: {
    color: theme.color.badInk,
    ...(theme.type.labelSm as object),
  },

  // Scan targets
  scan: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginVertical: theme.space.xs,
    borderWidth: 1.5,
    borderColor: theme.color.primaryContainer,
    shadowColor: theme.color.primaryContainer,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  scanHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  scanLabel: {
    ...(theme.type.labelMd as object),
    color: theme.color.primaryContainer,
    textTransform: "uppercase",
  },
  scanValue: {
    ...(theme.type.codeLg as object),
    marginTop: 8,
    color: theme.color.ink,
  },
  scanEntry: {
    borderWidth: 2,
    borderColor: theme.color.primaryContainer,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    ...(theme.type.codeLg as object),
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    textAlign: "center",
    color: theme.color.ink,
    minHeight: theme.touch.primary,
  },

  // Badges
  badge: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  badgeText: {
    ...(theme.type.badge as object),
    flexShrink: 1,
  },

  // Feedback banners
  error: {
    backgroundColor: theme.color.badBg,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    borderWidth: 1,
    borderColor: theme.color.badBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    color: theme.color.badInk,
    ...(theme.type.bodyMd as object),
    fontWeight: "600",
    flex: 1,
  },
  success: {
    backgroundColor: theme.color.okBg,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successText: {
    color: theme.color.okInk,
    ...(theme.type.bodyMd as object),
    fontWeight: "600",
    flex: 1,
  },

  // Progress
  progressWrap: { marginTop: 2, marginBottom: 2 },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  progressLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
    textTransform: "uppercase",
  },
  progressPercentage: {
    ...(theme.type.labelMd as object),
    color: theme.color.ink,
    fontWeight: "700",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.surfaceContainerHigh,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.primaryContainer,
  },
  progressText: {
    ...(theme.type.secondary as object),
    marginTop: 4,
    color: theme.color.muted,
  },

  // Stepper
  stepperWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.color.surface,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    marginVertical: 3,
  },
  stepperItemWrap: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.color.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: theme.color.lineStrong,
  },
  stepCircleActive: {
    backgroundColor: theme.color.primaryContainer,
    borderColor: theme.color.primary,
  },
  stepCircleDone: {
    backgroundColor: theme.color.okPrimary,
    borderColor: theme.color.okPrimary,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.color.muted,
  },
  stepLabelActive: {
    color: theme.color.primaryContainer,
    fontWeight: "700",
  },
  stepLabelDone: {
    color: theme.color.okInk,
  },
  stepLine: {
    position: "absolute",
    top: 14,
    right: -25,
    width: 50,
    height: 2,
    backgroundColor: theme.color.line,
    zIndex: -1,
  },
  stepLineDone: {
    backgroundColor: theme.color.okPrimary,
  },

  // SLA
  sla: {
    borderRadius: theme.radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: theme.space.xs,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  slaCalm: {
    backgroundColor: theme.color.infoBg,
    borderColor: theme.color.infoBorder,
  },
  slaSoon: {
    backgroundColor: theme.color.warnBg,
    borderColor: theme.color.warnBorder,
  },
  slaUrgent: {
    backgroundColor: theme.color.badBg,
    borderColor: theme.color.badBorder,
  },
  slaText: { ...(theme.type.labelMd as object) },
  slaTextCalm: { color: theme.color.infoInk },
  slaTextSoon: { color: theme.color.warnInk },
  slaTextUrgent: { color: theme.color.badInk, fontWeight: "700" },

  // Chips
  chip: {
    borderWidth: 1.5,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: theme.space.xs,
    minHeight: theme.touch.min,
    justifyContent: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
  },
  chipOn: {
    backgroundColor: theme.color.primaryContainer,
    borderColor: theme.color.primaryContainer,
  },
  chipPressed: { opacity: 0.88 },
  chipText: { ...(theme.type.bodyMd as object), color: theme.color.ink, fontWeight: "600" },
  chipTextOn: { color: "#ffffff", fontWeight: "700" },

  // Cards
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginTop: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // Metric cards
  metric: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    minHeight: 104,
    justifyContent: "center",
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  metricValue: {
    ...(theme.type.display as object),
    color: theme.color.ink,
  },
  metricLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
    marginTop: 4,
    textTransform: "uppercase",
  },

  // Async states
  stateBox: {
    paddingVertical: theme.space.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: theme.color.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.space.xs,
  },
  stateText: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    marginTop: 6,
    textAlign: "center",
    maxWidth: 280,
  },
  emptyTitle: {
    ...(theme.type.section as object),
    textAlign: "center",
    marginTop: theme.space.xs,
    color: theme.color.ink,
  },
});

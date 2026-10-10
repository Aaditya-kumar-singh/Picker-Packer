// Screen 6 — Location Scan.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  LoadingState,
  PickStepStepper,
  PrimaryButton,
  ProgressIndicator,
  Screen,
  SuccessFeedback,
  theme,
} from "@/components/ui";
import { nextPendingLine, resolvePickStep } from "@/domain/order";
import { pickerRepository } from "@/repositories/pickerRepository";
import { beepError, beepSuccess } from "@/services/scanner";
import { OfflineBanner } from "@/components/SyncBadge";
import type { Order } from "@/types";

export function LocationScanScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const r = await pickerRepository.getOrder(String(orderId));
    if (generation === loadGeneration.current && r.ok) setOrder(r.data);
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  const line = order ? nextPendingLine(order) : null;
  const step = order ? resolvePickStep(order) : null;
  useEffect(() => {
    if (order && step !== null && step !== "location") {
      router.replace(`/pick/${order.id}/${step}` as never);
    }
  }, [order, step]);

  async function copyBarcode(code: string) {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function next() {
    if (!line || !order || busy) return;
    const v = line.locationBarcode.trim();
    if (!v) {
      setError("Default location barcode is unavailable");
      return;
    }
    loadGeneration.current += 1;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const r = await pickerRepository.validateLocation(line.id, v);
      if (!r.ok) {
        beepError();
        setError(`${r.apiError.error}: ${r.apiError.message}`);
        return;
      }
      beepSuccess();
      setOk(`Location ${r.data.locationCode} confirmed`);

      const nextOrder = {
        ...order,
        lines: order.lines.map((l) => (l.id === r.data.id ? r.data : l)),
      };
      setOrder(nextOrder);
      const nextStep = resolvePickStep(nextOrder);
      router.replace(`/pick/${order.id}/${nextStep}` as never);
    } finally {
      setBusy(false);
    }
  }

  if (!order || !line || step !== "location") {
    return (
      <Screen>
        <AppHeader title="Location Scan" sub={!order ? "Loading…" : "Resuming correct step…"} />
        <LoadingState label={!order ? "Loading order…" : "Resuming correct step…"} />
      </Screen>
    );
  }
  const done = order.lines.filter((l) => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;

  return (
    <Screen>
      <AppHeader
        title={order.externalId}
        sub={`Line ${line.lineNo} of ${order.lines.length} — Go to aisle/shelf`}
      />

      {/* Stepper navigation */}
      <PickStepStepper currentStep="location" />

      <ProgressIndicator done={done} total={order.lines.length} />

      <View style={ls.locationCard}>
        <View style={ls.locationBadgeRow}>
          <View style={ls.badge}>
            <Ionicons name="location-sharp" size={16} color={theme.colors.location.icon} />
            <Text style={ls.badgeText}>TARGET LOCATION</Text>
          </View>
          <Text style={ls.itemMeta}>{line.skuName}</Text>
        </View>

        <Text style={ls.locationCode}>{line.locationCode}</Text>

        <View style={ls.barcodeBox}>
          <View style={ls.barcodeHeader}>
            <Text style={ls.barcodeLabel}>LOCATION BARCODE</Text>
            <Pressable
              onPress={() => void copyBarcode(line.locationBarcode)}
              style={({ pressed }) => [ls.copyBtn, pressed ? { opacity: 0.7 } : null]}
              hitSlop={8}
            >
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={13}
                color={copied ? theme.color.okInk : theme.color.primary}
              />
              <Text style={[ls.copyText, copied && { color: theme.color.okInk }]}>
                {copied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
          </View>
          <Text selectable style={ls.barcodeValue}>{line.locationBarcode}</Text>
        </View>

        <PrimaryButton
          label={busy ? "Verifying Location…" : "Confirm & Proceed to SKU"}
          icon="arrow-forward"
          onPress={() => void next()}
          disabled={busy}
        />
      </View>

      <OfflineBanner />
      <ErrorBanner message={error} />
      <SuccessFeedback message={ok} />
    </Screen>
  );
}

const ls = StyleSheet.create({
  locationCard: {
    backgroundColor: theme.color.surface,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginTop: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  locationBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.location.bg,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.colors.location.text,
    letterSpacing: 0.5,
  },
  itemMeta: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    maxWidth: "50%",
  },
  locationCode: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.color.ink,
    letterSpacing: 0.5,
    marginVertical: 4,
  },
  barcodeBox: {
    marginTop: theme.space.sm,
    marginBottom: theme.space.sm,
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  barcodeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  barcodeLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: theme.color.muted,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: theme.color.surface,
  },
  copyText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.color.primary,
  },
  barcodeValue: {
    ...(theme.type.codeLg as object),
    fontSize: 20,
    color: theme.color.ink,
    marginTop: 6,
    letterSpacing: 1,
  },
});

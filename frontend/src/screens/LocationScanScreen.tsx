// Location Scan — step 1 of pick flow.
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
    if (order && step !== null) {
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

  if (!order || !line) {
    return (
      <Screen>
        <AppHeader title="Location Scan" sub={!order ? "Loading…" : "Resuming…"} />
        <LoadingState label={!order ? "Loading order…" : "Resuming correct step…"} />
      </Screen>
    );
  }
  const done = order.lines.filter((l) => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;

  return (
    <Screen>
      <AppHeader
        title={order.externalId}
        sub={`Line ${line.lineNo} of ${order.lines.length}`}
      />

      <PickStepStepper currentStep="location" />
      <ProgressIndicator done={done} total={order.lines.length} />

      {/* Location card */}
      <View style={ls.locationCard}>
        <View style={ls.badgeRow}>
          <View style={ls.badge}>
            <Ionicons name="location-sharp" size={14} color={theme.colors.location.icon} />
            <Text style={ls.badgeText}>TARGET LOCATION</Text>
          </View>
        </View>

        <Text style={ls.locationCode}>{line.locationCode}</Text>
        <Text style={ls.itemName} numberOfLines={1}>{line.skuName}</Text>

        {/* Barcode */}
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
                size={12}
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
          label={busy ? "Verifying…" : "Confirm & Proceed"}
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
    padding: 14,
    marginTop: 6,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.location.bg,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.colors.location.text,
    letterSpacing: 0.4,
  },
  locationCode: {
    fontSize: 28,
    fontWeight: "900",
    color: theme.color.ink,
    letterSpacing: 0.3,
    marginVertical: 2,
  },
  itemName: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginBottom: 8,
  },
  barcodeBox: {
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  barcodeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  barcodeLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: theme.color.muted,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: theme.color.surface,
  },
  copyText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.color.primary,
  },
  barcodeValue: {
    ...(theme.type.codeLg as object),
    fontSize: 18,
    color: theme.color.ink,
    marginTop: 4,
    letterSpacing: 1,
  },
});

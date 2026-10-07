// Screen 6 — Location Scan. Wrong scan stays in state + 422. Dev mock buttons.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  LoadingState,
  ProgressIndicator,
  ScanTarget,
  Screen,
  SLAIndicator,
  SuccessFeedback,
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
  // Authoritative routing: if the active line already progressed past
  // location (e.g. back-navigation after SKU validation), forward to the
  // correct step instead of letting a location submit fail LINE_NOT_READY.
  const step = order ? resolvePickStep(order) : null;
  useEffect(() => {
    if (order && step !== null && step !== "location") {
      router.replace(`/pick/${order.id}/${step}` as never);
    }
  }, [order, step]);

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

      // Continue from the post-scan line state and replace the current step.
      // Forward picker steps must never accumulate stale screens in the stack.
      const nextOrder = {
        ...order,
        lines: order.lines.map((l) => l.id === r.data.id ? r.data : l),
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
      <AppHeader title={order.externalId} sub={`Line ${line.lineNo} — go to location`} />
      <SLAIndicator slaDueAt={order.slaDueAt} />
      <ProgressIndicator done={done} total={order.lines.length} />
      <View style={ls.locationCard}>
        <Text style={ls.locationTitle}>Default Location</Text>
        <Text style={ls.locationCode}>{line.locationCode}</Text>
        <View style={ls.barcodeBox}>
          <Text style={ls.barcodeLabel}>LOCATION BARCODE</Text>
          <Text selectable style={ls.barcodeValue}>{line.locationBarcode}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next to SKU scan"
          onPress={() => void next()}
          disabled={busy}
          style={[ls.nextButton, busy && ls.disabled]}
        >
          <Text style={ls.nextText}>{busy ? "Checking…" : "Next"}</Text>
        </Pressable>
      </View>
      <OfflineBanner />
      <ErrorBanner message={error} />
      <SuccessFeedback message={ok} />
    </Screen>
  );
}
const ls = StyleSheet.create({
  locationCard: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#1351b4", borderRadius: 12, padding: 16, marginTop: 12 },
  locationTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, color: "#1351b4", textTransform: "uppercase" },
  locationCode: { fontSize: 24, fontWeight: "800", color: "#0d1c2e", marginTop: 4 },
  barcodeBox: { marginTop: 12, backgroundColor: "#f7f8fa", borderRadius: 10, padding: 12 },
  barcodeLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, color: "#16823b" },
  barcodeValue: { fontSize: 18, fontWeight: "700", letterSpacing: 0.3, color: "#0d1c2e", marginTop: 5 },
  nextButton: { minHeight: 52, marginTop: 14, borderRadius: 10, backgroundColor: "#1351b4", alignItems: "center", justifyContent: "center" },
  nextText: { color: "#fff", fontSize: 14, fontWeight: "800", textTransform: "uppercase" },
  successText: { color: "#087a27", fontSize: 11, fontWeight: "700", marginTop: 6 },
  errorText: { color: "#b42318", fontSize: 11, fontWeight: "700", marginTop: 6 },
  disabled: { opacity: 0.45 },
});

// Screen 6 — Location Scan. Wrong scan stays in state + 422. Dev mock buttons.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
import BarcodeDisplay from "@/components/BarcodeDisplay";
import type { Order } from "@/types";

export function LocationScanScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await pickerRepository.getOrder(String(orderId));
    if (r.ok) setOrder(r.data);
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

  async function scan(value: string) {
    if (!line || !order || busy) return;
    const v = value.trim();
    if (!v) {
      setError("Enter or scan a location barcode");
      return;
    }
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
      setOk(`Location ${r.data.locationCode} validated`);
      setManual("");
      router.push(`/pick/${order!.id}/sku` as never);
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
        <Text style={ls.locationTitle}>Pick Location</Text>
        <Text style={ls.locationCode}>{line.locationCode}</Text>
        <BarcodeDisplay
          label="EXPECTED LOCATION BARCODE"
          value={line.locationBarcode}
          scanTitle="Scan location barcode"
          inputValue={manual}
          onInputChange={setManual}
          onSubmit={() => void scan(manual)}
          inputPlaceholder="Type or scan location barcode"
          match={manual.trim() ? manual.trim().toUpperCase() === line.locationBarcode.trim().toUpperCase() : null}
          onScanned={(value) => {
            setManual(value);
            void scan(value);
          }}
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
  locationCard: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#1351b4", borderRadius: 12, padding: 16, marginTop: 12 },
  locationTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, color: "#1351b4", textTransform: "uppercase" },
  locationCode: { fontSize: 24, fontWeight: "800", color: "#0d1c2e", marginTop: 4 },
  locationLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, color: "#434653", marginTop: 12 },
  locationBarcode: { fontSize: 18, fontWeight: "700", letterSpacing: 0.4, color: "#0d1c2e", marginTop: 3 },
});

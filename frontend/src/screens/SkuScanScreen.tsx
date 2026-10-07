// Screen 7 — SKU Scan. Blocked until LOCATION_VALIDATED. Wrong SKU stays.
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
  SuccessFeedback,
} from "@/components/ui";
import { nextPendingLine, resolvePickStep } from "@/domain/order";
import { pickerRepository } from "@/repositories/pickerRepository";
import { beepError, beepSuccess } from "@/services/scanner";
import BarcodeDisplay from "@/components/BarcodeDisplay";
import type { Order } from "@/types";

export function SkuScanScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  // First line awaiting SKU = LOCATION_VALIDATED, else fall back to next pending.
  const line =
    order?.lines.find((l) => l.status === "LOCATION_VALIDATED") ??
    (order ? nextPendingLine(order) : null);
  // Authoritative routing: a SKU_VALIDATED line (back-navigation) belongs on
  // Quantity; a PENDING line belongs on Location. Never submit SKU for them.
  const step = order ? resolvePickStep(order) : null;
  useEffect(() => {
    if (order && step !== null && step !== "sku") {
      router.replace(`/pick/${order.id}/${step}` as never);
    }
  }, [order, step]);

  async function scan(value: string) {
    if (!line || !order || busy) return;
    const v = value.trim();
    if (!v) {
      setError("Enter or scan the item barcode");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await pickerRepository.validateSku(line.id, v);
      if (!r.ok) {
        beepError();
        setError(`${r.apiError.error}: ${r.apiError.message}`);
        return;
      }
      beepSuccess();
      setManual("");
      router.push(`/pick/${order.id}/quantity` as never);
    } finally {
      setBusy(false);
    }
  }

  if (!order || !line || step !== "sku") {
    return (
      <Screen>
        <AppHeader title="SKU Scan" sub={!order ? "Loading…" : "Resuming correct step…"} />
        <LoadingState label={!order ? "Loading order…" : "Resuming correct step…"} />
      </Screen>
    );
  }
  const done = order.lines.filter((l) => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;

  return (
    <Screen>
      <AppHeader title={order.externalId} sub={`Line ${line.lineNo} — scan item`} />
      <ProgressIndicator done={done} total={order.lines.length} />
      <View style={ss.productCard}>
        <Text style={ss.productName}>{line.skuName}</Text>
        <Text style={ss.productSpecs}>{line.productSpecs}</Text>
        <BarcodeDisplay
          label="EXPECTED PRODUCT BARCODE"
          value={line.skuBarcode}
          scanTitle="Scan product barcode"
          inputValue={manual}
          onInputChange={setManual}
          onSubmit={() => void scan(manual)}
          inputPlaceholder="Type or scan item barcode"
          match={manual.trim() ? manual.trim().toUpperCase() === line.skuBarcode.trim().toUpperCase() : null}
          onScanned={(value) => {
            setManual(value);
            void scan(value);
          }}
          disabled={busy}
        />
      </View>
      <ScanTarget label="EXPECTED SKU" value={line.skuCode} />
      <ErrorBanner message={error} />
      <SuccessFeedback message={line.status === "LOCATION_VALIDATED" ? "Location OK — now scan item" : null} />
    </Screen>
  );
}
const ss = StyleSheet.create({
  productCard: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#1351b4", borderRadius: 12, padding: 16, marginTop: 12 },
  productName: { fontSize: 20, fontWeight: "700", color: "#0d1c2e" },
  productSpecs: { fontSize: 14, color: "#434653", marginTop: 4 },
  barcodeRow: { marginTop: 12, backgroundColor: "#eff4ff", borderRadius: 8, padding: 12 },
  barcodeLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, color: "#1351b4" },
  barcodeValue: { fontSize: 20, fontWeight: "700", letterSpacing: 0.4, color: "#0d1c2e", marginTop: 3 },
});

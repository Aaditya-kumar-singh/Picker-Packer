// Compact picker item step: verify the SKU and count each physical item barcode scan as 1 EA.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  LoadingState,
  MetricCard,
  ScanTarget,
  Screen,
  SuccessFeedback,
} from "@/components/ui";
import { nextPendingLine, resolvePickStep } from "@/domain/order";
import { newIdemKey, pickerRepository } from "@/repositories/pickerRepository";
import { beepError, beepSuccess } from "@/services/scanner";
import BarcodeDisplay from "@/components/BarcodeDisplay";
import type { Order } from "@/types";

export function SkuScanScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [skuVerified, setSkuVerified] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      const r = await pickerRepository.getOrder(String(orderId));
      if (generation !== loadGeneration.current) return;
      if (r.ok) {
        setOrder(r.data);
        const active = nextPendingLine(r.data);
        setActiveLineId(
          active && (active.status === "LOCATION_VALIDATED" || active.status === "SKU_VALIDATED")
            ? active.id
            : null,
        );
        setSkuVerified(active?.status === "SKU_VALIDATED");
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const line = order?.lines.find(l => l.id === activeLineId)
    ?? order?.lines.find(l => l.status === "LOCATION_VALIDATED" || l.status === "SKU_VALIDATED")
    ?? null;
  const step = order ? resolvePickStep(order) : null;

  useEffect(() => {
    if (!order) return;

    // Terminal state is a first-class route. Never leave a completed order
    // sitting on the SKU screen waiting for another line.
    if (step === "complete") {
      router.replace({
        pathname: "/pick/[orderId]/complete",
        params: { orderId: order.id },
      } as never);
      return;
    }

    if (step !== null && step !== "sku" && step !== "quantity") {
      router.replace(`/pick/${order.id}/${step}` as never);
    }
  }, [order, step]);

  async function processItemBarcode(value: string) {
    if (!line || !order || busy) return;
    const barcode = value.trim();
    if (!barcode) {
      setError("Scan or enter the item barcode first");
      return;
    }

    // Invalidate any focus-load that was started before this scan. Its result
    // must never overwrite the state produced by this mutation.
    loadGeneration.current += 1;
    setBusy(true);
    setError(null);
    try {
      if (!skuVerified) {
        const verified = await pickerRepository.validateSku(line.id, barcode);
        if (!verified.ok) {
          beepError();
          setError(`${verified.apiError.error}: ${verified.apiError.message}`);
          return;
        }
        setSkuVerified(true);
      } else if (barcode.toUpperCase() !== line.skuBarcode.trim().toUpperCase()) {
        beepError();
        setError("Wrong item barcode. Scan the expected product.");
        return;
      }

      // Every successful physical item scan represents one picked unit.
      const picked = await pickerRepository.pickQuantity(line.id, 1, line.uom, newIdemKey());
      if (!picked.ok) {
        beepError();
        setError(`${picked.apiError.error}: ${picked.apiError.message}`);
        return;
      }

      beepSuccess();
      setManual("");
      const pickedQty = picked.data.pickedQty;
      const completed = pickedQty >= line.requiredQty;
      const nextLines = order.lines.map(l => l.id === line.id
        ? { ...l, pickedQty, status: completed ? "PICKED" as const : "SKU_VALIDATED" as const }
        : l);
      const nextOrder = { ...order, lines: nextLines };
      setOrder(nextOrder);
      setActiveLineId(null);
      setSkuVerified(false);

      // Advance directly from the authoritative post-pick state. This removes
      // the intermediate completion/loading state that could leave 5/5 or 6/6
      // stranded on the SKU screen.
      if (completed) {
        const nextStep = resolvePickStep(nextOrder);
        if (nextStep === "complete") {
          router.replace({
            pathname: "/pick/[orderId]/complete",
            params: { orderId: nextOrder.id },
          } as never);
        } else {
          router.replace(`/pick/${nextOrder.id}/${nextStep}` as never);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!order || !line || (step !== "sku" && step !== "quantity")) {
    return (
      <Screen>
        <AppHeader
          title="PICK ITEM"
          sub={!order ? "Loading…" : loading ? "Refreshing order…" : "Moving to the correct step…"}
        />
        <LoadingState
          label={!order ? "Loading order…" : "Moving to the correct step…"}
        />
      </Screen>
    );
  }

  const done = order.lines.filter(l => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;
  const pickedQty = line.pickedQty;
  const requiredQty = line.requiredQty;
  const remaining = Math.max(requiredQty - pickedQty, 0);
  const complete = pickedQty >= requiredQty;

  return (
    <Screen>
      <AppHeader title="PICK ITEM" sub={`Line ${line.lineNo} • ${line.skuName}`} />
      <Text style={s.orderId} numberOfLines={2}>{order.externalId}</Text>
      <Text style={s.progressText}>{done} of {order.lines.length} lines • {order.lines.length ? Math.round(done / order.lines.length * 100) : 0}%</Text>

      <View style={s.productCard}>
        <Text style={s.productName}>{line.skuName}</Text>
        <Text style={s.productSpecs}>{line.productSpecs}</Text>
        <BarcodeDisplay
          label="EXPECTED PRODUCT BARCODE"
          value={line.skuBarcode}
          scanTitle={skuVerified ? "Scan next item" : "Scan item barcode"}
          inputValue={manual}
          onInputChange={setManual}
          onSubmit={() => void processItemBarcode(manual)}
          inputPlaceholder={skuVerified ? "Scan next item barcode" : "Scan item barcode"}
          match={manual.trim() ? manual.trim().toUpperCase() === line.skuBarcode.trim().toUpperCase() : null}
          onScanned={(value) => {
            setManual(value);
          }}
          disabled={busy || complete}
        />
        {manual.trim() && !complete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next after entering the product barcode"
            onPress={() => void processItemBarcode(manual)}
            disabled={busy}
            style={[s.verifyNextButton, busy && s.disabled]}
          >
            <Text style={s.verifyNextButtonText}>{busy ? "Checking…" : "NEXT"}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScanTarget label="EXPECTED SKU" value={line.skuCode} />
      <SuccessFeedback message={skuVerified ? "Item verified — scan each physical item" : "Location OK — scan item"} />

      <View style={s.countCard}>
        <View style={s.metricsRow}>
          <View style={s.metricCell}><MetricCard value={`${pickedQty} / ${requiredQty} ${line.uom}`} label="Picked" tone={complete ? "ok" : "info"} /></View>
          <View style={s.metricCell}><MetricCard value={`${remaining} ${line.uom}`} label="Remaining" tone={remaining === 0 ? "ok" : "warn"} /></View>
        </View>
        <Text style={s.scanInstruction}>{complete ? "LINE COMPLETE" : skuVerified ? "SCAN NEXT ITEM" : "SCAN ITEM"}</Text>
        <Text style={s.countText}>{pickedQty} / {requiredQty} {line.uom}</Text>
        {!complete ? <Text style={s.helper}>Each successful product barcode scan adds 1 {line.uom}.</Text> : null}
      </View>

      <ErrorBanner message={error} />
    </Screen>
  );
}

const s = StyleSheet.create({
  orderId: { fontSize: 19, lineHeight: 22, fontWeight: "800", color: "#0d1c2e", marginTop: 3 },
  progressText: { fontSize: 12, fontWeight: "700", color: "#172033", marginTop: 3, marginBottom: 4 },
  productCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#1351b4", borderRadius: 12, padding: 9, marginTop: 1 },
  productName: { fontSize: 18, fontWeight: "700", color: "#0d1c2e" },
  productSpecs: { fontSize: 12, color: "#434653", marginTop: 1 },
  verifyNextButton: { minHeight: 46, marginTop: 8, borderRadius: 10, backgroundColor: "#0b8f2f", alignItems: "center", justifyContent: "center" },
  verifyNextButtonText: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  disabled: { opacity: 0.5 },
  countCard: { marginTop: 5, padding: 8, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#d5dbe5" },
  metricsRow: { flexDirection: "row", marginHorizontal: -3 },
  metricCell: { flex: 1, paddingHorizontal: 3 },
  scanInstruction: { textAlign: "center", marginTop: 5, fontSize: 11, fontWeight: "800", color: "#16823b", letterSpacing: 0.6 },
  countText: { textAlign: "center", fontSize: 28, lineHeight: 32, fontWeight: "900", color: "#0d1c2e", marginTop: 1 },
  helper: { textAlign: "center", fontSize: 10, color: "#596273", marginTop: 2 },
  nextButton: { minHeight: 46, marginTop: 8, borderRadius: 10, backgroundColor: "#0b8f2f", alignItems: "center", justifyContent: "center" },
  nextButtonText: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
});

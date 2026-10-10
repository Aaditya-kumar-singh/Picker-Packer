// Compact picker item step: verify the SKU and count each physical item barcode scan as 1 EA.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  LoadingState,
  MetricCard,
  PickStepStepper,
  ProgressIndicator,
  ScanTarget,
  Screen,
  SuccessFeedback,
  theme,
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
          title="Pick Item"
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
      <AppHeader
        title={order.externalId}
        sub={`Line ${line.lineNo} • ${line.skuName}`}
      />

      {/* Visual breadcrumb stepper */}
      <PickStepStepper currentStep="sku" />

      <ProgressIndicator done={done} total={order.lines.length} />

      <View style={s.productCard}>
        <View style={s.productHeader}>
          <Text style={s.productName}>{line.skuName}</Text>
          <View style={s.locationTag}>
            <Ionicons name="location-outline" size={13} color={theme.colors.location.text} />
            <Text style={s.locationText}>{line.locationCode}</Text>
          </View>
        </View>
        {line.productSpecs ? <Text style={s.productSpecs}>{line.productSpecs}</Text> : null}

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
            style={({ pressed }) => [s.verifyNextButton, busy && s.disabled, pressed ? { opacity: 0.88 } : null]}
          >
            <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
            <Text style={s.verifyNextButtonText}>{busy ? "Checking…" : "CONFIRM SCAN"}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScanTarget label="EXPECTED SKU CODE" value={line.skuCode} />
      <SuccessFeedback
        message={skuVerified ? "Item verified — scan each physical item" : "Location verified — scan product barcode"}
      />

      <View style={s.countCard}>
        <View style={s.metricsRow}>
          <View style={s.metricCell}>
            <MetricCard
              value={`${pickedQty} / ${requiredQty} ${line.uom}`}
              label="Picked Units"
              tone={complete ? "ok" : "info"}
            />
          </View>
          <View style={s.metricCell}>
            <MetricCard
              value={`${remaining} ${line.uom}`}
              label="Remaining"
              tone={remaining === 0 ? "ok" : "warn"}
            />
          </View>
        </View>

        <View style={s.countBottom}>
          <Text style={s.scanInstruction}>
            {complete ? "LINE COMPLETE" : skuVerified ? "SCAN PHYSICAL ITEM" : "SCAN TO VERIFY"}
          </Text>
          <Text style={s.countText}>
            {pickedQty} <Text style={{ fontSize: 18, color: theme.color.muted }}>/ {requiredQty} {line.uom}</Text>
          </Text>
          {!complete ? (
            <Text style={s.helper}>Each barcode scan counts as 1 {line.uom} picked.</Text>
          ) : null}
        </View>
      </View>

      <ErrorBanner message={error} />
    </Screen>
  );
}

const s = StyleSheet.create({
  productCard: {
    backgroundColor: theme.color.surface,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginTop: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  productHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  productName: {
    ...(theme.type.section as object),
    color: theme.color.ink,
    flex: 1,
  },
  locationTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.location.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
  },
  locationText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.location.text,
  },
  productSpecs: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 2,
    marginBottom: theme.space.xs,
  },
  verifyNextButton: {
    minHeight: theme.touch.min,
    marginTop: theme.space.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.okPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  verifyNextButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  disabled: { opacity: 0.5 },
  countCard: {
    marginTop: theme.space.sm,
    padding: theme.space.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  metricsRow: {
    flexDirection: "row",
    gap: theme.space.sm,
  },
  metricCell: {
    flex: 1,
  },
  countBottom: {
    marginTop: theme.space.sm,
    alignItems: "center",
    paddingTop: theme.space.xs,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  scanInstruction: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.color.primaryContainer,
    letterSpacing: 0.6,
  },
  countText: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.color.ink,
    marginTop: 2,
  },
  helper: {
    fontSize: 11,
    color: theme.color.muted,
    marginTop: 4,
  },
});

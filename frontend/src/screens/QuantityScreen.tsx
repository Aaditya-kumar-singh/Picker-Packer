// Screen 8 — Quantity. qty>0, qty<=remaining, UOM match. Short -> exception, over -> blocked.
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  FieldInput,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
} from "@/components/ui";
import { isShortPick, nextPendingLine, resolvePickStep } from "@/domain/order";
import { newIdemKey, pickerRepository } from "@/repositories/pickerRepository";
import type { Order } from "@/types";

export function QuantityScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
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
  // The worked line is the first non-terminal one; the step guard below
  // guarantees it is SKU_VALIDATED whenever this screen stays mounted.
  const line = order ? nextPendingLine(order) : null;
  const remaining = line ? line.requiredQty - line.pickedQty : 0;
  // Authoritative routing: without a SKU_VALIDATED active line (stale
  // deep-link, back-navigation, remote skip) forward instead of stranding.
  const step = order ? resolvePickStep(order) : null;
  useEffect(() => {
    if (order && step !== null && step !== "quantity") {
      router.replace(`/pick/${order.id}/${step}` as never);
    }
  }, [order, step]);

  async function confirm() {
    if (!line || !order) return;
    const n = Number(qty);
    loadGeneration.current += 1;
    setBusy(true);
    setError(null);
    try {
      const r = await pickerRepository.pickQuantity(line.id, n, line.uom, newIdemKey());
      if (!r.ok) {
        setError(`${r.apiError.error}: ${r.apiError.message}`);
        return;
      }
      // Short pick (< required) routes to exception workflow per spec demo,
      // carrying the worked line so the report attaches to active context.
      if (isShortPick(n, line.requiredQty)) {
        router.replace({ pathname: "/pick/[orderId]/exception", params: { orderId: order.id, lineId: line.id } } as never);
        return;
      }
      // Full pick terminalizes this line; lines advance strictly in route
      // order, so the next active line (if any) is PENDING → location.
      // LocationScanScreen self-corrects via resolvePickStep if that ever
      // stops holding (e.g. a concurrent supervisor skip elsewhere).
      const nextOrder = {
        ...order,
        lines: order.lines.map((l) => l.id === r.data.id ? r.data : l),
      };
      setOrder(nextOrder);
      const nextStep = resolvePickStep(nextOrder);
      if (nextStep === "complete") {
        router.replace({ pathname: "/pick/[orderId]/complete", params: { orderId: order.id } } as never);
      } else {
        router.replace(`/pick/${order.id}/${nextStep}` as never);
      }
    } finally {
      setBusy(false);
    }
  }


  if (!line || line.status !== "SKU_VALIDATED" || step !== "quantity") {
    return (
      <Screen>
        <AppHeader title="Quantity" sub={!order ? "Loading…" : "Resuming correct step…"} />
        <LoadingState label={!order ? "Loading order…" : "Resuming correct step…"} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={order!.externalId} sub={`Line ${line.lineNo} • ${line.skuName}`} />
      <View style={s.grid}>
        <View style={s.cell}>
          <MetricCard value={`${line.requiredQty} ${line.uom}`} label="Required" />
        </View>
        <View style={s.cell}>
          <MetricCard value={String(line.pickedQty)} label="Picked" tone={line.pickedQty > 0 ? "info" : undefined} />
        </View>
        <View style={s.cell}>
          <MetricCard value={`${remaining} ${line.uom}`} label="Remaining" tone={remaining === 0 ? "ok" : "warn"} />
        </View>
      </View>
      <FieldInput
        label={`Confirm quantity (${line.uom})`}
        value={qty}
        onChangeText={setQty}
        keyboardType="numeric"
        placeholder="Enter qty"
        textAlign="center"
        style={s.qty}
        returnKeyType="go"
        onSubmitEditing={confirm}
        editable={!busy}
      />
      <ErrorBanner message={error} />
      <PrimaryButton label={busy ? "Saving…" : "Confirm quantity"} onPress={confirm} disabled={busy} />
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginTop: 2 },
  cell: { width: "50%", paddingHorizontal: 4, flexGrow: 1 },
  qty: { fontSize: 28, fontWeight: "700", letterSpacing: 2 },
});


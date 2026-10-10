// Screen 8 — Quantity. qty>0, qty<=remaining, UOM match. Short -> exception, over -> blocked.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  FieldInput,
  LoadingState,
  MetricCard,
  PickStepStepper,
  PrimaryButton,
  Screen,
  SecondaryButton,
  theme,
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

  const line = order ? nextPendingLine(order) : null;
  const remaining = line ? line.requiredQty - line.pickedQty : 0;
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
      if (isShortPick(n, line.requiredQty)) {
        router.replace({ pathname: "/pick/[orderId]/exception", params: { orderId: order.id, lineId: line.id } } as never);
        return;
      }
      const nextOrder = {
        ...order,
        lines: order.lines.map((l) => (l.id === r.data.id ? r.data : l)),
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

  function adjustQty(delta: number) {
    const current = Number(qty) || 0;
    const nextVal = Math.max(0, Math.min(remaining, current + delta));
    setQty(String(nextVal));
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

      {/* Breadcrumb Stepper */}
      <PickStepStepper currentStep="quantity" />

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

      <View style={s.inputCard}>
        <Text style={s.inputHeading}>Confirm Quantity ({line.uom})</Text>

        <View style={s.stepperRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrement quantity"
            onPress={() => adjustQty(-1)}
            disabled={busy || Number(qty) <= 0}
            style={({ pressed }) => [s.stepperBtn, (busy || Number(qty) <= 0) && s.disabled, pressed ? { opacity: 0.7 } : null]}
          >
            <Ionicons name="remove" size={24} color={theme.color.ink} />
          </Pressable>

          <View style={s.qtyWrap}>
            <FieldInput
              value={qty}
              onChangeText={setQty}
              keyboardType="numeric"
              placeholder="0"
              textAlign="center"
              style={s.qty}
              returnKeyType="go"
              onSubmitEditing={confirm}
              editable={!busy}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increment quantity"
            onPress={() => adjustQty(1)}
            disabled={busy || Number(qty) >= remaining}
            style={({ pressed }) => [s.stepperBtn, (busy || Number(qty) >= remaining) && s.disabled, pressed ? { opacity: 0.7 } : null]}
          >
            <Ionicons name="add" size={24} color={theme.color.ink} />
          </Pressable>
        </View>

        {remaining > 0 ? (
          <Pressable
            onPress={() => setQty(String(remaining))}
            style={({ pressed }) => [s.quickFillBtn, pressed ? { opacity: 0.8 } : null]}
          >
            <Ionicons name="flash-outline" size={16} color={theme.color.primary} />
            <Text style={s.quickFillText}>Select Full Quantity ({remaining} {line.uom})</Text>
          </Pressable>
        ) : null}
      </View>

      <ErrorBanner message={error} />

      <PrimaryButton
        label={busy ? "Saving…" : "CONFIRM QUANTITY"}
        icon="checkmark-circle"
        onPress={confirm}
        disabled={busy || !qty.trim()}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: {
    flexDirection: "row",
    gap: theme.space.xs,
    marginTop: theme.space.xs,
    marginBottom: theme.space.sm,
  },
  cell: {
    flex: 1,
  },
  inputCard: {
    backgroundColor: theme.color.surface,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginVertical: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inputHeading: {
    ...(theme.type.section as object),
    color: theme.color.ink,
    textAlign: "center",
    marginBottom: theme.space.xs,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.color.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  disabled: {
    opacity: 0.4,
  },
  qtyWrap: {
    width: 120,
  },
  qty: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 1,
    height: 58,
    textAlign: "center",
  },
  quickFillBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: theme.space.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.infoBg,
    borderWidth: 1,
    borderColor: theme.color.infoBorder,
  },
  quickFillText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.color.infoInk,
  },
});

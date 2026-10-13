// Quantity confirmation — step 3 of pick flow.
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

  const numQty = Number(qty) || 0;
  const isValid = qty.trim() !== "" && numQty > 0;

  return (
    <Screen>
      <AppHeader title={order!.externalId} sub={`Line ${line.lineNo} • ${line.skuName}`} />

      {/* Stepper progress */}
      <PickStepStepper currentStep="quantity" />

      {/* Item info row */}
      <View style={s.itemInfoCard}>
        <View style={s.itemInfoMain}>
          <Text style={s.itemSkuCode}>{line.skuCode}</Text>
          <Text style={s.itemLocation}>Loc: <Text style={s.itemLocationBold}>{line.locationCode}</Text></Text>
        </View>
        <View style={s.uomBadge}>
          <Text style={s.uomText}>{line.uom}</Text>
        </View>
      </View>

      {/* Metric summary */}
      <View style={s.grid}>
        <View style={s.cell}>
          <MetricCard value={`${line.requiredQty}`} label="Required" />
        </View>
        <View style={s.cell}>
          <MetricCard value={String(line.pickedQty)} label="Picked" tone={line.pickedQty > 0 ? "info" : undefined} />
        </View>
        <View style={s.cell}>
          <MetricCard value={`${remaining}`} label="Remaining" tone={remaining === 0 ? "ok" : "warn"} />
        </View>
      </View>

      {/* Quantity input card */}
      <View style={s.inputCard}>
        <Text style={s.inputHeading}>CONFIRM QUANTITY TO PICK</Text>

        <View style={s.stepperRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrement quantity"
            onPress={() => adjustQty(-1)}
            disabled={busy || numQty <= 0}
            style={({ pressed }) => [
              s.stepperBtn,
              (busy || numQty <= 0) && s.disabled,
              pressed ? { opacity: 0.7 } : null,
            ]}
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
            disabled={busy || numQty >= remaining}
            style={({ pressed }) => [
              s.stepperBtn,
              (busy || numQty >= remaining) && s.disabled,
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <Ionicons name="add" size={24} color={theme.color.ink} />
          </Pressable>
        </View>

        {remaining > 0 ? (
          <Pressable
            onPress={() => setQty(String(remaining))}
            style={({ pressed }) => [s.quickFillBtn, pressed ? { opacity: 0.8 } : null]}
          >
            <Ionicons name="flash" size={14} color={theme.color.primary} />
            <Text style={s.quickFillText}>Select All ({remaining} {line.uom})</Text>
          </Pressable>
        ) : null}
      </View>

      <ErrorBanner message={error} />

      <View style={s.actionRow}>
        <PrimaryButton
          label={busy ? "Saving…" : "CONFIRM QUANTITY"}
          icon="checkmark-circle"
          onPress={confirm}
          disabled={busy || !isValid}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  itemInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    marginTop: theme.space.xs,
  },
  itemInfoMain: {
    flex: 1,
    gap: 2,
  },
  itemSkuCode: {
    ...(theme.type.codeMd as object),
    color: theme.color.ink,
    fontWeight: "700",
  },
  itemLocation: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
  itemLocationBold: {
    fontWeight: "700",
    color: theme.color.primary,
  },
  uomBadge: {
    backgroundColor: theme.color.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  uomText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.color.ink,
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: "row",
    gap: theme.space.xs,
    marginTop: theme.space.xs,
    marginBottom: theme.space.xs,
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
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inputHeading: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
    textAlign: "center",
    marginBottom: theme.space.sm,
    letterSpacing: 0.5,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.md,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.color.surfaceContainerLow,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.color.line,
  },
  disabled: {
    opacity: 0.35,
  },
  qtyWrap: {
    width: 110,
  },
  qty: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 1,
    height: 54,
    textAlign: "center",
  },
  quickFillBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    marginTop: theme.space.md,
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
  actionRow: {
    marginTop: theme.space.xs,
  },
});

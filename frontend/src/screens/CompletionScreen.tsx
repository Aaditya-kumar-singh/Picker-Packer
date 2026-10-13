// Picker completion — explicit COMPLETE PICKING, then READY_FOR_PACKING.
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  Card,
  ErrorBanner,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusBadge,
  SuccessFeedback,
  theme,
  toneForOrderStatus,
} from "@/components/ui";
import { newIdemKey, pickerRepository } from "@/repositories/pickerRepository";
import { pickStepPath } from "@/domain/order";
import type { Order } from "@/types";

export function CompletionScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await pickerRepository.getOrder(String(orderId));
    if (r.ok) {
      setOrder(r.data);
      setError(null);
    } else {
      setError(r.apiError.message);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function complete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await pickerRepository.completeOrder(String(orderId), newIdemKey(), order?.version);
      if (!r.ok) {
        setError(`${r.apiError.error}: ${r.apiError.message}`);
        return;
      }
      setOrder(r.data);
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <Screen>
        <AppHeader title="Completion" sub="Loading order details…" />
        <LoadingState label="Loading completion…" />
        <ErrorBanner message={error} />
      </Screen>
    );
  }

  const picked = order.lines.filter((l) => l.status === "PICKED").length;
  const exceptions = order.lines.filter((l) => l.status === "EXCEPTION").length;
  const resolved = picked + exceptions;
  const isReady = order.status === "COMPLETED";

  return (
    <Screen>
      <AppHeader
        title={order.externalId}
        sub={isReady ? "Ready for Packing" : "Review & Complete"}
      />

      <View style={s.hero}>
        <View style={[s.iconBox, isReady ? s.iconBoxReady : s.iconBoxPending]}>
          <Ionicons
            name={isReady ? "checkmark-circle" : "cube"}
            size={36}
            color={isReady ? theme.color.okInk : theme.color.primaryContainer}
          />
        </View>
        <Text style={s.title}>{isReady ? "READY FOR PACKING" : "COMPLETE PICKING"}</Text>
        <Text style={s.subtitle}>
          {isReady
            ? "All resolved lines handed over to the packing station."
            : "Confirm that all picking work is verified before completing."}
        </Text>
      </View>

      <View style={s.grid}>
        <View style={s.cell}>
          <MetricCard value={String(picked)} label="Picked" tone={picked > 0 ? "ok" : undefined} />
        </View>
        <View style={s.cell}>
          <MetricCard value={String(exceptions)} label="Exceptions" tone={exceptions > 0 ? "warn" : undefined} />
        </View>
        <View style={s.cell}>
          <MetricCard
            value={`${resolved}/${order.lines.length}`}
            label="Resolved"
            tone={resolved === order.lines.length ? "ok" : "warn"}
          />
        </View>
      </View>

      <Card>
        <View style={s.statusRow}>
          <View>
            <Text style={s.orderLabel}>ORDER STATUS</Text>
            <Text style={s.orderId}>{order.externalId}</Text>
          </View>
          <StatusBadge
            text={isReady ? "READY_FOR_PACKING" : order.status}
            tone={isReady ? "ok" : toneForOrderStatus(order.status)}
          />
        </View>
      </Card>

      <ErrorBanner message={error} />

      {isReady ? (
        <View style={s.actionStack}>
          <SuccessFeedback message="PICKING COMPLETE — order is in the packing queue." />
          <PrimaryButton
            label="Back to Assigned Orders"
            icon="list"
            onPress={() => router.replace("/orders" as never)}
          />
        </View>
      ) : (
        <View style={s.actionStack}>
          <PrimaryButton
            label={busy ? "Completing…" : "COMPLETE PICKING"}
            icon="checkmark-done"
            variant="success"
            onPress={complete}
            disabled={busy || resolved !== order.lines.length}
          />
          <SecondaryButton
            label="Back to picking"
            icon="arrow-back"
            onPress={() => router.replace(pickStepPath(order.id, order) as never)}
          />
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: {
    alignItems: "center",
    marginVertical: theme.space.sm,
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.space.xs,
  },
  iconBoxPending: {
    backgroundColor: theme.color.infoBg,
  },
  iconBoxReady: {
    backgroundColor: theme.color.okBg,
  },
  title: {
    ...(theme.type.section as object),
    fontSize: 18,
    color: theme.color.ink,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  subtitle: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    textAlign: "center",
    marginTop: 2,
    maxWidth: 300,
    fontSize: 13,
  },
  grid: {
    flexDirection: "row",
    gap: theme.space.xs,
    marginBottom: theme.space.xs,
  },
  cell: {
    flex: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space.sm,
  },
  orderLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
  },
  orderId: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    marginTop: 2,
    fontSize: 16,
  },
  actionStack: {
    marginTop: theme.space.sm,
    gap: theme.space.xs,
  },
});

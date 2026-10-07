// Picker completion — explicit COMPLETE PICKING, then READY_FOR_PACKING.
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
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
      <Text style={s.title}>{isReady ? "READY FOR PACKING" : "COMPLETE PICKING"}</Text>
      <Text style={s.subtitle}>
        {isReady ? "All resolved lines have been handed to the packing queue." : "Confirm that all picking work is resolved before completing the order."}
      </Text>

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
            <Text style={s.orderLabel}>ORDER</Text>
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
        <>
          <SuccessFeedback message="PICKING COMPLETE — order is READY_FOR_PACKING." />
          <PrimaryButton label="Back to Assigned Orders" onPress={() => router.replace("/orders" as never)} />
        </>
      ) : (
        <>
          <PrimaryButton
            label={busy ? "Completing…" : "COMPLETE PICKING"}
            onPress={complete}
            disabled={busy || resolved !== order.lines.length}
          />
          <SecondaryButton
            label="Back to picking"
            onPress={() => router.replace(pickStepPath(order.id, order) as never)}
          />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  title: {
    ...(theme.type.title as object),
    color: theme.color.ink,
    marginTop: theme.space.sm,
  },
  subtitle: {
    ...(theme.type.bodyMd as object),
    color: theme.color.secondary,
    marginTop: theme.space.xs,
    marginBottom: theme.space.md,
  },
  grid: {
    flexDirection: "row",
    marginHorizontal: -4,
    marginBottom: theme.space.md,
  },
  cell: {
    flex: 1,
    paddingHorizontal: 4,
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
  },
});

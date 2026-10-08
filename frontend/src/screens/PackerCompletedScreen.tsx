import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  AppHeader,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Screen,
  StatusBadge,
  theme,
} from "@/components/ui";
import * as client from "@/api/client";

export function PackerCompletedScreen() {
  const [orders, setOrders] = useState<client.OrderSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.packerCompletedOrders();
      setOrders(result.orders);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load completed orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <AppHeader title="Completed Orders" sub="Packing history" />
      <ErrorBanner message={error} />

      {loading ? (
        <LoadingState label="Loading completed orders…" />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No Completed Orders"
          body="Orders completed by you will appear here."
          actionLabel="Refresh"
          onAction={() => void load()}
        />
      ) : (
        orders.map((order) => {
          const total = order.itemCount ?? 0;
          const packed = order.packedCount ?? total;
          const riderAssigned = order.status === "RIDER_ASSIGNED";

          return (
            <Pressable
              key={order.id}
              accessibilityRole="button"
              onPress={() => router.push(`/pack/order/${order.id}` as never)}
              style={({ pressed }) => [s.card, pressed && s.pressed]}
            >
              <View style={s.row}>
                <Text style={s.id}>{order.orderNumber}</Text>
                <StatusBadge
                  text={riderAssigned ? "RIDER ASSIGNED" : "PACKED"}
                  tone="ok"
                />
              </View>
              <Text style={s.customer}>{order.customer || "Unknown Customer"}</Text>
              <View style={s.metaRow}>
                <Text style={s.meta}>{total} items</Text>
                <Text style={s.meta}>{packed}/{total} packed</Text>
              </View>
              <View style={s.progress}>
                <View style={[s.fill, { width: `${total ? Math.min(100, Math.round((packed / total) * 100)) : 0}%` }]} />
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginBottom: theme.space.xs,
  },
  pressed: {
    opacity: 0.82,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.space.sm,
  },
  id: {
    ...(theme.type.codeMd as object),
    color: theme.color.ink,
    flex: 1,
  },
  customer: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    marginTop: theme.space.xs,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.space.xs,
  },
  meta: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
  progress: {
    height: 5,
    backgroundColor: theme.color.surfaceContainerHigh,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: theme.space.xs,
  },
  fill: {
    height: 5,
    backgroundColor: theme.color.primary,
  },
});

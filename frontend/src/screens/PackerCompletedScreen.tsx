// Packer Completed Orders — History of packed orders & courier dispatches.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
    }, [load])
  );

  return (
    <Screen>
      <AppHeader title="Completed Orders" sub="Packaging history" />
      <ErrorBanner message={error} />

      {loading ? (
        <LoadingState label="Loading completed orders…" />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No Completed Orders"
          body="Orders packed and dispatched by you will appear here."
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

              <Text style={s.customer}>{order.customer || "Warehouse Customer"}</Text>

              <View style={s.metaRow}>
                <Text style={s.meta}>{total} item lines</Text>
                <Text style={s.metaHighlight}>
                  {packed} of {total} packed
                </Text>
              </View>

              <View style={s.progress}>
                <View
                  style={[
                    s.fill,
                    { width: `${total ? Math.min(100, Math.round((packed / total) * 100)) : 0}%` },
                  ]}
                />
              </View>

              <View style={s.footer}>
                <View style={s.footerLeft}>
                  <Ionicons name="checkmark-done" size={13} color={theme.color.okInk} />
                  <Text style={s.footerText}>
                    {riderAssigned ? `Rider: ${order.riderName ?? "Assigned"}` : "Ready for pickup"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={theme.color.faint} />
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
    shadowColor: theme.color.ink,
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  id: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    fontSize: 15,
  },
  customer: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    fontSize: 12,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.space.xs,
  },
  meta: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    fontSize: 11,
  },
  metaHighlight: {
    ...(theme.type.labelSm as object),
    color: theme.color.okInk,
    fontWeight: "700",
    fontSize: 11,
  },
  progress: {
    height: 5,
    backgroundColor: theme.color.surfaceContainerHigh,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: 6,
  },
  fill: {
    height: 5,
    backgroundColor: theme.color.okPrimary,
    borderRadius: 3,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    ...(theme.type.secondary as object),
    color: theme.color.okInk,
    fontSize: 11,
    fontWeight: "600",
  },
});

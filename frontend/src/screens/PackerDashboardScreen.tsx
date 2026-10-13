// Packer Dashboard — Work queue and station performance.
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  EmptyState,
  ErrorBanner,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
  StatusBadge,
  theme,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import * as client from "@/api/client";

export function PackerDashboardScreen() {
  const { picker } = useAuth();
  const { message } = useLocalSearchParams<{ message?: string }>();
  const [orders, setOrders] = useState<client.OrderSummary[]>([]);
  const [stats, setStats] = useState<client.PackerDashboardStats>({ assigned: 0, completed: 0, itemsPackedToday: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, metrics] = await Promise.all([client.packerOrders(), client.packerDashboardStats()]);
      setOrders(queue.orders.filter((o) => o.status !== "RIDER_ASSIGNED"));
      setStats(metrics);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load packing queue");
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
      <AppHeader
        title="Packer Dashboard"
        sub={picker ? `Welcome, ${picker.name}` : "Packaging Station"}
      />

      {message ? (
        <View style={s.success}>
          <Ionicons name="checkmark-circle" size={16} color={theme.color.okInk} />
          <Text style={s.successText}>{message}</Text>
        </View>
      ) : null}

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingState label="Loading packing queue…" />
      ) : (
        <>
          <View style={s.metrics}>
            <View style={s.metric}>
              <MetricCard value={String(stats.assigned)} label="In Queue" tone={stats.assigned > 0 ? "warn" : "ok"} />
            </View>
            <View style={s.metric}>
              <MetricCard value={String(stats.completed)} label="Completed" tone="ok" />
            </View>
            <View style={s.metric}>
              <MetricCard
                value={String(stats.itemsPackedToday)}
                label="Packed Today"
                tone={stats.itemsPackedToday > 0 ? "info" : undefined}
              />
            </View>
          </View>

          {orders.length === 0 ? (
            <EmptyState
              title="No Packing Orders"
              body="Orders ready for packing will appear here when picked."
              actionLabel="Refresh Queue"
              onAction={() => void load()}
            />
          ) : (
            orders.map((o) => {
              const packed = o.packedCount ?? 0;
              const total = o.itemCount ?? 0;
              const complete = o.status === "PACKED";
              const pct = total ? Math.min(100, Math.round((packed / total) * 100)) : 0;

              return (
                <View key={o.id} style={s.card}>
                  <View style={s.row}>
                    <Text style={s.id}>{o.orderNumber}</Text>
                    <StatusBadge
                      text={complete ? "PACKED" : "READY"}
                      tone={complete ? "ok" : "warn"}
                    />
                  </View>

                  <Text style={s.customer}>{o.customer || "Warehouse Customer"}</Text>

                  <View style={s.countRow}>
                    <Text style={s.meta}>{total} item lines</Text>
                    <Text style={s.countHighlight}>
                      {packed} / {total} packed ({pct}%)
                    </Text>
                  </View>

                  <View style={s.progress}>
                    <View style={[s.fill, { width: `${pct}%` }]} />
                  </View>

                  {complete ? (
                    <View style={s.complete}>
                      <Ionicons name="checkmark-circle" size={16} color={theme.color.okInk} />
                      <Text style={s.completeText}>All items packed & verified</Text>
                    </View>
                  ) : (
                    <View style={s.btnWrap}>
                      <PrimaryButton
                        label="OPEN PACKING ORDER"
                        icon="barcode-outline"
                        variant="amber"
                        onPress={() => router.push(`/pack/order/${o.id}` as never)}
                      />
                    </View>
                  )}
                </View>
              );
            })
          )}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  metrics: {
    flexDirection: "row",
    gap: theme.space.xs,
    marginBottom: theme.space.xs,
    marginTop: theme.space.xs,
  },
  metric: { flex: 1 },
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginBottom: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  id: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    fontSize: 16,
  },
  customer: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    fontSize: 12,
    marginTop: 2,
  },
  countRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.space.xs,
  },
  meta: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    fontSize: 12,
  },
  countHighlight: {
    ...(theme.type.labelSm as object),
    color: theme.packer.primaryDark,
    fontWeight: "700",
  },
  progress: {
    height: 6,
    backgroundColor: theme.color.surfaceContainerHigh,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: 6,
  },
  fill: {
    height: 6,
    backgroundColor: theme.packer.primary,
    borderRadius: 3,
  },
  complete: {
    backgroundColor: theme.color.okBg,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    paddingHorizontal: theme.space.sm,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  completeText: {
    color: theme.color.okInk,
    fontWeight: "700",
    fontSize: 12,
  },
  btnWrap: {
    marginTop: 4,
  },
  success: {
    backgroundColor: theme.color.okBg,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginBottom: theme.space.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  successText: {
    ...(theme.type.bodyMd as object),
    color: theme.color.okInk,
    fontWeight: "700",
    fontSize: 13,
  },
});

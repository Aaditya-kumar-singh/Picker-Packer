import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AppHeader, EmptyState, ErrorBanner, LoadingState, MetricCard, PrimaryButton, Screen, StatusBadge, theme } from "@/components/ui";
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
      setOrders(queue.orders.filter(o => o.status !== "RIDER_ASSIGNED"));
      setStats(metrics);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load packing queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Screen>
      <AppHeader title="Packer Dashboard" sub={picker ? "Welcome, " + picker.name : ""} />
      {message ? <View style={s.success}><Text style={s.successText}>{message}</Text></View> : null}
      <ErrorBanner message={error} />
      {loading ? <LoadingState label="Loading packing queue…" /> : (
        <>
          <View style={s.metrics}>
            <View style={s.metric}><MetricCard value={String(stats.assigned)} label="Assigned" /></View>
            <View style={s.metric}><MetricCard value={String(stats.completed)} label="Completed" /></View>
            <View style={s.metric}><MetricCard value={String(stats.itemsPackedToday)} label="Items packed today" /></View>
          </View>

          {orders.length === 0 ? (
            <EmptyState title="No packing orders" body="Orders ready for packing will appear here." actionLabel="Refresh" onAction={() => void load()} />
          ) : orders.map(o => {
            const packed = o.packedCount ?? 0;
            const total = o.itemCount ?? 0;
            const complete = o.status === "PACKED";
            return (
              <View key={o.id} style={s.card}>
                <View style={s.row}>
                  <Text style={s.id}>{o.orderNumber}</Text>
                  <StatusBadge text={complete ? "PACKED" : "PACKING"} tone={complete ? "ok" : "info"} />
                </View>
                <Text style={s.customer}>{o.customer || "Unknown Customer"}</Text>
                <Text style={s.meta}>{total} items</Text>
                <Text style={s.meta}>{packed}/{total} packed</Text>
                <View style={s.progress}><View style={[s.fill, { width: ((total ? Math.min(100, Math.round((packed / total) * 100)) : 0) + "%") as `${number}%` }]} /></View>
                {complete ? (
                  <View style={s.complete}><Text style={s.completeText}>All items packed</Text></View>
                ) : (
                  <PrimaryButton label="Scan barcode" onPress={() => router.push("/pack/order/" + o.id as never)} />
                )}
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  metrics: { flexDirection: "row", gap: theme.space.sm, marginBottom: theme.space.md },
  metric: { flex: 1 },
  card: { 
    backgroundColor: theme.color.surface, 
    borderWidth: 1, 
    borderColor: theme.color.line, 
    borderRadius: theme.radius.lg, 
    padding: theme.space.md, 
    marginBottom: theme.space.sm,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  id: { ...(theme.type.codeLg as object), color: theme.color.ink },
  customer: { ...(theme.type.bodyMd as object), color: theme.color.muted, marginTop: theme.space.xs },
  meta: { ...(theme.type.secondary as object), color: theme.color.muted, marginTop: 4 },
  progress: { height: 8, backgroundColor: theme.color.surfaceContainerHigh, borderRadius: 4, overflow: "hidden", marginTop: theme.space.sm },
  fill: { height: 8, backgroundColor: theme.color.primaryContainer },
  complete: { 
    backgroundColor: theme.color.okBg, 
    borderWidth: 1, 
    borderColor: theme.color.primary, 
    borderRadius: theme.radius.md, 
    padding: theme.space.sm, 
    marginTop: theme.space.md, 
    alignItems: "center" 
  },
  completeText: { ...(theme.type.button as object), color: theme.color.okInk, fontWeight: "700", textTransform: "uppercase" },
  success: { backgroundColor: theme.color.okBg, borderWidth: 1, borderColor: theme.color.primary, borderRadius: theme.radius.md, padding: theme.space.sm, marginBottom: theme.space.sm },
  successText: { ...(theme.type.bodyMd as object), color: theme.color.okInk, fontWeight: "800", textAlign: "center" },
});

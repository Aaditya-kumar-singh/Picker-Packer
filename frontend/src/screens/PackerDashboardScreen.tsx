import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppHeader, EmptyState, ErrorBanner, LoadingState, MetricCard, PrimaryButton, Screen, SectionHeader, StatusBadge, theme } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import * as client from "@/api/client";

export function PackerDashboardScreen() {
  const { picker } = useAuth();
  const [orders, setOrders] = useState<client.OrderSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders((await client.packerOrders()).orders);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load packing queue");
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const ready = orders.filter(o => o.status === "READY_FOR_PACKING").length;
  const active = orders.filter(o => o.status === "PACKING").length;

  return (
    <Screen>
      <AppHeader title="YBM PACKER" sub={picker ? `${picker.name} • ${picker.warehouseId}` : ""} />
      <ErrorBanner message={error} />
      {loading ? <LoadingState label="Loading packing queue…" /> : (
        <>
          <View style={s.grid}>
            <View style={s.cell}><MetricCard value={String(ready)} label="Ready to pack" tone={ready ? "info" : undefined} /></View>
            <View style={s.cell}><MetricCard value={String(active)} label="Packing now" tone={active ? "warn" : "ok"} /></View>
          </View>
          <SectionHeader title="Packing queue" hint="Server-authoritative status" />
          {orders.length === 0 ? <EmptyState title="Queue is clear" body="No orders are ready for packing." actionLabel="Refresh" onAction={() => void load()} /> :
            orders.slice(0, 20).map(o => (
              <View key={o.id} style={s.card}>
                <View style={s.row}>
                  <Text style={s.id}>{o.id}</Text>
                  <StatusBadge text={o.status} tone={o.status === "PACKING" ? "warn" : "info"} />
                </View>
                <Text style={s.meta}>{o.customer} • {o.itemCount ?? 0} items</Text>
                <PrimaryButton label={o.status === "PACKING" ? "Continue packing" : "Start packing"} onPress={() => router.push(`/pack/order/${o.id}` as never)} />
              </View>
            ))}
          <PrimaryButton label="Dispatch & rider assignment" onPress={() => router.push("/dispatch" as never)} />
        </>
      )}
    </Screen>
  );
}
const s = StyleSheet.create({
  grid:{flexDirection:"row",gap:theme.space.xs,marginBottom:theme.space.sm},
  cell:{flex:1},
  card:{backgroundColor:theme.color.surface,borderWidth:1,borderColor:theme.color.line,borderRadius:theme.radius.lg,padding:theme.space.sm,marginBottom:theme.space.xs},
  row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  id:{...(theme.type.codeMd as object),color:theme.color.ink},
  meta:{...(theme.type.body as object),color:theme.color.muted,marginVertical:theme.space.xs},
});

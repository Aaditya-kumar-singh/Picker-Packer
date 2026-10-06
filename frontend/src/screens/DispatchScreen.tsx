import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppHeader, EmptyState, ErrorBanner, LoadingState, PrimaryButton, Screen, StatusBadge, theme } from "@/components/ui";
import { newIdemKey } from "@/repositories/pickerRepository";
import * as client from "@/api/client";

export function DispatchScreen() {
  const [orders, setOrders] = useState<client.OrderSummary[]>([]);
  const [riders, setRiders] = useState<client.Rider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([client.packerDispatch(), client.packerRiders()]);
      setOrders(d.orders); setRiders(r.riders); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load dispatch"); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function assign(orderId: string, rider: client.Rider) {
    setBusy(orderId); setError(null);
    try { await client.assignRider(orderId, rider.id, rider.name, newIdemKey()); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Rider assignment failed"); }
    finally { setBusy(null); }
  }

  return (
    <Screen>
      <AppHeader title="Dispatch" sub="Packed orders and active riders" />
      <ErrorBanner message={error} />
      {busy ? <Text style={s.busy}>Updating dispatch…</Text> : null}
      {riders.length === 0 ? <EmptyState title="No active riders" body="Add an active rider for this warehouse before dispatching." /> : null}
      {orders.length === 0 ? <EmptyState title="Nothing to dispatch" body="Completed packages will appear here." actionLabel="Refresh" onAction={() => void load()} /> :
        orders.map(o => (
          <View key={o.id} style={s.card}>
            <View style={s.row}>
              <Text style={s.id}>{o.id}</Text>
              <StatusBadge text={o.status} tone={o.status === "RIDER_ASSIGNED" ? "ok" : "info"} />
            </View>
            <Text style={s.meta}>{o.customer}</Text>
            {o.riderName ? <Text style={s.rider}>Assigned rider: {o.riderName}</Text> : null}
            {o.status === "PACKED" ? riders.map(r =>
              <PrimaryButton key={r.id} label={`Assign ${r.name}${r.phone ? ` • ${r.phone}` : ""}`} onPress={() => void assign(o.id, r)} disabled={busy !== null} />
            ) : null}
          </View>
        ))}
      <PrimaryButton label="Back to packer dashboard" onPress={() => router.replace("/packer-dashboard" as never)} />
    </Screen>
  );
}
const s=StyleSheet.create({
 card:{backgroundColor:theme.color.surface,borderWidth:1,borderColor:theme.color.line,borderRadius:theme.radius.lg,padding:theme.space.sm,marginBottom:theme.space.xs},
 row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 id:{...(theme.type.codeMd as object),color:theme.color.ink},
 meta:{...(theme.type.body as object),color:theme.color.muted,marginVertical:theme.space.xxs},
 rider:{...(theme.type.body as object),color:theme.color.okInk,marginBottom:theme.space.xxs},
 busy:{...(theme.type.body as object),color:theme.color.muted,marginBottom:theme.space.xs},
});

import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  AppHeader,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PrimaryButton,
  Screen,
  StatusBadge,
  theme,
} from "@/components/ui";
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
      setOrders(d.orders);
      setRiders(r.riders);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dispatch");
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function assign(orderId: string, rider: client.Rider) {
    setBusy(orderId);
    setError(null);
    try {
      await client.assignRider(orderId, rider.id, rider.name, newIdemKey());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rider assignment failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <AppHeader title="Dispatch Hub" sub="Assign packed orders to active riders" />
      <ErrorBanner message={error} />
      {busy ? <Text style={s.busy}>Updating dispatch rider…</Text> : null}
      {riders.length === 0 ? (
        <EmptyState
          title="No Active Riders"
          body="Add an active delivery rider for this warehouse before dispatching."
        />
      ) : null}
      {orders.length === 0 ? (
        <EmptyState
          title="Nothing to Dispatch"
          body="Packed orders ready for pickup will appear here."
          actionLabel="Refresh Hub"
          onAction={() => void load()}
        />
      ) : (
        orders.map((o) => (
          <View key={o.id} style={s.card}>
            <View style={s.row}>
              <Text style={s.id}>{o.orderNumber || o.id}</Text>
              <StatusBadge
                text={o.status === "RIDER_ASSIGNED" ? "RIDER ASSIGNED" : "READY FOR DISPATCH"}
                tone={o.status === "RIDER_ASSIGNED" ? "ok" : "warn"}
              />
            </View>
            <Text style={s.meta}>{o.customer || "Warehouse Customer"}</Text>
            {o.riderName ? (
              <View style={s.assignedRow}>
                <Text style={s.rider}>Assigned rider: <Text style={{ fontWeight: "800" }}>{o.riderName}</Text></Text>
              </View>
            ) : null}
            {o.status === "PACKED"
              ? riders.map((r) => (
                  <PrimaryButton
                    key={r.id}
                    label={`Assign ${r.name}${r.phone ? ` • ${r.phone}` : ""}`}
                    icon="bicycle-outline"
                    variant="amber"
                    onPress={() => void assign(o.id, r)}
                    disabled={busy !== null}
                  />
                ))
              : null}
          </View>
        ))
      )}
      <View style={{ marginTop: theme.space.md }}>
        <PrimaryButton
          label="Back to Packer Dashboard"
          icon="arrow-back"
          onPress={() => router.replace("/packer-dashboard" as never)}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  id: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    fontSize: 17,
  },
  meta: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    marginVertical: 4,
  },
  assignedRow: {
    backgroundColor: theme.color.okBg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
    alignSelf: "flex-start",
  },
  rider: {
    ...(theme.type.secondary as object),
    color: theme.color.okInk,
  },
  busy: {
    ...(theme.type.bodyMd as object),
    color: theme.color.primaryContainer,
    marginBottom: theme.space.xs,
    fontWeight: "600",
  },
});

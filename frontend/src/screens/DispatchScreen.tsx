// Dispatch Screen — Assign packed orders to active delivery riders.
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([client.packerDispatch(), client.packerRiders()]);
      setOrders(d.orders);
      setRiders(r.riders);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dispatch");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

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
      <AppHeader title="Dispatch Hub" sub="Assign packed orders to riders" />
      <ErrorBanner message={error} />

      {busy ? (
        <View style={s.busyWrap}>
          <Text style={s.busy}>Updating dispatch rider assignment…</Text>
        </View>
      ) : null}

      {loading ? (
        <LoadingState label="Loading dispatch orders…" />
      ) : (
        <>
          {riders.length === 0 ? (
            <EmptyState
              title="No Active Riders"
              body="Add an active delivery rider for this warehouse before dispatching."
            />
          ) : null}

          {orders.length === 0 ? (
            <EmptyState
              title="Nothing to Dispatch"
              body="Packed orders ready for courier pickup will appear here."
              actionLabel="Refresh Hub"
              onAction={() => void load()}
            />
          ) : (
            orders.map((o) => (
              <View key={o.id} style={s.card}>
                <View style={s.row}>
                  <Text style={s.id}>{o.orderNumber || o.id}</Text>
                  <StatusBadge
                    text={o.status === "RIDER_ASSIGNED" ? "ASSIGNED" : "READY"}
                    tone={o.status === "RIDER_ASSIGNED" ? "ok" : "warn"}
                  />
                </View>

                <Text style={s.customer}>{o.customer || "Warehouse Customer"}</Text>

                {o.riderName ? (
                  <View style={s.assignedRow}>
                    <Ionicons name="bicycle" size={14} color={theme.color.okInk} />
                    <Text style={s.rider}>
                      Assigned: <Text style={s.riderNameBold}>{o.riderName}</Text>
                    </Text>
                  </View>
                ) : null}

                {o.status === "PACKED" ? (
                  <View style={s.riderList}>
                    <Text style={s.selectLabel}>ASSIGN COURIER</Text>
                    {riders.map((r) => (
                      <PrimaryButton
                        key={r.id}
                        label={`Assign ${r.name}${r.phone ? ` (${r.phone})` : ""}`}
                        icon="bicycle-outline"
                        variant="amber"
                        onPress={() => void assign(o.id, r)}
                        disabled={busy !== null}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}

          <View style={s.actionWrap}>
            <PrimaryButton
              label="Back to Packer Dashboard"
              icon="arrow-back"
              onPress={() => router.replace("/packer-dashboard" as never)}
            />
          </View>
        </>
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
  assignedRow: {
    backgroundColor: theme.color.okBg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rider: {
    fontSize: 11,
    color: theme.color.okInk,
  },
  riderNameBold: {
    fontWeight: "700",
  },
  riderList: {
    marginTop: theme.space.xs,
    gap: 4,
  },
  selectLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.color.muted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  busyWrap: {
    backgroundColor: theme.color.surfaceContainerLow,
    padding: theme.space.xs,
    borderRadius: theme.radius.sm,
    marginBottom: theme.space.xs,
    alignItems: "center",
  },
  busy: {
    fontSize: 12,
    color: theme.color.primaryContainer,
    fontWeight: "600",
  },
  actionWrap: {
    marginTop: theme.space.sm,
  },
});

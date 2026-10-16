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
import { packerAppApi } from "@/api/packerAppApi";
import type { FulfillmentOrderDto, RiderCandidateDto } from "@/types";
import { isSameWarehouse } from "@/utils/warehouse";

export function DispatchScreen() {
  const [orders, setOrders] = useState<FulfillmentOrderDto[]>([]);
  const [riders, setRiders] = useState<RiderCandidateDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assigned, r] = await Promise.all([
        packerAppApi.getAssignedOrders(),
        packerAppApi.getAvailableRiders(),
      ]);
      const packedOrders = assigned.filter((o) => o.orderStatus === "PACKED");
      setOrders(packedOrders);
      setRiders(r || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load dispatch orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function assign(orderId: number, rider: RiderCandidateDto) {
    setBusy(orderId);
    setError(null);
    try {
      await packerAppApi.assignRider(orderId, { riderId: rider.id });
      await load();
    } catch (e: any) {
      setError(e?.message || "Rider assignment failed");
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
              body="No active delivery riders available in this warehouse."
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
              <View key={o.orderId} style={s.card}>
                <View style={s.row}>
                  <Text style={s.id}>{o.orderNumber}</Text>
                  <StatusBadge text={o.orderStatus} tone="warn" />
                </View>

                <Text style={s.meta}>
                  {o.totalItems} lines • ₹{o.grandTotal.toFixed(2)} ({o.paymentMethod})
                </Text>

                <View style={s.riderList}>
                  <Text style={s.selectLabel}>ASSIGN COURIER</Text>
                  {riders.filter((r) => isSameWarehouse(r.warehouseId, o.warehouseId)).length === 0 ? (
                    <Text style={s.meta}>
                      No active riders are available for this order's warehouse, or its warehouse identity is missing.
                    </Text>
                  ) : null}
                  {riders.filter((r) => isSameWarehouse(r.warehouseId, o.warehouseId)).map((r) => (
                    <PrimaryButton
                      key={r.id}
                      label={`Assign ${r.name}${r.phone ? ` (${r.phone})` : ""}`}
                      icon="bicycle-outline"
                      variant="amber"
                      onPress={() => void assign(o.orderId, r)}
                      disabled={busy !== null}
                    />
                  ))}
                </View>
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
    fontSize: 15,
    fontWeight: "800",
    color: theme.color.ink,
  },
  meta: {
    fontSize: 12,
    color: theme.color.muted,
    marginTop: 2,
  },
  riderList: {
    marginTop: theme.space.xs,
    gap: 6,
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

// Screen 10 — Completion. Verifies terminal states, then WMS simulation (separate states).
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  Card,
  Chip,
  Divider,
  ErrorBanner,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
  SuccessFeedback,
  theme,
  toneForOrderStatus,
  WmsStatusBadge,
} from "@/components/ui";
import { newIdemKey, pickerRepository } from "@/repositories/pickerRepository";
import { pickStepPath } from "@/domain/order";
import { DEV } from "@/utils/dev";
import type { Order, WmsMode } from "@/types";

export function CompletionScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wms, setWms] = useState<WmsMode>("WMS_SUCCESS");

  const load = useCallback(async () => {
    const r = await pickerRepository.getOrder(String(orderId));
    if (r.ok) setOrder(r.data);
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
      pickerRepository.setWmsMode(wms);
      const r = await pickerRepository.completeOrder(String(orderId), newIdemKey());
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
        <AppHeader title="Completion" sub="Loading order summary…" />
        <LoadingState label="Loading order…" />
      </Screen>
    );
  }
  const picked = order.lines.filter((l) => l.status === "PICKED").length;
  const exc = order.lines.filter((l) => l.status === "EXCEPTION").length;

  return (
    <Screen>
      <AppHeader title={order.externalId} sub="Completion — picker vs WMS states separate" />
      <View style={s.grid}>
        <View style={s.cell}>
          <MetricCard value={String(picked)} label="Picked lines" tone={picked > 0 ? "ok" : undefined} />
        </View>
        <View style={s.cell}>
          <MetricCard value={String(exc)} label="Exceptions" tone={exc > 0 ? "bad" : undefined} />
        </View>
        <View style={s.cell}>
          <MetricCard value={`${picked + exc}/${order.lines.length}`} label="Resolved" tone={picked + exc === order.lines.length ? "ok" : "warn"} />
        </View>
      </View>
      <Card>
        <StatusBadge text={order.status} tone={toneForOrderStatus(order.status)} />
        <View style={s.wmsRow}>
          <WmsStatusBadge status={order.wmsStatus} />
        </View>
      </Card>
      {order.status === "COMPLETED" && order.wmsStatus !== "SYNCED" ? (
        <ErrorBanner message="Order completed, but WMS acknowledgement is still pending/failed. Your picks are recorded — sync will complete automatically." />
      ) : null}
      {order.status === "COMPLETED" && order.wmsStatus === "SYNCED" ? (
        <SuccessFeedback message="WMS SYNCED — acknowledgement received" />
      ) : null}
      <ErrorBanner message={error} />
      {order.status !== "COMPLETED" ? (
        <>
          {/* DEV-ONLY WMS toggle (hidden in production builds) */}
          {DEV && (
            <>
              <SectionHeader title="WMS simulation" hint="Dev only" />
              {(["WMS_SUCCESS", "WMS_PENDING", "WMS_FAILURE"] as WmsMode[]).map((m) => (
                <Chip key={m} label={m} selected={wms === m} onPress={() => setWms(m)} />
              ))}
            </>
          )}
          <Divider />
          <PrimaryButton label={busy ? "Completing…" : "COMPLETE ORDER"} onPress={complete} disabled={busy} />
          <SecondaryButton label="Back to picking" onPress={() => router.push(pickStepPath(order.id, order) as never)} />
        </>
      ) : (
        <>
          <Divider />
          <PrimaryButton label="Back to Orders" onPress={() => router.push("/orders" as never)} />
          <SecondaryButton label="Dashboard" onPress={() => router.push("/dashboard" as never)} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginTop: 2 },
  cell: { width: "50%", paddingHorizontal: 4, flexGrow: 1 },
  wmsRow: { marginTop: theme.space.xxs, flexDirection: "row" },
});


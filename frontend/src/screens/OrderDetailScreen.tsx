// Screen 5 — Order Detail + START PICKING. Stitch design: order header with SLA
// summary banner, pick manifest with monospace location tags, sticky claim CTA.
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  Card,
  Divider,
  ErrorBanner,
  ErrorState,
  LoadingState,
  PrimaryButton,
  ProgressIndicator,
  Screen,
  SectionHeader,
  SLAIndicator,
  StatusBadge,
  theme,
  toneForLineStatus,
  toneForOrderStatus,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { getDeviceId, newIdemKey, pickerRepository } from "@/repositories/pickerRepository";
import { pickStepPath } from "@/domain/order";
import type { Order } from "@/types";

export function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { picker } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await pickerRepository.getOrder(String(id));
    if (r.ok) {
      setOrder(r.data);
      setError(null);
    } else setError(r.apiError.message);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );


  // ASSIGNED -> IN_PROGRESS. Same picker + device only.
  async function onBegin() {
    setBusy(true);
    setError(null);
    try {
      const r = await pickerRepository.beginPicking(
        String(id),
        getDeviceId(),
        newIdemKey(),
        order?.version
      );
      if (!r.ok) {
        setError(r.apiError.message);
        return;
      }
      setOrder(r.data);
      // Fresh ASSIGNED orders start at location, but route from the
      // authoritative line status so a resumed order never restarts at step 1.
      router.replace(pickStepPath(r.data.id, r.data) as never);
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <Screen>
        <AppHeader title="Order" sub={loading ? undefined : "Could not load order"} />
        {loading ? <LoadingState label="Loading order…" /> : <ErrorState message={error ?? "Order not found"} onRetry={() => void load()} />}
      </Screen>
    );
  }
  const done = order.lines.filter((l) => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;

  return (
    <Screen>
      {/* Order header */}
      <View style={od.headerRow}>
        <View>
          <Text style={od.orderId}>{order.externalId}</Text>
          <Text style={od.orderMeta}>Priority {order.priority} • {order.totalLines} Pick Lines</Text>
        </View>
        <StatusBadge text={order.status} tone={toneForOrderStatus(order.status)} />
      </View>

      {/* Summary banner */}
      <View style={od.summaryBanner}>
        <View style={od.summaryItem}>
          <Text style={od.summaryValue}>{order.totalLines}</Text>
          <Text style={od.summaryLabel}>PICK LINES</Text>
        </View>
        <View style={od.summaryDivider} />
        <View style={od.summaryItem}>
          <Text style={od.summaryValue}>{done}/{order.totalLines}</Text>
          <Text style={od.summaryLabel}>RESOLVED</Text>
        </View>
        <View style={od.summaryDivider} />
        <View style={od.summaryItem}>
          <SLAIndicator slaDueAt={order.slaDueAt} />
        </View>
      </View>

      <ProgressIndicator done={done} total={order.lines.length} />
      <ErrorBanner message={error} />


      {/* Picking Manifest */}
      <SectionHeader title="Picking Manifest" hint={`${order.lines.length} items in route order`} />
      {order.lines.map((l, idx) => (
        <View key={l.id} style={od.lineCard}>
          {/* Line number indicator */}
          <View style={od.lineNumberBox}>
            <Text style={od.lineNumber}>{idx + 1}</Text>
          </View>
          <View style={od.lineContent}>
            {/* SKU code */}
            <View style={od.skuRow}>
              <Text style={od.skuCode}>{l.skuCode}</Text>
              <StatusBadge text={l.status} tone={toneForLineStatus(l.status)} />
            </View>
            <Text style={od.skuName}>{l.skuName}</Text>
            <Text style={od.specs}>{l.productSpecs}</Text>
            <View style={od.barcodeBox}>
              <Text style={od.barcodeLabel}>PRODUCT BARCODE</Text>
              <Text style={od.barcodeValue}>{l.skuBarcode}</Text>
            </View>
            {/* Location tag */}
            <View style={od.locRow}>
              <View style={od.locTag}>
                <Text style={od.locCode}>{l.locationCode}</Text>
                <Text style={od.locBarcode}>{l.locationBarcode}</Text>
              </View>
              <Text style={od.qtyText}>Req: {l.requiredQty} {l.uom}</Text>
              <Text style={od.qtyPicked}>Picked: {l.pickedQty}</Text>
            </View>
          </View>
        </View>
      ))}

      <Divider />
      {order.status === "ASSIGNED" ? (
        order.assignedPickerCode !== picker?.id ? (
          <ErrorBanner message={`Assigned to ${order.assignedPickerCode}. Pick another order.`} />
        ) : (
          <PrimaryButton
            label={busy ? "Starting…" : "START PICKING"}
            onPress={onBegin}
            disabled={busy}
          />
        )
      ) : order.status === "IN_PROGRESS" ? (
        <PrimaryButton label="Continue picking" onPress={() => router.replace(pickStepPath(order.id, order) as never)} />
      ) : (
        <StatusBadge text={order.status} tone={toneForOrderStatus(order.status)} />
      )}
    </Screen>
  );
}

const od = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: theme.space.sm,
  },
  orderId: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
  },
  orderMeta: {
    ...(theme.type.secondary as object),
    color: theme.color.secondary,
    marginTop: 2,
  },
  summaryBanner: {
    flexDirection: "row",
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginVertical: theme.space.sm,
    alignItems: "center",
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: {
    ...(theme.type.section as object),
    color: theme.color.ink,
  },
  summaryLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.color.line,
  },
  statusBanner: {
    backgroundColor: theme.color.surfaceContainerHigh,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginVertical: theme.space.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBannerLabel: {
    ...(theme.type.labelMd as object),
    color: theme.color.muted,
  },
  statusBannerValue: {
    ...(theme.type.labelLg as object),
    color: theme.color.primary,
  },
  lineCard: {
    flexDirection: "row",
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    marginBottom: theme.space.sm,
    borderWidth: 1,
    borderColor: theme.color.line,
    overflow: "hidden",
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  lineNumberBox: {
    width: 36,
    backgroundColor: theme.color.primaryContainer,
    justifyContent: "center",
    alignItems: "center",
  },
  lineNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.color.onPrimary,
  },
  lineContent: {
    flex: 1,
    padding: theme.space.sm,
  },
  skuRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  skuCode: {
    ...(theme.type.codeMd as object),
    color: theme.color.ink,
  },
  skuName: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  specs: { ...(theme.type.secondary as object), color: theme.color.secondary, marginTop: 4 },
  barcodeBox: { backgroundColor: theme.color.surfaceContainerLow, borderRadius: theme.radius.md, padding: theme.space.xs, marginTop: theme.space.xs },
  barcodeLabel: { ...(theme.type.labelSm as object), color: theme.color.primaryContainer },
  barcodeValue: { ...(theme.type.codeMd as object), color: theme.color.ink, marginTop: 2 },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    marginTop: theme.space.xxs,
    flexWrap: "wrap",
  },
  locTag: {
    backgroundColor: theme.colors.location.bg,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.md,
  },
  locCode: {
    ...(theme.type.codeMd as object),
    color: theme.colors.location.text,
    fontSize: 14,
  },
  locBarcode: { ...(theme.type.caption as object), color: theme.colors.location.text, marginTop: 2, opacity: 0.8 },
  qtyText: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
  qtyPicked: {
    ...(theme.type.secondary as object),
    color: theme.color.okInk,
    fontWeight: "600",
  },
});

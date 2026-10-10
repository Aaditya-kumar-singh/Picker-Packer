// Screen 5 — Order Detail + START PICKING.
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
      router.replace(pickStepPath(r.data.id, r.data) as never);
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <Screen>
        <AppHeader title="Order" sub={loading ? undefined : "Could not load order"} showBack />
        {loading ? <LoadingState label="Loading order…" /> : <ErrorState message={error ?? "Order not found"} onRetry={() => void load()} />}
      </Screen>
    );
  }
  const done = order.lines.filter((l) => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;
  const isPriorityHigh = order.priority >= 2;

  return (
    <Screen>
      <AppHeader title="Order Details" sub={order.externalId} showBack />

      {/* Order header card */}
      <View style={od.headerRow}>
        <View>
          <Text style={od.orderId}>{order.externalId}</Text>
          <Text style={od.orderMeta}>
            Priority: {isPriorityHigh ? "High" : "Standard"} • {order.totalLines} Pick Lines
          </Text>
        </View>
        <StatusBadge text={order.status} tone={toneForOrderStatus(order.status)} />
      </View>

      {/* Summary banner */}
      <View style={od.summaryBanner}>
        <View style={od.summaryItem}>
          <Text style={od.summaryValue}>{order.totalLines}</Text>
          <Text style={od.summaryLabel}>TOTAL LINES</Text>
        </View>
        <View style={od.summaryDivider} />
        <View style={od.summaryItem}>
          <Text style={[od.summaryValue, { color: theme.color.okInk }]}>{done}/{order.totalLines}</Text>
          <Text style={od.summaryLabel}>RESOLVED</Text>
        </View>
        <View style={od.summaryDivider} />
        <View style={od.summaryItem}>
          <Text style={[od.summaryValue, isPriorityHigh && { color: theme.color.warnPrimary }]}>
            {isPriorityHigh ? "HIGH" : "NORMAL"}
          </Text>
          <Text style={od.summaryLabel}>PRIORITY</Text>
        </View>
      </View>

      <ProgressIndicator done={done} total={order.lines.length} />
      <ErrorBanner message={error} />

      {/* Picking Manifest */}
      <SectionHeader title="Picking Manifest" hint={`${order.lines.length} items in route order`} />
      {order.lines.map((l, idx) => {
        const isPicked = l.status === "PICKED";
        return (
          <View key={l.id} style={[od.lineCard, isPicked && od.lineCardPicked]}>
            {/* Line number indicator */}
            <View style={[od.lineNumberBox, isPicked && od.lineNumberBoxPicked]}>
              <Text style={od.lineNumber}>{idx + 1}</Text>
              {isPicked ? (
                <Ionicons name="checkmark-circle" size={14} color="#ffffff" style={{ marginTop: 2 }} />
              ) : null}
            </View>
            <View style={od.lineContent}>
              {/* SKU code & status */}
              <View style={od.skuBlock}>
                <View style={od.skuCodeTag}>
                  <Ionicons name="barcode-outline" size={14} color={theme.colors.sku.icon} />
                  <Text style={od.skuCode}>{l.skuCode}</Text>
                </View>
                <StatusBadge text={l.status} tone={toneForLineStatus(l.status)} />
              </View>
              <Text style={od.skuName}>{l.skuName}</Text>
              {l.productSpecs ? <Text style={od.specs}>{l.productSpecs}</Text> : null}

              {/* Location tag and Quantity row */}
              <View style={od.locRow}>
                <View style={od.locTag}>
                  <Ionicons name="location-outline" size={14} color={theme.colors.location.icon} />
                  <Text style={od.locCode}>{l.locationCode}</Text>
                </View>
                <View style={od.qtyBadge}>
                  <Text style={od.qtyText}>
                    Required: <Text style={{ fontWeight: "700", color: theme.color.ink }}>{l.requiredQty} {l.uom}</Text>
                  </Text>
                  <Text style={od.qtyPicked}>
                    Picked: <Text style={{ fontWeight: "700" }}>{l.pickedQty}</Text>
                  </Text>
                </View>
              </View>
            </View>
          </View>
        );
      })}

      <Divider />
      {order.status === "ASSIGNED" ? (
        order.assignedPickerCode !== picker?.id ? (
          <ErrorBanner message={`Assigned to ${order.assignedPickerCode}. Pick another order.`} />
        ) : (
          <PrimaryButton
            label={busy ? "Starting…" : "START PICKING"}
            icon="play-circle"
            onPress={onBegin}
            disabled={busy}
          />
        )
      ) : order.status === "IN_PROGRESS" ? (
        <PrimaryButton
          label="CONTINUE PICKING"
          icon="arrow-forward-circle"
          onPress={() => router.replace(pickStepPath(order.id, order) as never)}
        />
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
    paddingVertical: theme.space.xs,
  },
  orderId: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    fontSize: 20,
  },
  orderMeta: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
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
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.color.ink,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.color.muted,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.color.line,
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
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  lineCardPicked: {
    borderColor: theme.color.okBorder,
    backgroundColor: "#fafdfb",
  },
  lineNumberBox: {
    width: 38,
    backgroundColor: theme.color.primaryContainer,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  lineNumberBoxPicked: {
    backgroundColor: theme.color.okPrimary,
  },
  lineNumber: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
  },
  lineContent: {
    flex: 1,
    padding: theme.space.sm,
  },
  skuBlock: {
    alignItems: "flex-start",
    alignSelf: "stretch",
    gap: 6,
    minWidth: 0,
  },
  skuCodeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.sku.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  skuCode: {
    ...(theme.type.codeMd as object),
    color: theme.colors.sku.text,
    fontSize: 13,
    flexShrink: 1,
    minWidth: 0,
  },
  skuName: {
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    fontWeight: "600",
    marginTop: 4,
  },
  specs: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.space.xs,
    flexWrap: "wrap",
    gap: 6,
  },
  locTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.location.bg,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  locCode: {
    ...(theme.type.codeMd as object),
    color: theme.colors.location.text,
    fontSize: 13,
  },
  qtyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  qtyText: {
    fontSize: 12,
    color: theme.color.muted,
  },
  qtyPicked: {
    fontSize: 12,
    color: theme.color.okInk,
  },
});

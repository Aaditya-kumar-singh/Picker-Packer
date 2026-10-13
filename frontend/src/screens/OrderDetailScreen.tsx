// Order Detail + START PICKING.
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  ErrorState,
  LoadingState,
  PrimaryButton,
  ProgressIndicator,
  Screen,
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

      {/* Order header */}
      <View style={od.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={od.orderId}>{order.externalId}</Text>
          <Text style={od.orderMeta}>
            {isPriorityHigh ? "High" : "Standard"} priority • {order.totalLines} lines
          </Text>
        </View>
        <StatusBadge text={order.status} tone={toneForOrderStatus(order.status)} />
      </View>

      {/* Summary stats */}
      <View style={od.summaryRow}>
        <View style={od.summaryItem}>
          <Text style={od.summaryValue}>{order.totalLines}</Text>
          <Text style={od.summaryLabel}>Total</Text>
        </View>
        <View style={od.summaryDivider} />
        <View style={od.summaryItem}>
          <Text style={[od.summaryValue, { color: theme.color.okInk }]}>{done}</Text>
          <Text style={od.summaryLabel}>Done</Text>
        </View>
        <View style={od.summaryDivider} />
        <View style={od.summaryItem}>
          <Text style={[od.summaryValue, isPriorityHigh && { color: theme.color.warnPrimary }]}>
            {isPriorityHigh ? "HIGH" : "STD"}
          </Text>
          <Text style={od.summaryLabel}>Priority</Text>
        </View>
      </View>

      <ProgressIndicator done={done} total={order.lines.length} />
      <ErrorBanner message={error} />

      {/* Pick lines */}
      {order.lines.map((l, idx) => {
        const isPicked = l.status === "PICKED";
        return (
          <View key={l.id} style={[od.lineCard, isPicked && od.lineCardPicked]}>
            <View style={[od.lineNumberBox, isPicked && od.lineNumberBoxPicked]}>
              <Text style={od.lineNumber}>{idx + 1}</Text>
            </View>
            <View style={od.lineContent}>
              <View style={od.lineTopRow}>
                <View style={od.skuCodeTag}>
                  <Text style={od.skuCode}>{l.skuCode}</Text>
                </View>
                <StatusBadge text={l.status} tone={toneForLineStatus(l.status)} />
              </View>
              <Text style={od.skuName} numberOfLines={2}>{l.skuName}</Text>
              <View style={od.lineBottom}>
                <View style={od.locTag}>
                  <Ionicons name="location-outline" size={12} color={theme.colors.location.icon} />
                  <Text style={od.locCode}>{l.locationCode}</Text>
                </View>
                <Text style={od.qtyText}>
                  {l.pickedQty}/{l.requiredQty} {l.uom}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      {/* Action button */}
      <View style={{ marginTop: 4 }}>
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
      </View>
    </Screen>
  );
}

const od = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  orderId: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    fontSize: 18,
  },
  orderMeta: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: "row",
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 10,
    marginBottom: 4,
    alignItems: "center",
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.color.ink,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.color.muted,
    marginTop: 1,
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.color.line,
  },
  lineCard: {
    flexDirection: "row",
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.color.line,
    overflow: "hidden",
  },
  lineCardPicked: {
    borderColor: theme.color.okBorder,
    backgroundColor: "#fafdfb",
  },
  lineNumberBox: {
    width: 32,
    backgroundColor: theme.color.primaryContainer,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 6,
  },
  lineNumberBoxPicked: {
    backgroundColor: theme.color.okPrimary,
  },
  lineNumber: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },
  lineContent: {
    flex: 1,
    padding: 10,
  },
  lineTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  skuCodeTag: {
    backgroundColor: theme.colors.sku.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  skuCode: {
    ...(theme.type.codeMd as object),
    color: theme.colors.sku.text,
    fontSize: 12,
  },
  skuName: {
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    fontWeight: "600",
    marginTop: 4,
  },
  lineBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  locTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: theme.colors.location.bg,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  locCode: {
    ...(theme.type.codeMd as object),
    color: theme.colors.location.text,
    fontSize: 12,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.color.muted,
  },
});

import { Text } from "@/components/Typography";
// Picker Dashboard — cross-device responsive Home screen (Android, iOS & Web).
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  theme,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { pickerAppApi } from "@/api/pickerAppApi";
import type { FulfillmentOrderDto, PickerStatsDto } from "@/types";
import {
  formatOrderDate,
  getCubePalette,
  getOrderProgress,
  getWarehouseDisplay,
} from "@/utils/warehouse";

export function DashboardScreen() {
  const { picker } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const [orders, setOrders] = useState<FulfillmentOrderDto[]>([]);
  const [stats, setStats] = useState<PickerStatsDto | null>(null);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedStats, fetchedOrders, fetchedHistoryCount] = await Promise.all([
        pickerAppApi.getStats(),
        pickerAppApi.getAssignedOrders(),
        pickerAppApi.getHistoryOrderCount().catch(() => null),
      ]);
      setStats(fetchedStats);
      setOrders(fetchedOrders || []);
      setHistoryCount(fetchedHistoryCount);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load assigned work.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const warehouseId = orders[0]?.warehouseId ?? picker?.warehouseId;
  const warehouseName = orders[0]?.warehouseName ?? picker?.warehouseName;
  const wh = getWarehouseDisplay(warehouseId, warehouseName);
  const assignedList = orders;
  // The stats count also includes PACKING; this card links to the PICKING queue.
  const assignedTotal = assignedList.length;
  const inProgressCount = assignedList.filter((o) => o.totalItemsScanned > 0).length;
  const itemsToPickCount = assignedList.reduce(
    (sum, o) =>
      sum +
      (o.items || []).reduce((lineSum, l) => lineSum + Math.max(0, l.orderedQty - l.pickedQty), 0),
    0
  );

  const heroOrder = assignedList[0] ?? null;
  const heroProgress = heroOrder ? getOrderProgress(heroOrder) : null;

  return (
    <View style={ds.screen}>
      <ScrollView
        style={ds.scroll}
        contentContainerStyle={ds.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading && orders.length > 0}
            onRefresh={() => void load()}
            tintColor="#0D6EFD"
            colors={["#0D6EFD"]}
          />
        }
      >
        {loading && orders.length === 0 && !stats ? (
          <LoadingState label="Loading dashboard…" />
        ) : error && orders.length === 0 ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : (
          <>
            {/* Warehouse Location Banner Card */}
            {warehouseId != null || warehouseName ? <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Assigned warehouse ${wh.name}`}
              onPress={() => router.push("/profile" as never)}
              style={({ pressed }) => [ds.warehouseCard, pressed && ds.cardPressed]}
            >
              <View style={ds.warehouseIconWrap}>
                <Ionicons name="business" size={21} color="#1565C0" />
              </View>
              <View style={ds.warehouseCopy}>
                <View style={ds.warehouseTitleRow}>
                  <Text
                    style={ds.warehouseTitle}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                  >
                    {wh.name}
                  </Text>
                  <Ionicons name="chevron-down" size={15} color="#0F172A" />
                </View>
                <Text
                  style={ds.warehouseAddress}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.15}
                >
                  {wh.address}
                </Text>
              </View>
              <View style={ds.warehousePinBtn}>
                <Ionicons name="location-sharp" size={17} color="#0F172A" />
              </View>
            </Pressable> : null}

            {/* 4 KPI Summary Cards Row */}
            <View style={[ds.kpiGrid, compact && { gap: 6 }]}>
              <Pressable
                style={({ pressed }) => [
                  ds.kpiCard,
                  compact && ds.kpiCardCompact,
                  pressed && ds.metricPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Assigned orders, ${assignedTotal}`}
                onPress={() => router.push("/orders" as never)}
              >
                <View style={[ds.kpiIconCircle, { backgroundColor: "#E0F2FE" }]}>
                  <Ionicons name="clipboard-outline" size={17} color="#0284C7" />
                </View>
                <Text
                  style={[ds.kpiValue, compact && { fontSize: 19 }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {assignedTotal}
                </Text>
                <View style={ds.kpiLabelRow}>
                  <View style={ds.kpiTextCol}>
                    <Text
                      style={ds.kpiLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      maxFontSizeMultiplier={1.1}
                    >
                      Assigned
                    </Text>
                    <Text
                      style={ds.kpiSubLabel}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.1}
                    >
                      Orders
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="#64748B" />
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  ds.kpiCard,
                  compact && ds.kpiCardCompact,
                  pressed && ds.metricPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`In Progress orders, ${inProgressCount}`}
                onPress={() =>
                  router.push(
                    (heroOrder ? `/order/${heroOrder.orderId}` : "/orders") as never
                  )
                }
              >
                <View style={[ds.kpiIconCircle, { backgroundColor: "#FFEDD5" }]}>
                  <Ionicons name="cube" size={17} color="#EA580C" />
                </View>
                <Text
                  style={[ds.kpiValue, compact && { fontSize: 19 }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {inProgressCount}
                </Text>
                <View style={ds.kpiLabelRow}>
                  <View style={ds.kpiTextCol}>
                    <Text
                      style={ds.kpiLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      maxFontSizeMultiplier={1.1}
                    >
                      In Progress
                    </Text>
                    <Text
                      style={ds.kpiSubLabel}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.1}
                    >
                      Orders
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="#64748B" />
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  ds.kpiCard,
                  compact && ds.kpiCardCompact,
                  pressed && ds.metricPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`History, ${historyCount ?? "unavailable"} orders`}
                onPress={() => router.push("/completed-orders" as never)}
              >
                <View style={[ds.kpiIconCircle, { backgroundColor: "#DCFCE7" }]}>
                  <Ionicons name="checkmark-circle" size={17} color="#16A34A" />
                </View>
                <Text
                  style={[ds.kpiValue, compact && { fontSize: 19 }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {historyCount ?? "–"}
                </Text>
                <View style={ds.kpiLabelRow}>
                  <View style={ds.kpiTextCol}>
                    <Text
                      style={ds.kpiLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      maxFontSizeMultiplier={1.1}
                    >
                      History
                    </Text>
                    <Text
                      style={ds.kpiSubLabel}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.1}
                    >
                      Orders
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="#64748B" />
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  ds.kpiCard,
                  compact && ds.kpiCardCompact,
                  pressed && ds.metricPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Items to pick, ${itemsToPickCount}`}
                onPress={() => router.push("/orders" as never)}
              >
                <View style={[ds.kpiIconCircle, { backgroundColor: "#F3E8FF" }]}>
                  <Ionicons name="list" size={17} color="#9333EA" />
                </View>
                <Text
                  style={[ds.kpiValue, compact && { fontSize: 19 }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {itemsToPickCount}
                </Text>
                <View style={ds.kpiLabelRow}>
                  <View style={ds.kpiTextCol}>
                    <Text
                      style={ds.kpiLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      maxFontSizeMultiplier={1.1}
                    >
                      Items to Pick
                    </Text>
                    <Text
                      style={ds.kpiSubLabel}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.1}
                    >
                      Units
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="#64748B" />
                </View>
              </Pressable>
            </View>

            {/* Active Order Hero Card */}
            {heroOrder && heroProgress ? (
              <View style={ds.activeCard}>
                <View style={ds.activeTopRow}>
                  <View style={ds.activeOrderBadge}>
                    <Text style={ds.activeOrderBadgeText} maxFontSizeMultiplier={1.1}>
                      ACTIVE ORDER
                    </Text>
                  </View>
                  <View style={ds.inProgressPill}>
                    <Ionicons name="time" size={13} color="#C2410C" />
                    <Text style={ds.inProgressPillText} maxFontSizeMultiplier={1.1}>
                      {heroOrder.totalItemsScanned > 0 ? "IN PROGRESS" : "ASSIGNED"}
                    </Text>
                  </View>
                </View>

                <View style={ds.activeTitleRow}>
                  <View style={ds.activeTitleCol}>
                    <Text
                      style={[ds.activeOrderId, compact && { fontSize: 20 }]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                    >
                      {heroOrder.orderNumber}
                    </Text>
                    <Text
                      style={ds.activeMeta}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                    >
                      {heroProgress.totalLines} item line(s) • ₹{heroOrder.grandTotal.toFixed(2)} ({heroOrder.paymentMethod})
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#334155" />
                </View>

                <View style={ds.activeProgressRow}>
                  <View style={ds.activeProgressTrack}>
                    <View
                      style={[
                        ds.activeProgressFill,
                        {
                          width: `${Math.max(
                            heroProgress.pct,
                            heroOrder.totalItemsScanned > 0 ? 8 : 0
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <View style={ds.activeProgressNumbers}>
                    <Text style={ds.activeFractionText} maxFontSizeMultiplier={1.1}>
                      {heroProgress.pickedLines}/{heroProgress.totalLines} lines picked
                    </Text>
                    <Text style={ds.activePctText} maxFontSizeMultiplier={1.1}>
                      {heroProgress.pct}%
                    </Text>
                  </View>
                </View>

                <View style={ds.activeFooterRow}>
                  <View style={ds.activeWarehouseInfo}>
                    <View style={ds.activeWhPinCircle}>
                      <Ionicons name="business" size={15} color="#1565C0" />
                    </View>
                    <View style={ds.activeWhTextCol}>
                      <Text style={ds.activeWhLabel} maxFontSizeMultiplier={1.1}>
                        Warehouse
                      </Text>
                      <Text
                        style={ds.activeWhName}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {getWarehouseDisplay(heroOrder.warehouseId, heroOrder.warehouseName).name}
                      </Text>
                      <Text
                        style={ds.activeWhAddr}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {getWarehouseDisplay(heroOrder.warehouseId, heroOrder.warehouseName).shortAddress}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Continue Picking"
                    onPress={() => router.push(`/order/${heroOrder.orderId}` as never)}
                    style={({ pressed }) => [
                      ds.continueBtn,
                      compact && { paddingHorizontal: 12 },
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
                    <Text style={ds.continueBtnText} maxFontSizeMultiplier={1.1}>
                      Continue Picking
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* My Assigned Orders Section */}
            <View style={ds.sectionHeaderRow}>
              <Text style={ds.sectionTitle} maxFontSizeMultiplier={1.15}>
                My Assigned Orders
                {assignedList.length > 0 ? ` (${assignedList.length})` : ""}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View all assigned orders"
                onPress={() => router.push("/orders" as never)}
                style={({ pressed }) => [ds.viewAllBtn, pressed && { opacity: 0.75 }]}
              >
                <Text style={ds.viewAllText} maxFontSizeMultiplier={1.1}>
                  View All
                </Text>
                <Ionicons name="chevron-forward" size={15} color="#1565C0" />
              </Pressable>
            </View>

            {assignedList.length === 0 ? (
              <EmptyState
                title="No Assigned Orders"
                body="New orders assigned to your station will appear here."
                actionLabel="Refresh"
                onAction={() => void load()}
              />
            ) : (
              assignedList.slice(0, 6).map((order, idx) => {
                const palette = getCubePalette(order, idx);
                const prog = getOrderProgress(order);
                const isHighlighted = idx === 0;

                return (
                  <Pressable
                    key={order.orderId}
                    accessibilityRole="button"
                    accessibilityLabel={`Order ${order.orderNumber}`}
                    onPress={() => router.push(`/order/${order.orderId}` as never)}
                    style={({ pressed }) => [
                      ds.orderCard,
                      isHighlighted && ds.orderCardHighlighted,
                      pressed && ds.cardPressed,
                    ]}
                  >
                    <View
                      style={[
                        ds.orderCubeCircle,
                        { backgroundColor: palette.bg },
                      ]}
                    >
                      <Ionicons name="cube" size={21} color={palette.icon} />
                    </View>

                    <View style={ds.orderMain}>
                      <View style={ds.orderTopLine}>
                        <Text
                          style={ds.orderNumber}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.15}
                        >
                          {order.orderNumber}
                        </Text>
                        <View style={[ds.priorityPill, { backgroundColor: "#E0F2FE" }]}>
                          <Text
                            style={[ds.priorityPillText, { color: "#0284C7" }]}
                            maxFontSizeMultiplier={1.1}
                          >
                            {order.paymentMethod || "PREPAID"}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={ds.orderSubMeta}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {prog.totalLines} lines • ₹{order.grandTotal.toFixed(2)}
                      </Text>
                      {order.items && order.items.length > 0 ? (
                        <Text style={ds.orderProductPreview} numberOfLines={2} maxFontSizeMultiplier={1.1}>
                          {order.items.slice(0, 2).map((item) => item.productName).join(" • ")}
                          {order.items.length > 2 ? ` +${order.items.length - 2} more` : ""}
                        </Text>
                      ) : null}

                      <View style={ds.orderLocationRow}>
                        <Ionicons
                          name="location-sharp"
                          size={13}
                          color="#475569"
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={ds.orderLocationText}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.15}
                        >
                          {getWarehouseDisplay(order.warehouseId, order.warehouseName).name}
                        </Text>
                      </View>
                    </View>

                    <View style={ds.orderRightCol}>
                      <Text style={ds.orderItemsRatio} maxFontSizeMultiplier={1.1}>
                        {prog.pickedLines}/{prog.totalLines} lines
                      </Text>
                      <View style={ds.orderMiniProgressRow}>
                        <View style={ds.orderMiniTrack}>
                          <View
                            style={[
                              ds.orderMiniFill,
                              { width: `${prog.pct}%` },
                            ]}
                          />
                        </View>
                        <Text style={ds.orderMiniPct} maxFontSizeMultiplier={1.1}>
                          {prog.pct}%
                        </Text>
                      </View>
                      <View style={ds.pickByRow}>
                        <Ionicons
                          name="calendar-outline"
                          size={12}
                          color="#64748B"
                          style={{ marginRight: 3 }}
                        />
                        <Text style={ds.pickByLabel} maxFontSizeMultiplier={1.1}>
                          {formatOrderDate(order.orderDate)}
                        </Text>
                      </View>
                    </View>

                    <Ionicons name="chevron-forward" size={16} color="#64748B" />
                  </Pressable>
                );
              })
            )}

            {error ? (
              <Text style={ds.stale}>Notice: {error}</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const ds = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 28,
  },
  warehouseCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECF4FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D4E4FF",
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 12,
  },
  warehouseIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#D0E3FF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  warehouseCopy: {
    flex: 1,
    marginHorizontal: 10,
  },
  warehouseTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  warehouseTitle: { fontFamily: "OpenSans",
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    flexShrink: 1,
  },
  warehouseAddress: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  },
  warehousePinBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D4E4FF",
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  kpiGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  kpiCardCompact: {
    padding: 8,
  },
  metricPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  kpiIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
  },
  kpiLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  kpiTextCol: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  kpiSubLabel: {
    fontSize: 10,
    color: "#64748B",
  },
  activeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  activeTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  activeOrderBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeOrderBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1D4ED8",
    letterSpacing: 0.5,
  },
  inProgressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  inProgressPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#C2410C",
  },
  activeTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  activeTitleCol: {
    flex: 1,
  },
  activeOrderId: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
  },
  activeMeta: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  },
  activeProgressRow: {
    marginBottom: 12,
  },
  activeProgressTrack: {
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 4,
  },
  activeProgressFill: {
    height: "100%",
    backgroundColor: "#0D6EFD",
    borderRadius: 4,
  },
  activeProgressNumbers: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  activeFractionText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  activePctText: {
    fontSize: 11,
    color: "#0D6EFD",
    fontWeight: "800",
  },
  activeFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  activeWarehouseInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  activeWhPinCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  activeWhTextCol: {
    flex: 1,
  },
  activeWhLabel: {
    fontSize: 9,
    color: "#94A3B8",
    fontWeight: "700",
  },
  activeWhName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  activeWhAddr: {
    fontSize: 10,
    color: "#64748B",
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0D6EFD",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  continueBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: "OpenSans",
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1565C0",
  },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  orderCardHighlighted: {
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FAFF",
  },
  orderCubeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  orderMain: {
    flex: 1,
    marginRight: 8,
  },
  orderTopLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  priorityPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  priorityPillText: {
    fontSize: 9,
    fontWeight: "700",
  },
  orderSubMeta: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
  orderProductPreview: {
    fontSize: 11,
    color: "#334155",
    marginTop: 2,
  },
  orderLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  orderLocationText: {
    fontSize: 10,
    color: "#64748B",
  },
  orderRightCol: {
    alignItems: "flex-end",
    marginRight: 6,
  },
  orderItemsRatio: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
  },
  orderMiniProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  orderMiniTrack: {
    width: 40,
    height: 5,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    overflow: "hidden",
  },
  orderMiniFill: {
    height: "100%",
    backgroundColor: "#0D6EFD",
    borderRadius: 3,
  },
  orderMiniPct: {
    fontSize: 9,
    color: "#64748B",
    fontWeight: "700",
  },
  pickByRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  pickByLabel: {
    fontSize: 10,
    color: "#64748B",
  },
  stale: {
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 8,
  },
});

// Picker Dashboard — cross-device responsive Home screen (Android, iOS & Web).
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  theme,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { pickerRepository } from "@/repositories/pickerRepository";
import { useSyncStatus } from "@/sync/SyncContext";
import type { DashboardData } from "@/services/pickerApi";
import {
  formatPickByTime,
  getBatchCount,
  getCubePalette,
  getOrderProgress,
  getPriorityMeta,
  getWarehouseDisplay,
} from "@/utils/warehouse";

export function DashboardScreen() {
  const { picker } = useAuth();
  const { status: sync } = useSyncStatus();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await pickerRepository.getDashboard();
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else {
      setError(r.apiError.message);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const wh = getWarehouseDisplay(data?.warehouseName ?? picker?.warehouseId);
  const assignedList = data?.assignedOrders ?? (data?.activeOrder ? [data.activeOrder] : []);
  const assignedTotal =
    assignedList.length || (data?.pendingCount ?? 0) + (data?.inProgressCount ?? 0);
  const inProgressCount =
    data?.inProgressCount ??
    assignedList.filter((o) => o.status === "IN_PROGRESS").length;
  const completedCount = data?.metrics?.ordersPicked ?? data?.completedToday ?? 0;
  const itemsToPickCount =
    data?.itemsToPickCount ??
    assignedList.reduce(
      (sum, o) =>
        sum +
        o.lines.reduce((lineSum, l) => lineSum + Math.max(0, l.requiredQty - l.pickedQty), 0),
      0,
    );

  const heroOrder = data?.activeOrder ?? assignedList[0] ?? null;
  const heroProgress = heroOrder ? getOrderProgress(heroOrder) : null;
  const heroBatches = heroOrder ? getBatchCount(heroOrder.lines, heroOrder.totalLines) : 0;
  const heroPriority = heroOrder ? getPriorityMeta(heroOrder.priority) : null;

  return (
    <View style={ds.screen}>
      <ScrollView
        style={ds.scroll}
        contentContainerStyle={ds.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading && Boolean(data)}
            onRefresh={() => void load()}
            tintColor="#0D6EFD"
            colors={["#0D6EFD"]}
          />
        }
      >
        {loading && !data ? (
          <LoadingState label="Loading dashboard…" />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : !data ? (
          <EmptyState
            title="No dashboard data"
            body="Reconnect to load your assigned work."
            actionLabel="Retry"
            onAction={() => void load()}
          />
        ) : (
          <>
            {/* Warehouse Location Banner Card */}
            <Pressable
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
            </Pressable>

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
                    (heroOrder ? `/order/${heroOrder.id}` : "/orders") as never,
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
                accessibilityLabel={`Completed orders, ${completedCount}`}
                onPress={() => router.push("/completed-orders" as never)}
              >
                <View style={[ds.kpiIconCircle, { backgroundColor: "#DCFCE7" }]}>
                  <Ionicons name="checkmark-circle" size={17} color="#16A34A" />
                </View>
                <Text
                  style={[ds.kpiValue, compact && { fontSize: 19 }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {completedCount}
                </Text>
                <View style={ds.kpiLabelRow}>
                  <View style={ds.kpiTextCol}>
                    <Text
                      style={ds.kpiLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      maxFontSizeMultiplier={1.1}
                    >
                      Completed
                    </Text>
                    <Text
                      style={ds.kpiSubLabel}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.1}
                    >
                      Today
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
                      Across orders
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="#64748B" />
                </View>
              </Pressable>
            </View>

            {/* Active Order Hero Card */}
            {heroOrder && heroProgress && heroPriority ? (
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
                      {heroOrder.status === "IN_PROGRESS" ? "IN PROGRESS" : "ASSIGNED"}
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
                      {heroOrder.externalId}
                    </Text>
                    <Text
                      style={ds.activeMeta}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                    >
                      {heroProgress.totalLines} items  •  {heroBatches} batches  •{" "}
                      {heroPriority.shortLabel} priority
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
                            heroOrder.status === "IN_PROGRESS" ? 8 : 0,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <View style={ds.activeProgressNumbers}>
                    <Text style={ds.activeFractionText} maxFontSizeMultiplier={1.1}>
                      {heroProgress.pickedLines}/{heroProgress.totalLines} items
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
                        {wh.name}
                      </Text>
                      <Text
                        style={ds.activeWhAddr}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {wh.shortAddress}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Continue Picking"
                    onPress={() => router.push(`/order/${heroOrder.id}` as never)}
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
                const pMeta = getPriorityMeta(order.priority);
                const prog = getOrderProgress(order);
                const batches = getBatchCount(order.lines, order.totalLines);
                const isHighlighted = idx === 0 || order.priority >= 2;

                return (
                  <Pressable
                    key={order.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Order ${order.externalId}`}
                    onPress={() => router.push(`/order/${order.id}` as never)}
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
                          {order.externalId}
                        </Text>
                        <View
                          style={[
                            ds.priorityPill,
                            { backgroundColor: pMeta.bg },
                          ]}
                        >
                          <Text
                            style={[
                              ds.priorityPillText,
                              { color: pMeta.text },
                            ]}
                            maxFontSizeMultiplier={1.1}
                          >
                            {pMeta.label}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={ds.orderSubMeta}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {prog.totalLines} items  •  {batches} batches
                      </Text>
                      {order.lines.length > 0 ? (
                        <Text style={ds.orderProductPreview} numberOfLines={2} maxFontSizeMultiplier={1.1}>
                          {order.lines.slice(0, 2).map((line) => line.skuName).join(" • ")}
                          {order.lines.length > 2 ? " +" + (order.lines.length - 2) + " more" : ""}
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
                          {wh.name}
                        </Text>
                      </View>
                    </View>

                    <View style={ds.orderRightCol}>
                      <Text style={ds.orderItemsRatio} maxFontSizeMultiplier={1.1}>
                        {prog.pickedLines}/{prog.totalLines} items
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
                          name="time-outline"
                          size={12}
                          color="#64748B"
                          style={{ marginRight: 3 }}
                        />
                        <Text style={ds.pickByLabel} maxFontSizeMultiplier={1.1}>
                          Pick by{" "}
                          <Text style={ds.pickByTime}>
                            {formatPickByTime(order.slaDueAt)}
                          </Text>
                        </Text>
                      </View>
                    </View>

                    <Ionicons name="chevron-forward" size={16} color="#64748B" />
                  </Pressable>
                );
              })
            )}

            {error ? (
              <Text style={ds.stale}>Showing last loaded data — {error}</Text>
            ) : null}

            {sync.connectivity !== "ONLINE" && sync.connectivity !== "CHECKING" ? (
              <View style={ds.offlineBanner}>
                <View style={ds.offlineDot} />
                <Text style={ds.offlineText}>
                  Offline — changes sync automatically when connected
                </Text>
              </View>
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
  warehouseTitle: {
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
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kpiGrid: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 9,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  kpiCardCompact: {
    paddingHorizontal: 7,
    paddingVertical: 9,
  },
  kpiIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  kpiValue: {
    fontSize: 21,
    fontWeight: "900",
    color: "#0F172A",
    lineHeight: 25,
  },
  kpiLabelRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 2,
  },
  kpiTextCol: {
    flex: 1,
    paddingRight: 2,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E293B",
  },
  kpiSubLabel: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 1,
  },
  metricPressed: {
    opacity: 0.85,
  },
  cardPressed: {
    opacity: 0.92,
  },
  activeCard: {
    width: "100%",
    backgroundColor: "#F2F7FF",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    padding: 14,
    marginBottom: 16,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  activeTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  activeOrderBadge: {
    backgroundColor: "#0D6EFD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeOrderBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  inProgressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFEDD5",
    borderWidth: 1,
    borderColor: "#FED7AA",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  inProgressPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#C2410C",
    letterSpacing: 0.4,
  },
  activeTitleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeTitleCol: {
    flex: 1,
    paddingRight: 8,
  },
  activeOrderId: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.3,
  },
  activeMeta: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
    marginTop: 2,
  },
  activeProgressRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 11,
    marginBottom: 13,
  },
  activeProgressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#DBEAFE",
    overflow: "hidden",
  },
  activeProgressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1D76DB",
  },
  activeProgressNumbers: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  activeFractionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  activePctText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1565C0",
  },
  activeFooterRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#DBEAFE",
  },
  activeWarehouseInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  activeWhPinCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 8,
  },
  activeWhTextCol: {
    flex: 1,
  },
  activeWhLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "600",
  },
  activeWhName: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },
  activeWhAddr: {
    fontSize: 11,
    color: "#64748B",
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0D6EFD",
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 12,
    flexShrink: 0,
  },
  continueBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  sectionHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1565C0",
  },
  orderCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  orderCardHighlighted: {
    backgroundColor: "#FFFDF6",
    borderColor: "#FCD34D",
    borderWidth: 1.5,
  },
  orderCubeCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  orderMain: {
    flex: 1,
    marginHorizontal: 10,
  },
  orderTopLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  priorityPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  orderSubMeta: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  orderProductPreview: {
    fontSize: 11,
    lineHeight: 14,
    color: "#0F766E",
    fontWeight: "700",
    marginTop: 3,
  },
  orderLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  orderLocationText: {
    flex: 1,
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  orderRightCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 4,
  },
  orderItemsRatio: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  orderMiniProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  orderMiniTrack: {
    width: 50,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  orderMiniFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1D76DB",
  },
  orderMiniPct: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1565C0",
    minWidth: 26,
    textAlign: "right",
  },
  pickByRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  pickByLabel: {
    fontSize: 11,
    color: "#64748B",
  },
  pickByTime: {
    fontWeight: "800",
    color: "#0F172A",
  },
  stale: {
    marginTop: 8,
    color: theme.color.secondary,
    ...(theme.type.secondary as object),
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.md,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.critical,
  },
  offlineText: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    flex: 1,
  },
});

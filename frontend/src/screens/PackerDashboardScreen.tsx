import { Text, TextInput } from "@/components/Typography";
// Packer Dashboard & Assigned Packing Orders per packer-app-api.md
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  theme,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { packerAppApi } from "@/api/packerAppApi";
import type { FulfillmentOrderDto } from "@/types";
import {
  CUBE_PALETTES,
  formatOrderDate,
  getWarehouseDisplay,
} from "@/utils/warehouse";

type PackerSortMode = "order" | "date" | "items";

function getPackerStatsSummary(order: FulfillmentOrderDto) {
  const itemCount = order.items?.length || order.totalItems || 0;
  const totalUnits =
    order.items && order.items.length > 0
      ? order.items.reduce((sum, i) => sum + i.orderedQty, 0)
      : itemCount;
  const packedUnits =
    order.items && order.items.length > 0
      ? order.items.reduce((sum, i) => sum + (i.packedQty ?? 0), 0)
      : order.totalItemsScanned;
  const pct =
    totalUnits > 0 ? Math.min(100, Math.round((packedUnits / totalUnits) * 100)) : 0;
  return { itemCount, totalUnits, packedUnits, pct };
}

export function PackerDashboardScreen({
  mode = "home",
}: {
  mode?: "home" | "orders";
}) {
  const { picker } = useAuth();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const packedOnly = mode === "orders" && filter === "packed";
  const { width } = useWindowDimensions();
  const compact = width < 360;

  const [orders, setOrders] = useState<FulfillmentOrderDto[]>([]);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<PackerSortMode>("order");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedOrders, fetchedHistoryCount] = await Promise.all([
        packerAppApi.getAssignedOrders(),
        packerAppApi.getHistoryOrderCount().catch(() => null),
      ]);
      setOrders(fetchedOrders || []);
      setHistoryCount(fetchedHistoryCount);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load packing queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSearch("");
      void load();
    }, [load])
  );

  const warehouseId = orders[0]?.warehouseId ?? picker?.warehouseId;
  const warehouseName = orders[0]?.warehouseName ?? picker?.warehouseName;
  const wh = getWarehouseDisplay(warehouseId, warehouseName);
  const packedOrders = orders.filter((o) => o.orderStatus === "PACKED");

  const filteredOrders = useMemo(() => {
    const statusFiltered = packedOnly
      ? orders.filter((o) => o.orderStatus === "PACKED")
      : orders;
    const q = search.trim().toLowerCase();
    const base = q
      ? statusFiltered.filter((o) =>
          [
            o.orderNumber,
            String(o.orderId),
            o.paymentMethod,
            ...(o.items ?? []).flatMap((i) => [
              i.sku,
              i.productName,
              i.variantLabel ?? "",
            ]),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : statusFiltered;

    return [...base].sort((a, b) => {
      if (sortMode === "date") {
        return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
      }
      if (sortMode === "items") {
        return b.totalItems - a.totalItems;
      }
      return b.orderNumber.localeCompare(a.orderNumber);
    });
  }, [orders, packedOnly, search, sortMode]);

  function cycleSort() {
    setSortMode((prev) =>
      prev === "order" ? "date" : prev === "date" ? "items" : "order"
    );
  }

  const sortLabel =
    sortMode === "order"
      ? "Order #"
      : sortMode === "date"
        ? "Date"
        : "Items";

  // ── Mode 2: Assigned Packing Orders Tab (`/orders` for Packer) ──
  if (mode === "orders") {
    return (
      <View style={s.screen}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading && orders.length > 0}
              onRefresh={() => void load()}
              tintColor="#D95D00"
              colors={["#D95D00"]}
            />
          }
        >
          <View style={s.ordersHeaderRow}>
            <View style={s.ordersTitleLeft}>
              <Text
                style={[s.ordersPageTitle, compact && { fontSize: 18 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.15}
              >
                {packedOnly ? "Packed Orders" : "Assigned Packing Orders"}
              </Text>
              <View style={s.countPill}>
                <Text style={s.countPillText} maxFontSizeMultiplier={1.1}>
                  {filteredOrders.length}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort packing orders, current ${sortLabel}`}
              onPress={cycleSort}
              style={({ pressed }) => [s.sortBtn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="list-outline" size={15} color="#1E293B" />
              <Text style={s.sortBtnText} maxFontSizeMultiplier={1.1}>
                {sortLabel}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#475569" />
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={s.searchWrap}>
            <Ionicons
              name="search-outline"
              size={19}
              color="#64748B"
              style={{ marginRight: 8 }}
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search order, SKU, item..."
              placeholderTextColor="#94A3B8"
              style={s.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch("")} hitSlop={10}>
                <Ionicons name="close-circle" size={17} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>

          {packedOnly ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show all assigned packing orders"
              onPress={() => router.setParams({ filter: "all" })}
              style={s.activeFilter}
            >
              <Text style={s.activeFilterText}>Packed</Text>
              <Ionicons name="close-circle" size={17} color="#D95D00" />
            </Pressable>
          ) : null}

          <ErrorBanner message={error} />

          {loading && orders.length === 0 ? (
            <LoadingState label="Loading packing orders…" />
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              title={search ? "No Matching Orders" : packedOnly ? "No Packed Orders" : "No Packing Orders"}
              body={
                search
                  ? "Try a different search term."
                  : packedOnly
                    ? "Packed orders waiting for rider assignment will appear here."
                    : "Orders ready for packing will appear here when picked."
              }
              actionLabel={search ? "Clear Search" : packedOnly ? "Show All Orders" : "Refresh Queue"}
              onAction={
                search
                  ? () => setSearch("")
                  : packedOnly
                    ? () => router.setParams({ filter: "all" })
                    : () => void load()
              }
            />
          ) : (
            filteredOrders.map((o, idx) => {
              const palette = CUBE_PALETTES[idx % CUBE_PALETTES.length];
              const { itemCount, totalUnits, packedUnits, pct } =
                getPackerStatsSummary(o);
              const complete = o.orderStatus === "PACKED";

              return (
                <Pressable
                  key={o.orderId}
                  accessibilityRole="button"
                  accessibilityLabel={`Order ${o.orderNumber}`}
                  onPress={() => router.push(`/pack/order/${o.orderId}` as never)}
                  style={({ pressed }) => [
                    s.assignedCard,
                    pressed && s.cardPressed,
                  ]}
                >
                  <View style={s.assignedTopRow}>
                    <View
                      style={[
                        s.cubeSquareAvatar,
                        { backgroundColor: palette.bg },
                      ]}
                    >
                      <Ionicons name="cube" size={23} color={palette.icon} />
                    </View>

                    <View style={s.assignedTitleCol}>
                      <Text
                        style={s.orderId}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {o.orderNumber}
                      </Text>
                      <Text
                        style={s.customerText}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        ₹{o.grandTotal.toFixed(2)}, {o.paymentMethod}
                      </Text>
                      {(o.items?.length ?? 0) > 0 ? (
                        <Text style={s.productPreview} numberOfLines={2} maxFontSizeMultiplier={1.1}>
                          {o.items!.slice(0, 2).map((item) => item.productName).join(", ")}
                          {o.items!.length > 2 ? ` +${o.items!.length - 2} more` : ""}
                        </Text>
                      ) : null}
                    </View>

                    <View style={s.assignedProgressCol}>
                      <View style={s.ratioChevronRow}>
                        <Text style={s.unitsRatioText} maxFontSizeMultiplier={1.1}>
                          {packedUnits} / {totalUnits} units
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="#334155"
                        />
                      </View>

                      <View style={s.miniBarRow}>
                        <View style={s.miniBarTrack}>
                          <View
                            style={[s.miniBarFill, { width: `${pct}%` }]}
                          />
                        </View>
                        <Text style={s.miniPctText} maxFontSizeMultiplier={1.1}>
                          {pct}%
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View
                    style={[
                      s.assignedBottomRow,
                      !compact && { paddingLeft: 56 },
                    ]}
                  >
                    <View style={s.assignedMetaLeft}>
                      <View style={s.iconLine}>
                        <Ionicons
                          name="location-sharp"
                          size={14}
                          color="#334155"
                          style={s.lineIcon}
                        />
                        <Text
                          style={s.whNameText}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.15}
                        >
                          {getWarehouseDisplay(o.warehouseId, o.warehouseName).name}
                        </Text>
                      </View>

                      <Text
                        style={s.whAddrText}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {getWarehouseDisplay(o.warehouseId, o.warehouseName).shortAddress}, {formatOrderDate(o.orderDate)}
                      </Text>
                    </View>

                    <View
                      style={[
                        s.compactOrangeBtn,
                        complete && { backgroundColor: "#16A34A" },
                      ]}
                    >
                      <Ionicons name="cube-outline" size={16} color="#FFFFFF" />
                      <Text
                        style={s.compactOrangeBtnText}
                        maxFontSizeMultiplier={1.1}
                      >
                        {complete ? "Assign Rider" : "Start Packing"}
                      </Text>
                      <View style={s.whiteChevronCircleSmall}>
                        <Ionicons
                          name="chevron-forward"
                          size={12}
                          color={complete ? "#16A34A" : "#D95D00"}
                        />
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Mode 1: Packer Home Dashboard (`/packer-dashboard`) ──
  const heroOrder = orders[0] ?? null;
  const heroStats = heroOrder ? getPackerStatsSummary(heroOrder) : null;

  return (
    <View style={s.screen}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading && orders.length > 0}
            onRefresh={() => void load()}
            tintColor="#D95D00"
            colors={["#D95D00"]}
          />
        }
      >
        {/* Warehouse Card */}
        {warehouseId != null || warehouseName ? <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/profile" as never)}
          style={({ pressed }) => [s.warehouseCard, pressed && s.cardPressed]}
        >
          <View style={s.whIconBox}>
            <Ionicons name="business" size={20} color="#D95D00" />
          </View>
          <View style={s.whCopy}>
            <Text style={s.whTitle} numberOfLines={1}>
              {wh.name}
            </Text>
            <Text style={s.whSub} numberOfLines={1}>
              {wh.address}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#64748B" />
        </Pressable> : null}

        {/* Packer Metric KPI Cards */}
        <View style={s.metricsGrid}>
          <Pressable
            style={({ pressed }) => [s.metricCard, pressed && s.cardPressed]}
            onPress={() => router.push("/orders?filter=all" as never)}
          >
            <View style={[s.metricIconCircle, { backgroundColor: "#FFF2E6" }]}>
              <Ionicons name="cube" size={16} color="#D95D00" />
            </View>
            <Text style={s.metricVal}>{orders.length}</Text>
            <Text style={s.metricLabel}>Assigned</Text>
            <Text style={s.metricSub}>Orders</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.metricCard, pressed && s.cardPressed]}
            onPress={() => router.push("/orders?filter=packed" as never)}
          >
            <View style={[s.metricIconCircle, { backgroundColor: "#DCFCE7" }]}>
              <Ionicons name="checkmark-done" size={16} color="#16A34A" />
            </View>
            <Text style={s.metricVal}>{packedOrders.length}</Text>
            <Text style={s.metricLabel}>Packed</Text>
            <Text style={s.metricSub}>Ready for Rider</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.metricCard, pressed && s.cardPressed]}
            onPress={() => router.push("/completed-orders" as never)}
          >
            <View style={[s.metricIconCircle, { backgroundColor: "#E0F2FE" }]}>
              <Ionicons name="bicycle" size={16} color="#0284C7" />
            </View>
            <Text style={s.metricVal}>{historyCount ?? "–"}</Text>
            <Text style={s.metricLabel}>History</Text>
            <Text style={s.metricSub}>Orders</Text>
          </Pressable>
        </View>

        {/* Active Packing Order Hero Card */}
        {heroOrder && heroStats ? (
          <View style={s.heroCard}>
            <View style={s.heroTopRow}>
              <View style={s.heroBadge}>
                <Text style={s.heroBadgeText}>ACTIVE PACKING ORDER</Text>
              </View>
              <View style={[s.statusPill, heroOrder.orderStatus === "PACKED" && { backgroundColor: "#DCFCE7" }]}>
                <Text style={[s.statusPillText, heroOrder.orderStatus === "PACKED" && { color: "#16A34A" }]}>
                  {heroOrder.orderStatus}
                </Text>
              </View>
            </View>

            <Text style={s.heroOrderId}>{heroOrder.orderNumber}</Text>
            <Text style={s.heroMeta}>
              {heroStats.itemCount} items, ₹{heroOrder.grandTotal.toFixed(2)} ({heroOrder.paymentMethod})
            </Text>

            <View style={s.heroProgressTrack}>
              <View style={[s.heroProgressFill, { width: `${heroStats.pct}%` }]} />
            </View>
            <View style={s.heroProgressRow}>
              <Text style={s.heroProgressUnits}>{heroStats.packedUnits}/{heroStats.totalUnits} units packed</Text>
              <Text style={s.heroProgressPct}>{heroStats.pct}%</Text>
            </View>

            <Pressable
              style={s.heroBtn}
              onPress={() => router.push(`/pack/order/${heroOrder.orderId}` as never)}
            >
              <Ionicons name="cube-outline" size={18} color="#FFFFFF" />
              <Text style={s.heroBtnText}>
                {heroOrder.orderStatus === "PACKED" ? "Assign Rider" : "Continue Packing"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Packing Queue Section */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Packing Queue ({orders.length})</Text>
          <Pressable onPress={() => router.push("/orders?filter=all" as never)}>
            <Text style={s.viewAllLink}>View All</Text>
          </Pressable>
        </View>

        {loading && orders.length === 0 ? (
          <LoadingState label="Loading packing queue…" />
        ) : error && orders.length === 0 ? (
          <EmptyState
            title="Unable to load queue"
            body={error}
            actionLabel="Retry"
            onAction={() => void load()}
          />
        ) : orders.length === 0 ? (
          <EmptyState
            title="Packing Queue Clear"
            body="No orders currently waiting for packing at your station."
            actionLabel="Refresh"
            onAction={() => void load()}
          />
        ) : (
          orders.slice(0, 5).map((o, idx) => {
            const palette = CUBE_PALETTES[idx % CUBE_PALETTES.length];
            const u = getPackerStatsSummary(o);
            const isPacked = o.orderStatus === "PACKED";

            return (
              <Pressable
                key={o.orderId}
                onPress={() => router.push(`/pack/order/${o.orderId}` as never)}
                style={({ pressed }) => [s.queueCard, pressed && s.cardPressed]}
              >
                <View style={[s.queueIcon, { backgroundColor: palette.bg }]}>
                  <Ionicons name="cube" size={20} color={palette.icon} />
                </View>

                <View style={s.queueInfo}>
                  <Text style={s.queueTitle}>{o.orderNumber}</Text>
                  <Text style={s.queueSub}>
                    {u.itemCount} items, ₹{o.grandTotal.toFixed(2)}
                  </Text>
                  <Text style={s.queueDate}>{formatOrderDate(o.orderDate)}</Text>
                </View>

                <View style={s.queueRight}>
                  <Text style={s.queueProgressRatio}>{u.packedUnits}/{u.totalUnits}</Text>
                  <View style={[s.queueStatusPill, isPacked && { backgroundColor: "#DCFCE7" }]}>
                    <Text style={[s.queueStatusText, isPacked && { color: "#16A34A" }]}>
                      {isPacked ? "PACKED" : "PACKING"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
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
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8F2",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FFE4D0",
    marginBottom: 12,
  },
  whIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFEADA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  whCopy: {
    flex: 1,
  },
  whTitle: { fontFamily: "OpenSans",
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  whSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metricIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  metricVal: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    marginTop: 2,
  },
  metricSub: {
    fontSize: 9,
    color: "#64748B",
  },
  heroCard: {
    backgroundColor: "#FFFAF5",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FFE4D0",
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  heroBadge: {
    backgroundColor: "#FFF2E6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D95D00",
  },
  statusPill: {
    backgroundColor: "#FFF2E6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D95D00",
  },
  heroOrderId: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
  },
  heroMeta: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 12,
  },
  heroProgressTrack: {
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 4,
  },
  heroProgressFill: {
    height: "100%",
    backgroundColor: "#D95D00",
    borderRadius: 4,
  },
  heroProgressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  heroProgressUnits: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  heroProgressPct: {
    fontSize: 11,
    fontWeight: "800",
    color: "#D95D00",
  },
  heroBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#D95D00",
    paddingVertical: 12,
    borderRadius: 12,
  },
  heroBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  sectionHeader: {
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
  viewAllLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D95D00",
  },
  queueCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  queueIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  queueInfo: {
    flex: 1,
  },
  queueTitle: { fontFamily: "OpenSans",
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  queueSub: {
    fontSize: 11,
    color: "#475569",
    marginTop: 1,
  },
  queueDate: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 2,
  },
  queueRight: {
    alignItems: "flex-end",
  },
  queueProgressRatio: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  queueStatusPill: {
    backgroundColor: "#FFF2E6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  queueStatusText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D95D00",
  },
  ordersHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  ordersTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  ordersPageTitle: { fontFamily: "OpenSans",
    fontSize: 19,
    fontWeight: "900",
    color: "#0F172A",
    flexShrink: 1,
  },
  countPill: {
    backgroundColor: "#FFF2E6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#D95D00",
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginLeft: 8,
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
  },
  activeFilter: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF2E6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  activeFilterText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#D95D00",
  },
  assignedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  assignedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  cubeSquareAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  assignedTitleCol: {
    flex: 1,
  },
  orderId: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  customerText: {
    fontSize: 12,
    color: "#475569",
    marginTop: 1,
  },
  productPreview: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  assignedProgressCol: {
    alignItems: "flex-end",
  },
  ratioChevronRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  unitsRatioText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  miniBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  miniBarTrack: {
    width: 40,
    height: 5,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    overflow: "hidden",
  },
  miniBarFill: {
    height: "100%",
    backgroundColor: "#D95D00",
    borderRadius: 3,
  },
  miniPctText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D95D00",
  },
  assignedBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  assignedMetaLeft: {
    flex: 1,
  },
  iconLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  lineIcon: {
    marginRight: 2,
  },
  whNameText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  whAddrText: {
    fontSize: 10,
    color: "#64748B",
  },
  itemsUnitsText: {
    fontSize: 11,
    color: "#475569",
  },
  compactOrangeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#D95D00",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  compactOrangeBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  whiteChevronCircleSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});

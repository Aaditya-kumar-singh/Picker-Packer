// Packer Dashboard & Assigned Packing Orders — matches reference Packer UI/UX (image_4c0695 & image_4c069e).
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  theme,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import * as client from "@/api/client";
import { CUBE_PALETTES, getWarehouseDisplay } from "@/utils/warehouse";

type PackerSortMode = "order" | "units" | "customer";

function getPackerUnitStats(order: client.OrderSummary) {
  const itemCount = order.items?.length || order.itemCount || 0;
  const totalUnits =
    order.items && order.items.length > 0
      ? order.items.reduce((sum, i) => sum + (i.pickedQty || i.requiredQty || 0), 0)
      : itemCount;
  const packedUnits =
    order.items && order.items.length > 0
      ? order.items.reduce((sum, i) => sum + (i.packedQty || 0), 0)
      : order.packedCount ?? 0;
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
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const { message } = useLocalSearchParams<{ message?: string }>();
  const [orders, setOrders] = useState<client.OrderSummary[]>([]);
  const [stats, setStats] = useState<client.PackerDashboardStats>({
    assigned: 0,
    completed: 0,
    itemsPackedToday: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<PackerSortMode>("order");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, metrics] = await Promise.all([
        client.packerOrders(),
        client.packerDashboardStats(),
      ]);
      const activeQueue = queue.orders.filter(
        (o) => o.status !== "RIDER_ASSIGNED",
      );
      setOrders(activeQueue);
      setStats({
        assigned: activeQueue.length || metrics.assigned,
        completed: metrics.completed,
        itemsPackedToday: metrics.itemsPackedToday,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load packing queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const wh = getWarehouseDisplay(picker?.warehouseId);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? orders.filter((o) =>
          [
            o.orderNumber,
            o.customer,
            ...(o.items ?? []).flatMap((i) => [
              i.sku,
              i.skuBarcode,
              i.productName,
              i.location,
            ]),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : orders;

    return [...base].sort((a, b) => {
      if (sortMode === "units") {
        return getPackerUnitStats(b).totalUnits - getPackerUnitStats(a).totalUnits;
      }
      if (sortMode === "customer") {
        return (a.customer || "").localeCompare(b.customer || "");
      }
      return (b.orderNumber || b.id).localeCompare(a.orderNumber || a.id);
    });
  }, [orders, search, sortMode]);

  function cycleSort() {
    setSortMode((prev) =>
      prev === "order" ? "units" : prev === "units" ? "customer" : "order",
    );
  }

  const sortLabel =
    sortMode === "order"
      ? "Sort"
      : sortMode === "units"
        ? "Units"
        : "Customer";

  // ── Mode 2: Assigned Packing Orders Tab (`/orders` for Packer, image_4c069e) ──
  if (mode === "orders") {
    return (
      <View style={s.screen}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.ordersHeaderRow}>
            <View style={s.ordersTitleLeft}>
              <Text
                style={[s.ordersPageTitle, compact && { fontSize: 18 }]}
                maxFontSizeMultiplier={1.15}
              >
                Assigned Packing Orders
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
              placeholder="Search order, customer, SKU or location..."
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

          <ErrorBanner message={error} />

          {loading ? (
            <LoadingState label="Loading packing orders…" />
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              title={search ? "No Matching Orders" : "No Packing Orders"}
              body={
                search
                  ? "Try a different search term."
                  : "Orders ready for packing will appear here when picked."
              }
              actionLabel="Refresh Queue"
              onAction={() => void load()}
            />
          ) : (
            filteredOrders.map((o, idx) => {
              const palette = CUBE_PALETTES[idx % CUBE_PALETTES.length];
              const { itemCount, totalUnits, packedUnits, pct } =
                getPackerUnitStats(o);
              const complete = o.status === "PACKED";

              return (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Order ${o.orderNumber}`}
                  onPress={() => router.push(`/pack/order/${o.id}` as never)}
                  style={({ pressed }) => [
                    s.assignedCard,
                    pressed && s.cardPressed,
                  ]}
                >
                  {/* Top Row: Avatar + Order Number/Customer + Units Ratio/Bar */}
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
                        {o.customer || "Warehouse Customer"}
                      </Text>
                      {(o.items?.length ?? 0) > 0 ? (
                        <Text style={s.productPreview} numberOfLines={2} maxFontSizeMultiplier={1.1}>
                          {o.items!.slice(0, 2).map((item) => item.productName).join(" • ")}
                          {o.items!.length > 2 ? " +" + (o.items!.length - 2) + " more" : ""}
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

                  {/* Bottom Row: Location + Items/Units on left, Start Packing CTA on right */}
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
                          {wh.name}
                        </Text>
                      </View>

                      <Text
                        style={s.whAddrText}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {wh.address}
                      </Text>

                      <View style={[s.iconLine, { marginTop: 6 }]}>
                        <Ionicons
                          name="cube-outline"
                          size={14}
                          color="#475569"
                          style={s.lineIcon}
                        />
                        <Text
                          style={s.itemsUnitsText}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.15}
                        >
                          {itemCount} {itemCount === 1 ? "item" : "items"}  •{" "}
                          {totalUnits} {totalUnits === 1 ? "unit" : "units"}
                        </Text>
                      </View>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Start packing ${o.orderNumber}`}
                      onPress={() => router.push(`/pack/order/${o.id}` as never)}
                      style={({ pressed }) => [
                        s.compactOrangeBtn,
                        complete && { backgroundColor: "#16A34A" },
                        pressed && { opacity: 0.88 },
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
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Mode 1: Packer Home Dashboard (`/packer-dashboard`, image_4c0695) ──
  return (
    <View style={s.screen}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting & Page Title */}
        <Text style={s.greetingText} maxFontSizeMultiplier={1.15}>
          Hello, {picker?.name ?? "Test Packer"}
        </Text>
        <Text
          style={[s.dashboardTitle, compact && { fontSize: 24 }]}
          maxFontSizeMultiplier={1.15}
        >
          Packer Dashboard
        </Text>
        <Text style={s.dashboardSub} maxFontSizeMultiplier={1.15}>
          Pack picked items, verify, and prepare for dispatch.
        </Text>

        {message ? (
          <View style={s.success}>
            <Ionicons name="checkmark-circle" size={16} color={theme.color.okInk} />
            <Text style={s.successText}>{message}</Text>
          </View>
        ) : null}

        <ErrorBanner message={error} />

        {loading ? (
          <LoadingState label="Loading packing queue…" />
        ) : (
          <>
            {/* 3 KPI Cards with Colored Top Accent Borders */}
            <View style={s.kpiGrid}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`In Queue, ${stats.assigned}`}
                onPress={() => router.push("/orders" as never)}
                style={({ pressed }) => [
                  s.kpiCard,
                  { borderTopColor: "#EA580C" },
                  pressed && s.cardPressed,
                ]}
              >
                <View style={[s.kpiIconBox, { backgroundColor: "#FFF1E6" }]}>
                  <Ionicons name="cube" size={18} color="#EA580C" />
                </View>
                <Text
                  style={[s.kpiNumber, { color: "#D95D00" }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {stats.assigned}
                </Text>
                <Text
                  style={s.kpiLabel}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1.1}
                >
                  IN QUEUE
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Completed, ${stats.completed}`}
                onPress={() => router.push("/completed-orders" as never)}
                style={({ pressed }) => [
                  s.kpiCard,
                  { borderTopColor: "#16A34A" },
                  pressed && s.cardPressed,
                ]}
              >
                <View style={[s.kpiIconBox, { backgroundColor: "#DCFCE7" }]}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                </View>
                <Text
                  style={[s.kpiNumber, { color: "#15803D" }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {stats.completed}
                </Text>
                <Text
                  style={s.kpiLabel}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1.1}
                >
                  COMPLETED
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Packed Today, ${stats.itemsPackedToday}`}
                onPress={() => router.push("/completed-orders" as never)}
                style={({ pressed }) => [
                  s.kpiCard,
                  { borderTopColor: "#0284C7" },
                  pressed && s.cardPressed,
                ]}
              >
                <View style={[s.kpiIconBox, { backgroundColor: "#E0F2FE" }]}>
                  <Ionicons name="car-outline" size={18} color="#0284C7" />
                </View>
                <Text
                  style={[s.kpiNumber, { color: "#0284C7" }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {stats.itemsPackedToday}
                </Text>
                <Text
                  style={s.kpiLabel}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1.1}
                >
                  PACKED TODAY
                </Text>
              </Pressable>
            </View>

            {/* Next Orders to Pack Section Header */}
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle} maxFontSizeMultiplier={1.15}>
                Next Orders to Pack
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View all packing orders"
                onPress={() => router.push("/orders" as never)}
                style={({ pressed }) => [
                  s.viewAllBtn,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={s.viewAllText} maxFontSizeMultiplier={1.1}>
                  View All
                </Text>
                <Ionicons name="chevron-forward" size={15} color="#D95D00" />
              </Pressable>
            </View>

            {orders.length === 0 ? (
              <EmptyState
                title="No Packing Orders"
                body="Orders ready for packing will appear here when picked."
                actionLabel="Refresh Queue"
                onAction={() => void load()}
              />
            ) : (
              orders.map((o, idx) => {
                const palette = CUBE_PALETTES[idx % CUBE_PALETTES.length];
                const { itemCount, totalUnits, packedUnits, pct } =
                  getPackerUnitStats(o);
                const complete = o.status === "PACKED";

                return (
                  <Pressable
                    key={o.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Order ${o.orderNumber}`}
                    onPress={() => router.push(`/pack/order/${o.id}` as never)}
                    style={({ pressed }) => [s.homeCard, pressed && s.cardPressed]}
                  >
                    {/* Top section: Avatar + Order details + READY badge */}
                    <View style={s.homeCardTopRow}>
                      <View
                        style={[
                          s.cubeSquareAvatarLarge,
                          { backgroundColor: palette.bg },
                        ]}
                      >
                        <Ionicons name="cube" size={25} color={palette.icon} />
                      </View>

                      <View style={s.homeCardCenterCol}>
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
                          {o.customer || "Warehouse Customer"}
                        </Text>
                        {(o.items?.length ?? 0) > 0 ? (
                          <Text style={s.productPreview} numberOfLines={2} maxFontSizeMultiplier={1.1}>
                            {o.items!.slice(0, 2).map((item) => item.productName).join(" • ")}
                            {o.items!.length > 2 ? " +" + (o.items!.length - 2) + " more" : ""}
                          </Text>
                        ) : null}

                        <View style={[s.iconLine, { marginTop: 5 }]}>
                          <Ionicons
                            name="location-sharp"
                            size={13}
                            color="#334155"
                            style={s.lineIcon}
                          />
                          <Text
                            style={s.whNameText}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.15}
                          >
                            {wh.name}
                          </Text>
                        </View>

                        <View style={[s.iconLine, { marginTop: 4 }]}>
                          <Ionicons
                            name="cube-outline"
                            size={13}
                            color="#475569"
                            style={s.lineIcon}
                          />
                          <Text
                            style={s.itemsUnitsText}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.15}
                          >
                            {itemCount} {itemCount === 1 ? "item" : "items"}  •{" "}
                            {totalUnits} {totalUnits === 1 ? "unit" : "units"}
                          </Text>
                        </View>
                      </View>

                      <View style={s.homeCardRightCol}>
                        <View
                          style={[
                            s.readyPill,
                            complete && s.packedPill,
                          ]}
                        >
                          <Ionicons
                            name={complete ? "checkmark-circle" : "time"}
                            size={13}
                            color={complete ? "#15803D" : "#B45309"}
                          />
                          <Text
                            style={[
                              s.readyPillText,
                              complete && { color: "#15803D" },
                            ]}
                            maxFontSizeMultiplier={1.1}
                          >
                            {complete ? "PACKED" : "READY"}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color="#334155"
                          style={{ marginTop: 8 }}
                        />
                      </View>
                    </View>

                    {/* Units packed label + Progress bar */}
                    <View style={s.homeProgressWrap}>
                      <Text
                        style={s.unitsPackedLabel}
                        maxFontSizeMultiplier={1.1}
                      >
                        {packedUnits} / {totalUnits} units packed ({pct}%)
                      </Text>
                      <View style={s.homeProgressTrack}>
                        <View
                          style={[s.homeProgressFill, { width: `${pct}%` }]}
                        />
                      </View>
                    </View>

                    {/* Full-Width Burnt-Orange Start Packing Button */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        complete
                          ? `Open packed order ${o.orderNumber}`
                          : `Start packing ${o.orderNumber}`
                      }
                      onPress={() => router.push(`/pack/order/${o.id}` as never)}
                      style={({ pressed }) => [
                        s.fullWidthOrangeBtn,
                        complete && { backgroundColor: "#16A34A" },
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <View style={s.fullWidthBtnCenter}>
                        <Ionicons
                          name="cube-outline"
                          size={19}
                          color="#FFFFFF"
                        />
                        <Text
                          style={s.fullWidthBtnText}
                          maxFontSizeMultiplier={1.1}
                        >
                          {complete
                            ? "All Packed • Assign Rider"
                            : "Start Packing"}
                        </Text>
                      </View>
                      <View style={s.whiteChevronCircle}>
                        <Ionicons
                          name="chevron-forward"
                          size={15}
                          color={complete ? "#16A34A" : "#D95D00"}
                        />
                      </View>
                    </Pressable>
                  </Pressable>
                );
              })
            )}
          </>
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
  greetingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  dashboardTitle: {
    fontSize: 27,
    fontWeight: "900",
    color: "#091E3A",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  dashboardSub: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 14,
  },
  kpiGrid: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderTopWidth: 3.5,
    paddingHorizontal: 11,
    paddingVertical: 11,
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  kpiNumber: {
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28,
  },
  kpiLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#475569",
    marginTop: 3,
    letterSpacing: 0.3,
  },
  sectionHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "900",
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
    fontWeight: "800",
    color: "#D95D00",
  },
  homeCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.92,
  },
  homeCardTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cubeSquareAvatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  homeCardCenterCol: {
    flex: 1,
    marginHorizontal: 11,
  },
  orderId: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
  },
  customerText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
    marginTop: 2,
  },
  productPreview: {
    fontSize: 11,
    lineHeight: 14,
    color: "#0F766E",
    fontWeight: "700",
    marginTop: 3,
  },
  iconLine: {
    flexDirection: "row",
    alignItems: "center",
  },
  lineIcon: {
    marginRight: 5,
  },
  whNameText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
  },
  whAddrText: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
    paddingLeft: 19,
  },
  itemsUnitsText: {
    flex: 1,
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  homeCardRightCol: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  readyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  packedPill: {
    backgroundColor: "#DCFCE7",
    borderColor: "#BBF7D0",
  },
  readyPillText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#92400E",
    letterSpacing: 0.4,
  },
  homeProgressWrap: {
    width: "100%",
    marginTop: 6,
    marginBottom: 11,
  },
  unitsPackedLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#C2410C",
    textAlign: "right",
    marginBottom: 5,
  },
  homeProgressTrack: {
    width: "100%",
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  homeProgressFill: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EA580C",
  },
  fullWidthOrangeBtn: {
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#D95D00",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  fullWidthBtnCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingLeft: 16,
  },
  fullWidthBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  whiteChevronCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // ── Orders Mode Styles (`image_4c069e`) ──
  ordersHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  ordersTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  ordersPageTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  countPill: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  countPillText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 36,
    flexShrink: 0,
  },
  sortBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  searchWrap: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 13,
    marginBottom: 12,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchInput: {
    flex: 1,
    ...(theme.type.bodyMd as object),
    color: "#0F172A",
    minHeight: 42,
    fontSize: 14,
  },
  assignedCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 13,
    marginBottom: 11,
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  assignedTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  cubeSquareAvatar: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  assignedTitleCol: {
    flex: 1,
    marginHorizontal: 11,
  },
  assignedProgressCol: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  ratioChevronRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  unitsRatioText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#1E293B",
  },
  miniBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  miniBarTrack: {
    width: 60,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  miniBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EA580C",
  },
  miniPctText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#D95D00",
    minWidth: 26,
    textAlign: "right",
  },
  assignedBottomRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 8,
  },
  assignedMetaLeft: {
    flex: 1,
    paddingRight: 4,
  },
  compactOrangeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#D95D00",
    paddingHorizontal: 12,
    minHeight: 38,
    borderRadius: 10,
    flexShrink: 0,
  },
  compactOrangeBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "800",
  },
  whiteChevronCircleSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  success: {
    backgroundColor: theme.color.okBg,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginBottom: theme.space.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  successText: {
    ...(theme.type.bodyMd as object),
    color: theme.color.okInk,
    fontWeight: "700",
    fontSize: 13,
  },
});

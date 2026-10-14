// Assigned Orders — cross-device responsive Picker work queue (Android, iOS & Web).
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  theme,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { getDeviceId, newIdemKey, pickerRepository } from "@/repositories/pickerRepository";
import type { Order } from "@/types";
import {
  formatPickByTime,
  getBatchCount,
  getCubePalette,
  getOrderProgress,
  getWarehouseDisplay,
} from "@/utils/warehouse";

type SortMode = "priority" | "sla" | "order";

export function OrdersScreen({ completed = false }: { completed?: boolean }) {
  const { picker } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await pickerRepository.getOrders();
    if (r.ok) {
      setOrders(r.data);
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

  const wh = getWarehouseDisplay(picker?.warehouseId);

  const visibleOrders = useMemo(() => {
    const base = completed
      ? orders.filter((o) => o.status === "COMPLETED")
      : orders.filter((o) => o.status !== "COMPLETED");
    const q = search.trim().toLowerCase();
    const searched = q
      ? base.filter((o) =>
          [
            o.externalId,
            ...o.lines.flatMap((l) => [l.skuCode, l.skuName, l.locationCode]),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : base;

    return [...searched].sort((a, b) => {
      if (sortMode === "priority") {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime();
      }
      if (sortMode === "sla") {
        return new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime();
      }
      return a.externalId.localeCompare(b.externalId);
    });
  }, [orders, completed, search, sortMode]);

  function cycleSort() {
    setSortMode((prev) =>
      prev === "priority" ? "sla" : prev === "sla" ? "order" : "priority",
    );
  }

  async function handleStartPicking(order: Order) {
    if (startingId) return;
    if (order.status === "ASSIGNED") {
      setStartingId(order.id);
      try {
        await pickerRepository.beginPicking(
          order.id,
          getDeviceId(),
          newIdemKey(),
          order.version,
        );
      } finally {
        setStartingId(null);
      }
    }
    router.push(`/order/${order.id}` as never);
  }

  const sortLabel =
    sortMode === "priority"
      ? "Sort"
      : sortMode === "sla"
        ? "Pick by"
        : "Order ID";

  return (
    <View style={os.screen}>
      <ScrollView
        style={os.scroll}
        contentContainerStyle={os.scrollContent}
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
        {/* Title Row + Count Badge + Sort Button */}
        <View style={os.topHeaderRow}>
          <View style={os.titleLeft}>
            <Text style={[os.pageTitle, compact && { fontSize: 19 }]} maxFontSizeMultiplier={1.15}>
              {completed ? "Completed Orders" : "Assigned Orders"}
            </Text>
            <View style={os.countPill}>
              <Text style={os.countPillText} maxFontSizeMultiplier={1.1}>
                {visibleOrders.length}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort orders, current ${sortLabel}`}
            onPress={cycleSort}
            style={({ pressed }) => [os.sortBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="options-outline" size={15} color="#1E293B" />
            <Text style={os.sortBtnText} maxFontSizeMultiplier={1.1}>
              {sortLabel}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#475569" />
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={os.searchWrap}>
          <Ionicons
            name="search-outline"
            size={19}
            color="#64748B"
            style={{ marginRight: 8 }}
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search order, SKU or location..."
            placeholderTextColor="#94A3B8"
            style={os.searchInput}
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

        {loading ? (
          <LoadingState label="Loading orders…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : visibleOrders.length === 0 ? (
          <EmptyState
            title={
              search
                ? "No Matching Orders"
                : completed
                  ? "No Completed Orders"
                  : "No Assigned Orders"
            }
            body={
              search
                ? "Try a different search term."
                : completed
                  ? "Completed orders will appear here."
                  : "Assigned work will appear when released."
            }
            actionLabel="Refresh"
            onAction={() => void load()}
          />
        ) : (
          visibleOrders.map((o, idx) => {
            const palette = getCubePalette(o, idx);
            const prog = getOrderProgress(o);
            const batches = getBatchCount(o.lines, o.totalLines);
            const isBusy = startingId === o.id;

            return (
              <View key={o.id} style={os.orderCard}>
                {/* The summary row is independently clickable; keep action buttons
                    outside it so web never renders a button inside another button. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Order ${o.externalId}`}
                  onPress={() => router.push(`/order/${o.id}` as never)}
                  style={({ pressed }) => [os.cardTopRow, pressed && os.pressed]}
                >
                  <View style={[os.cubeAvatar, { backgroundColor: palette.bg }]}>
                    <Ionicons name="cube" size={22} color={palette.icon} />
                  </View>

                  <View style={os.orderTitleBlock}>
                    <Text
                      style={os.orderId}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                    >
                      {o.externalId}
                    </Text>
                    <Text
                      style={os.itemsBatchesText}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                    >
                      {prog.totalLines} items  •  {batches} batches
                    </Text>
                    {o.lines.length > 0 ? (
                      <Text style={os.productPreview} numberOfLines={2} maxFontSizeMultiplier={1.1}>
                        {o.lines.slice(0, 2).map((line) => line.skuName).join(" • ")}
                        {o.lines.length > 2 ? " +" + (o.lines.length - 2) + " more" : ""}
                      </Text>
                    ) : null}
                  </View>

                  <View style={os.progressBlock}>
                    <View style={os.ratioChevronRow}>
                      <Text style={os.ratioText} maxFontSizeMultiplier={1.1}>
                        {prog.pickedLines}/{prog.totalLines} items
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="#475569" />
                    </View>

                    <View style={os.progressBarRow}>
                      <View style={os.progressTrack}>
                        <View
                          style={[os.progressFill, { width: `${prog.pct}%` }]}
                        />
                      </View>
                      <Text style={os.pctText} maxFontSizeMultiplier={1.1}>
                        {prog.pct}%
                      </Text>
                    </View>
                  </View>
                </Pressable>

                {/* Bottom Row: Location + SLA on left, Start Picking CTA on right */}
                <View style={[os.cardBottomRow, !compact && { paddingLeft: 52 }]}>
                  <View style={os.metaLeftCol}>
                    <View style={os.iconTextLine}>
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color="#334155"
                        style={os.lineIcon}
                      />
                      <Text
                        style={os.whNameText}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {wh.name}
                      </Text>
                    </View>

                    <Text
                      style={os.whAddrText}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                    >
                      {wh.address}
                    </Text>

                    <View style={[os.iconTextLine, { marginTop: 6 }]}>
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color="#334155"
                        style={os.lineIcon}
                      />
                      <Text
                        style={os.pickByText}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        Pick by{" "}
                        <Text style={os.pickByBold}>
                          {formatPickByTime(o.slaDueAt)}
                        </Text>
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      completed
                        ? `View ${o.externalId}`
                        : `Start picking ${o.externalId}`
                    }
                    disabled={isBusy}
                    onPress={() => void handleStartPicking(o)}
                    style={({ pressed }) => [
                      os.startPickingBtn,
                      completed && os.completedBtn,
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    <Ionicons
                      name={completed ? "checkmark-circle-outline" : "arrow-forward"}
                      size={14}
                      color="#FFFFFF"
                    />
                    <Text style={os.startPickingBtnText} maxFontSizeMultiplier={1.1}>
                      {isBusy
                        ? "Starting…"
                        : completed
                          ? "Completed"
                          : "Start Picking"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const os = StyleSheet.create({
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
  topHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  pageTitle: {
    fontSize: 22,
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
  orderCard: {
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
  pressed: {
    opacity: 0.92,
  },
  cardTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  cubeAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  orderTitleBlock: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  itemsBatchesText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  productPreview: {
    fontSize: 11,
    lineHeight: 14,
    color: "#0F766E",
    fontWeight: "700",
    marginTop: 3,
  },
  progressBlock: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  ratioChevronRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratioText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  progressBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  progressTrack: {
    width: 58,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1D76DB",
  },
  pctText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1565C0",
    minWidth: 28,
    textAlign: "right",
  },
  cardBottomRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 8,
  },
  metaLeftCol: {
    flex: 1,
    paddingRight: 4,
  },
  iconTextLine: {
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
  pickByText: {
    flex: 1,
    fontSize: 12,
    color: "#334155",
  },
  pickByBold: {
    fontWeight: "800",
    color: "#0F172A",
  },
  startPickingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0D6EFD",
    paddingHorizontal: 13,
    minHeight: 36,
    borderRadius: 10,
    flexShrink: 0,
  },
  completedBtn: {
    backgroundColor: "#16A34A",
  },
  startPickingBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});

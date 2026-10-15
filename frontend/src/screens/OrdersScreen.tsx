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
import { pickerAppApi } from "@/api/pickerAppApi";
import type { FulfillmentOrderDto } from "@/types";
import {
  formatOrderDate,
  getCubePalette,
  getOrderProgress,
  getWarehouseDisplay,
} from "@/utils/warehouse";

type SortMode = "order" | "date" | "items";

export function OrdersScreen({ completed = false }: { completed?: boolean }) {
  const { picker } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [orders, setOrders] = useState<FulfillmentOrderDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("date");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (completed) {
        const completedOrders = await pickerAppApi.getCompletedOrders();
        setOrders(completedOrders);
      } else {
        const assigned = await pickerAppApi.getAssignedOrders();
        setOrders(assigned || []);
      }
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [completed]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const wh = getWarehouseDisplay(picker?.warehouseId, picker?.warehouseName);

  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const searched = q
      ? orders.filter((o) =>
          [
            o.orderNumber,
            String(o.orderId),
            o.paymentMethod,
            ...(o.items || []).flatMap((i) => [
              i.sku,
              i.productName,
              i.variantLabel ?? "",
              i.locationCode ?? "",
              i.zone ?? "",
            ]),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : orders;

    return [...searched].sort((a, b) => {
      if (sortMode === "date") {
        return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
      }
      if (sortMode === "items") {
        return b.totalItems - a.totalItems;
      }
      return a.orderNumber.localeCompare(b.orderNumber);
    });
  }, [orders, search, sortMode]);

  function cycleSort() {
    setSortMode((prev) =>
      prev === "date" ? "items" : prev === "items" ? "order" : "date"
    );
  }

  const sortLabel =
    sortMode === "date"
      ? "Date"
      : sortMode === "items"
        ? "Items"
        : "Order #";

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
            placeholder="Search order, SKU, item or location..."
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

        {loading && orders.length === 0 ? (
          <LoadingState label="Loading orders…" />
        ) : error && orders.length === 0 ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : visibleOrders.length === 0 ? (
          <EmptyState
            title={
              search
                ? "No matching orders"
                : completed
                  ? "No Completed Orders Yet"
                  : "No Assigned Orders"
            }
            body={
              search
                ? `No orders matched "${search}". Clear search to see all.`
                : completed
                  ? "Orders you pick and assign to packers during this shift will appear here."
                  : "Your picking queue is clear. New orders assigned by the administrator will appear here."
            }
            actionLabel={search ? "Clear Search" : "Refresh"}
            onAction={search ? () => setSearch("") : () => void load()}
          />
        ) : (
          visibleOrders.map((order, idx) => {
            const palette = getCubePalette(order, idx);
            const prog = getOrderProgress(order);
            const isCompleted = order.orderStatus === "PACKING" || order.orderStatus === "PACKED";

            return (
              <Pressable
                key={order.orderId}
                accessibilityRole="button"
                accessibilityLabel={`Order ${order.orderNumber}`}
                onPress={() => router.push(`/order/${order.orderId}` as never)}
                style={({ pressed }) => [
                  os.card,
                  pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
                ]}
              >
                {/* Top Row: Icon + Order Number + Status / Payment Badge */}
                <View style={os.cardTopRow}>
                  <View style={[os.cubeCircle, { backgroundColor: palette.bg }]}>
                    <Ionicons name="cube" size={20} color={palette.icon} />
                  </View>

                  <View style={os.cardHeaderInfo}>
                    <View style={os.orderNumberRow}>
                      <Text style={os.orderNumber} numberOfLines={1}>
                        {order.orderNumber}
                      </Text>
                      <View style={[os.paymentBadge, { backgroundColor: "#E0F2FE" }]}>
                        <Text style={os.paymentBadgeText}>
                          {order.paymentMethod || "COD"}
                        </Text>
                      </View>
                    </View>
                    <Text style={os.orderMetaText}>
                      {prog.totalLines} lines • ₹{order.grandTotal.toFixed(2)} • {formatOrderDate(order.orderDate)}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </View>

                {/* Line Items Preview */}
                {order.items && order.items.length > 0 ? (
                  <View style={os.itemsPreviewBox}>
                    {order.items.slice(0, 3).map((item) => (
                      <View key={item.itemId} style={os.itemPreviewRow}>
                        <View style={[os.itemDot, { backgroundColor: item.fullyScanned ? "#16A34A" : "#0D6EFD" }]} />
                        <Text style={os.itemPreviewName} numberOfLines={1}>
                          {item.productName}
                          {item.variantLabel ? ` (${item.variantLabel})` : ""}
                        </Text>
                        <Text style={os.itemPreviewQty}>
                          {item.pickedQty}/{item.orderedQty}
                        </Text>
                      </View>
                    ))}
                    {order.items.length > 3 ? (
                      <Text style={os.moreItemsText}>
                        +{order.items.length - 3} more items
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {/* Progress bar */}
                <View style={os.progressRow}>
                  <View style={os.progressTrack}>
                    <View style={[os.progressFill, { width: `${prog.pct}%` }]} />
                  </View>
                  <Text style={os.progressText}>
                    {prog.pickedLines}/{prog.totalLines} lines picked ({prog.pct}%)
                  </Text>
                </View>

                {/* Bottom Footer Action */}
                <View style={os.cardFooter}>
                  <View style={os.whRow}>
                    <Ionicons name="location-sharp" size={13} color="#64748B" />
                    <Text style={os.whText}>{wh.shortAddress}</Text>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      os.actionBtn,
                      isCompleted && os.actionBtnCompleted,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => router.push(`/order/${order.orderId}` as never)}
                  >
                    <Text style={[os.actionBtnText, isCompleted && os.actionBtnTextCompleted]}>
                      {isCompleted ? "View Order" : "Continue Picking"}
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={14}
                      color={isCompleted ? "#0284C7" : "#FFFFFF"}
                    />
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },
  countPill: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0284C7",
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
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  cubeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  orderNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  paymentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  paymentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0284C7",
  },
  orderMetaText: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  itemsPreviewBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
  },
  itemPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  itemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  itemPreviewName: {
    flex: 1,
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
  },
  itemPreviewQty: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "700",
  },
  moreItemsText: {
    fontSize: 11,
    color: "#0284C7",
    fontWeight: "600",
    marginTop: 2,
    marginLeft: 12,
  },
  progressRow: {
    marginBottom: 10,
  },
  progressTrack: {
    height: 6,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#0D6EFD",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  whRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  whText: {
    fontSize: 11,
    color: "#64748B",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0D6EFD",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnCompleted: {
    backgroundColor: "#E0F2FE",
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionBtnTextCompleted: {
    color: "#0284C7",
  },
});

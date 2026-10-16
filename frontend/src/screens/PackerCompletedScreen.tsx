// Packer Completed Orders per packer-app-api.md
import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { packerAppApi } from "@/api/packerAppApi";
import type { FulfillmentOrderDto } from "@/types";
import { CUBE_PALETTES, formatOrderDate, getWarehouseDisplay } from "@/utils/warehouse";

export function PackerCompletedScreen() {
  const { picker } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [orders, setOrders] = useState<FulfillmentOrderDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const wh = getWarehouseDisplay(picker?.warehouseId, picker?.warehouseName);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const assigned = await packerAppApi.getAssignedOrders();
      // The documented assigned-orders contract includes PACKING and PACKED only.
      // Dispatched history requires a dedicated backend endpoint before it can be shown here.
      const completedOrders = assigned.filter((o) => o.orderStatus === "PACKED");
      setOrders(completedOrders);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load completed orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <View style={s.screen}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
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
        <View style={s.headerRow}>
          <Text
            style={[s.pageTitle, compact && { fontSize: 19 }]}
            maxFontSizeMultiplier={1.15}
          >
            Completed Orders
          </Text>
          <View style={s.countPill}>
            <Text style={s.countPillText} maxFontSizeMultiplier={1.1}>
              {orders.length}
            </Text>
          </View>
        </View>

        <ErrorBanner message={error} />

        {loading && orders.length === 0 ? (
          <LoadingState label="Loading completed orders…" />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No Completed Orders"
            body="Orders confirmed as packed by the server will appear here."
            actionLabel="Refresh"
            onAction={() => void load()}
          />
        ) : (
          orders.map((order, idx) => {
            const palette = CUBE_PALETTES[idx % CUBE_PALETTES.length];

            return (
              <Pressable
                key={order.orderId}
                onPress={() => router.push(`/pack/order/${order.orderId}` as never)}
                style={({ pressed }) => [s.card, pressed && { opacity: 0.88 }]}
              >
                <View style={[s.cubeCircle, { backgroundColor: palette.bg }]}>
                  <Ionicons name="cube" size={22} color={palette.icon} />
                </View>

                <View style={s.mainInfo}>
                  <Text style={s.orderNumber}>{order.orderNumber}</Text>
                  <Text style={s.orderMeta}>
                    {order.totalItems} lines • ₹{order.grandTotal.toFixed(2)} ({order.paymentMethod})
                  </Text>
                  <Text style={s.dateText}>{formatOrderDate(order.orderDate)}</Text>
                </View>

                <View style={s.rightCol}>
                  <View style={[s.badge, s.badgePacked]}>
                    <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
                    <Text style={[s.badgeText, { color: "#16A34A" }]}>PACKED</Text>
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  cubeCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  mainInfo: {
    flex: 1,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  orderMeta: {
    fontSize: 12,
    color: "#475569",
    marginTop: 1,
  },
  dateText: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 2,
  },
  rightCol: {
    alignItems: "flex-end",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgePacked: {
    backgroundColor: "#DCFCE7",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
});

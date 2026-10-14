// Packer Completed Orders — History of packed orders & courier dispatches.
import { useCallback, useState } from "react";
import {
  Pressable,
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
import * as client from "@/api/client";
import { CUBE_PALETTES, getWarehouseDisplay } from "@/utils/warehouse";

export function PackerCompletedScreen() {
  const { picker } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [orders, setOrders] = useState<client.OrderSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const wh = getWarehouseDisplay(picker?.warehouseId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.packerCompletedOrders();
      setOrders(result.orders);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load completed orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={s.screen}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headerRow}>
          <Text
            style={[s.pageTitle, compact && { fontSize: 19 }]}
            maxFontSizeMultiplier={1.15}
          >
            Completed Packing Orders
          </Text>
          <View style={s.countPill}>
            <Text style={s.countPillText} maxFontSizeMultiplier={1.1}>
              {orders.length}
            </Text>
          </View>
        </View>

        <ErrorBanner message={error} />

        {loading ? (
          <LoadingState label="Loading completed orders…" />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No Completed Orders"
            body="Orders packed and dispatched by you will appear here."
            actionLabel="Refresh"
            onAction={() => void load()}
          />
        ) : (
          orders.map((order, idx) => {
            const palette = CUBE_PALETTES[idx % CUBE_PALETTES.length];
            const itemCount = order.items?.length || order.itemCount || 0;
            const totalUnits =
              order.items && order.items.length > 0
                ? order.items.reduce(
                    (sum, i) => sum + (i.pickedQty || i.requiredQty || 0),
                    0,
                  )
                : itemCount;
            const packedUnits =
              order.items && order.items.length > 0
                ? order.items.reduce((sum, i) => sum + (i.packedQty || 0), 0)
                : order.packedCount ?? totalUnits;
            const pct =
              totalUnits > 0
                ? Math.min(100, Math.round((packedUnits / totalUnits) * 100))
                : 100;
            const riderAssigned = order.status === "RIDER_ASSIGNED";

            return (
              <Pressable
                key={order.id}
                accessibilityRole="button"
                onPress={() => router.push(`/pack/order/${order.id}` as never)}
                style={({ pressed }) => [s.card, pressed && s.pressed]}
              >
                <View style={s.topRow}>
                  <View
                    style={[s.cubeAvatar, { backgroundColor: palette.bg }]}
                  >
                    <Ionicons name="cube" size={22} color={palette.icon} />
                  </View>

                  <View style={s.titleCol}>
                    <Text
                      style={s.id}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                    >
                      {order.orderNumber}
                    </Text>
                    <Text
                      style={s.customer}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.15}
                    >
                      {order.customer || "Warehouse Customer"}
                    </Text>
                  </View>

                  <View style={s.statusPill}>
                    <Ionicons
                      name="checkmark-circle"
                      size={13}
                      color="#15803D"
                    />
                    <Text style={s.statusPillText} maxFontSizeMultiplier={1.1}>
                      {riderAssigned ? "DISPATCHED" : "PACKED"}
                    </Text>
                  </View>
                </View>

                <View style={[s.bottomRow, !compact && { paddingLeft: 55 }]}>
                  <View style={s.metaLeft}>
                    <View style={s.iconLine}>
                      <Ionicons
                        name="location-sharp"
                        size={13}
                        color="#334155"
                        style={s.lineIcon}
                      />
                      <Text
                        style={s.whName}
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
                        style={s.metaText}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {itemCount} items  •  {packedUnits}/{totalUnits} units (
                        {pct}%)
                      </Text>
                    </View>
                  </View>

                  <View style={s.riderBadge}>
                    <Ionicons
                      name={riderAssigned ? "bicycle" : "checkmark-done"}
                      size={14}
                      color="#15803D"
                    />
                    <Text style={s.riderText} maxFontSizeMultiplier={1.1}>
                      {riderAssigned
                        ? order.riderName || "Rider Assigned"
                        : "Assign Rider"}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color="#15803D"
                    />
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
  screen: { flex: 1, backgroundColor: "#F5F7FB" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 28 },
  headerRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  pageTitle: { fontSize: 21, fontWeight: "900", color: "#0F172A", letterSpacing: -0.3 },
  countPill: { backgroundColor: "#E2E8F0", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  countPillText: { fontSize: 13, fontWeight: "800", color: "#334155" },
  card: { width: "100%", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 18, padding: 13, marginBottom: 11, shadowColor: "#0F172A", shadowOpacity: 0.03, shadowRadius: 5, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  pressed: { opacity: 0.9 },
  topRow: { width: "100%", flexDirection: "row", alignItems: "center" },
  cubeAvatar: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  titleCol: { flex: 1, marginHorizontal: 11 },
  id: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  customer: { fontSize: 13, color: "#64748B", marginTop: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#BBF7D0", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexShrink: 0 },
  statusPillText: { fontSize: 10.5, fontWeight: "800", color: "#15803D" },
  bottomRow: { width: "100%", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8, gap: 8 },
  metaLeft: { flex: 1, paddingRight: 4 },
  iconLine: { flexDirection: "row", alignItems: "center" },
  lineIcon: { marginRight: 5 },
  whName: { flex: 1, fontSize: 12, fontWeight: "700", color: "#1E293B" },
  metaText: { flex: 1, fontSize: 12, color: "#475569", fontWeight: "500" },
  riderBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexShrink: 0 },
  riderText: { fontSize: 11.5, fontWeight: "800", color: "#15803D" },
});

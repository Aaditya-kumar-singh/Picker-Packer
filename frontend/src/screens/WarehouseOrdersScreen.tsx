import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/navigation/AppProvider";
import * as api from "@/api/warehouseApi";

const navy = "#0E2E69", blue = "#0D6EFD", ink = "#14213D", muted = "#64748B";
const statLabels: Record<string, string> = {
  assignedOrdersCount: "Assigned orders", completedOrdersCount: "Completed orders", totalItemsPickedToday: "Items picked today",
  assignedOrders: "Assigned orders", completedOrders: "Completed orders", todayOrdersPacked: "Orders packed today", todayItemsScanned: "Items scanned today",
};

export function WarehouseOrdersScreen({ mode = "orders" }: { mode?: "home" | "orders" | "completed" }) {
  const { picker } = useAuth();
  const role = picker?.role === "PACKER" ? "PACKER" : "PICKER";
  const isPacker = role === "PACKER";
  const [orders, setOrders] = useState<api.WarehouseOrder[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [statsError, setStatsError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const ordersRequest = api.assignedOrders(role).then(value => {
      setOrders(Array.isArray(value) ? value : []); setOrdersError("");
    }).catch(reason => {
      setOrders([]); setOrdersError(reason instanceof Error ? reason.message : "Could not load orders");
    }).finally(() => setLoading(false));
    const statsRequest = mode === "home" ? api.stats(role).then(value => {
      setMetrics(value || {}); setStatsError("");
    }).catch(reason => {
      setMetrics({}); setStatsError(reason instanceof Error ? reason.message : "Could not load stats");
    }) : Promise.resolve();
    await Promise.all([ordersRequest, statsRequest]);
  }, [role, mode]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visible = mode === "completed" ? orders.filter(o => o.orderStatus === "PACKED") : orders.filter(o => o.orderStatus !== "PACKED");
  const openOrder = (orderId: number) => router.push((isPacker ? `/pack/order/${orderId}` : `/order/${orderId}`) as never);
  const title = mode === "home" ? `Hello, ${picker?.name || "Operator"}` : mode === "completed" ? "Completed orders" : "Your orders";

  return <ScrollView style={s.page} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
    <View style={s.heading}><View style={{ flex: 1 }}><Text style={s.eyebrow}>{role} WORKSPACE</Text><Text style={s.title}>{title}</Text><Text style={s.subtitle}>{isPacker ? "Pack items, then hand over to a rider" : "Pick items, then hand over to a packer"}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh orders" onPress={() => void load()} style={s.refresh}><Ionicons name="refresh" size={20} color={navy} /></Pressable></View>

    {mode === "home" ? <>
      <View style={s.hero}><View style={s.heroIcon}><Ionicons name={isPacker ? "cube-outline" : "scan-outline"} size={23} color="white" /></View>
        <Text style={s.heroTitle}>{isPacker ? "Ready to pack?" : "Ready to pick?"}</Text>
        <Text style={s.heroBody}>Open an assigned order, scan each product, then choose the person for the next handoff.</Text>
        <Pressable accessibilityRole="button" style={s.heroButton} onPress={() => visible.length ? openOrder(visible[0].orderId) : router.push("/orders" as never)}><Text style={s.heroButtonText}>{visible.length ? "Continue first order  →" : "See all orders  →"}</Text></Pressable></View>
      <View style={s.stats}><View style={s.stat}><Text style={s.statNumber}>{visible.length}</Text><Text style={s.statLabel}>Orders to do</Text></View>
        {Object.entries(metrics).filter(([key, value]) => key !== "assignedOrdersCount" && key !== "assignedOrders" && typeof value === "number").slice(0, 3).map(([key, value]) => <View key={key} style={s.stat}><Text style={s.statNumber}>{value}</Text><Text style={s.statLabel}>{statLabels[key] || key.replace(/([A-Z])/g, " $1").trim()}</Text></View>)}</View>
    </> : null}

    <View style={s.sectionHead}><Text style={s.sectionTitle}>{mode === "completed" ? "Ready for handoff" : "Assigned to you"}</Text><Text style={s.count}>{visible.length} orders</Text></View>
    {ordersError || statsError ? <View style={s.error}><Ionicons name="alert-circle-outline" size={20} color="#B91C1C" /><View style={{ flex: 1 }}><Text style={s.errorText}>{ordersError ? `Orders: ${ordersError}` : `Stats: ${statsError}`}</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={s.retry}>Try again</Text></Pressable></View></View> : null}
    {loading && orders.length === 0 ? <View style={s.empty}><ActivityIndicator color={blue} /><Text style={s.emptyText}>Loading your orders…</Text></View> : null}
    {!loading && !ordersError && visible.length === 0 ? <View style={s.empty}><Ionicons name="checkmark-circle-outline" size={34} color="#20A66A" /><Text style={s.emptyTitle}>{mode === "completed" ? "No completed orders here" : "All caught up"}</Text><Text style={s.emptyText}>{mode === "completed" && !isPacker ? "The picker API only provides current assignments." : "New assigned orders will appear here. Pull down to refresh."}</Text></View> : null}
    {visible.map(order => {
      const total = Math.max(0, Number(order.totalItems) || order.items?.length || 0);
      const done = Math.max(0, Math.min(total, Number(order.totalItemsScanned) || 0));
      return <Pressable key={order.orderId} accessibilityRole="button" accessibilityLabel={`Open order ${order.orderNumber}`} style={s.card} onPress={() => openOrder(order.orderId)}>
        <View style={s.cardTop}><View style={s.cardIcon}><Ionicons name={isPacker ? "cube-outline" : "basket-outline"} size={21} color={blue} /></View><View style={{ flex: 1 }}><Text style={s.orderNo}>{order.orderNumber}</Text><Text style={s.cardSub}>{total} product {total === 1 ? "line" : "lines"}</Text></View><Ionicons name="chevron-forward" size={20} color={muted} /></View>
        <View style={s.progressRow}><Text style={s.progressLabel}>Progress</Text><Text style={s.progressValue}>{done} / {total} complete</Text></View><View style={s.track}><View style={[s.fill, { width: `${total ? Math.round(done / total * 100) : 0}%` }]} /></View>
        <View style={s.cardFoot}><Text style={s.status}>{order.orderStatus?.replace(/_/g, " ") || "ASSIGNED"}</Text><Text style={s.open}>{mode === "completed" ? "View order" : isPacker ? "Start packing" : "Start picking"}  →</Text></View>
      </Pressable>;
    })}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F5F8FC" }, content: { padding: 16, paddingBottom: 36 },
  heading: { flexDirection: "row", alignItems: "flex-start", marginBottom: 18 }, eyebrow: { color: blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 5 }, title: { color: ink, fontSize: 24, fontWeight: "800" }, subtitle: { color: muted, fontSize: 13, marginTop: 3 },
  refresh: { width: 42, height: 42, borderRadius: 12, backgroundColor: "white", borderColor: "#DFE7F0", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: navy, borderRadius: 19, padding: 20, marginBottom: 14 }, heroIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#24509A", alignItems: "center", justifyContent: "center", marginBottom: 12 }, heroTitle: { color: "white", fontSize: 19, fontWeight: "800" }, heroBody: { color: "#DCE8FF", fontSize: 13, lineHeight: 19, marginTop: 5 }, heroButton: { backgroundColor: "white", borderRadius: 11, minHeight: 43, alignItems: "center", justifyContent: "center", marginTop: 17 }, heroButtonText: { color: navy, fontWeight: "800" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 }, stat: { backgroundColor: "white", borderWidth: 1, borderColor: "#E3EAF3", borderRadius: 13, padding: 12, minWidth: "47%", flexGrow: 1 }, statNumber: { color: blue, fontSize: 22, fontWeight: "800" }, statLabel: { color: muted, fontSize: 11, textTransform: "capitalize" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }, sectionTitle: { color: ink, fontSize: 17, fontWeight: "800" }, count: { color: muted, fontSize: 12, fontWeight: "700" },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#DFE7F0", borderRadius: 16, padding: 15, marginBottom: 10 }, cardTop: { flexDirection: "row", alignItems: "center", gap: 10 }, cardIcon: { width: 40, height: 40, backgroundColor: "#EAF3FF", borderRadius: 12, alignItems: "center", justifyContent: "center" }, orderNo: { color: ink, fontSize: 15, fontWeight: "800" }, cardSub: { color: muted, fontSize: 11, marginTop: 2 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 15, marginBottom: 6 }, progressLabel: { color: muted, fontSize: 11, fontWeight: "700" }, progressValue: { color: ink, fontSize: 11, fontWeight: "800" }, track: { height: 7, borderRadius: 5, backgroundColor: "#E6EEF7", overflow: "hidden" }, fill: { height: 7, backgroundColor: "#20A66A", borderRadius: 5 },
  cardFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 13 }, status: { color: "#37629C", backgroundColor: "#EAF3FF", borderRadius: 6, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: "800" }, open: { color: blue, fontSize: 12, fontWeight: "800" },
  error: { flexDirection: "row", gap: 8, backgroundColor: "#FEECEC", borderRadius: 12, padding: 12, marginBottom: 12 }, errorText: { color: "#9F2222", fontSize: 12 }, retry: { color: blue, fontWeight: "800", marginTop: 6 }, empty: { backgroundColor: "white", borderWidth: 1, borderColor: "#DFE7F0", borderRadius: 16, padding: 25, alignItems: "center", gap: 7 }, emptyTitle: { color: ink, fontSize: 16, fontWeight: "800" }, emptyText: { color: muted, textAlign: "center", fontSize: 12, lineHeight: 17 },
});

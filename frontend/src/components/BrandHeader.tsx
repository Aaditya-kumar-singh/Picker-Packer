import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/navigation/AppProvider";

export function BrandHeader() {
  const { picker } = useAuth();
  const inset = useSafeAreaInsets();
  return <View style={[s.header, { paddingTop: Math.max(inset.top, 12) }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open orders" onPress={() => router.push("/orders" as never)} style={s.ordersButton}><Ionicons name="list-outline" size={23} color="white" /></Pressable>
    <View style={s.brand}><View style={s.line}><Text style={s.ybm}>YBM</Text><Text style={s.role}>{picker?.role || "STAFF"}</Text></View><Text style={s.caption}>Warehouse Operations</Text></View>
    <View style={s.live}><Text style={s.liveText}>● Live</Text></View>
    <Pressable accessibilityLabel="Profile" onPress={() => router.push("/profile" as never)}><Ionicons name="person-circle" size={30} color="white" /></Pressable>
  </View>;
}
const s = StyleSheet.create({
  header: { backgroundColor: "#0E2E69", paddingHorizontal: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  brand: { flex: 1 }, line: { flexDirection: "row", alignItems: "center", gap: 6 }, ybm: { fontSize: 21, fontWeight: "900", color: "white" },
  role: { fontSize: 9, fontWeight: "800", color: "white", backgroundColor: "#2563EB", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  caption: { fontSize: 10, color: "#DCE8FF", fontWeight: "600" }, live: { backgroundColor: "#E6F8EE", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14 },
  liveText: { fontSize: 10, color: "#15803D", fontWeight: "800" },
  ordersButton: { minWidth: 35, minHeight: 40, alignItems: "center", justifyContent: "center" },
});

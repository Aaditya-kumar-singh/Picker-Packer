import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/navigation/AppProvider";
import { useSyncStatus } from "@/sync/SyncContext";
import { theme } from "@/components/ui";

export function BrandHeader() {
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const { status } = useSyncStatus();
  const isPacker = picker?.role === "PACKER";
  const roleLabel = isPacker ? "Packer Workspace" : "Picker Workspace";
  const roleColor = isPacker ? theme.packer.primary : theme.picker.primary;
  const roleSoft = isPacker ? theme.packer.light : theme.picker.light;

  const syncLabel =
    status.connectivity === "CHECKING"
      ? "Checking"
      : status.connectivity === "ONLINE"
        ? "Live"
        : status.connectivity === "SERVER_UNREACHABLE"
          ? "Server Err"
          : "Offline";

  const syncColor =
    status.connectivity === "ONLINE"
      ? theme.color.okPrimary
      : status.connectivity === "CHECKING"
        ? theme.color.warnPrimary
        : theme.color.badPrimary;

  return (
    <>
      <StatusBar style="light" />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 0) + 6 }]}>
        <View style={s.topRow}>
          <View style={s.brand}>
            <View style={[s.logo, compact && s.logoCompact]}>
              <Text style={[s.logoText, compact && s.logoTextCompact]}>Y</Text>
            </View>
            <View style={s.brandCopy}>
              <View style={s.nameRow}>
                <Text style={s.name}>YBM</Text>
                <View style={s.badgeWms}>
                  <Text style={s.badgeWmsText}>WMS</Text>
                </View>
              </View>
              <Text style={s.tagline}>Warehouse Operations</Text>
              <Text style={s.subTagline}>Pick • Pack • Dispatch</Text>
            </View>
          </View>

          <View style={s.actions}>
            <View style={[s.syncPill, { borderColor: syncColor }]}>
              <View style={[s.dot, { backgroundColor: syncColor }]} />
              <Text style={[s.syncText, { color: syncColor }]}>{syncLabel}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              style={({ pressed }) => [s.profileButton, pressed ? { opacity: 0.85 } : null]}
              onPress={() => router.push("/profile" as never)}
            >
              <Ionicons name="person" size={17} color={theme.color.primaryDark} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[s.workspace, { backgroundColor: roleSoft, borderColor: roleColor }]}
          onPress={() => router.push("/profile" as never)}
        >
          <View style={[s.workspaceDot, { backgroundColor: roleColor }]} />
          <Text style={[s.workspaceRole, { color: roleColor }]}>{roleLabel}</Text>
          <Text style={s.workspaceUser} numberOfLines={1}>
            {picker?.name ?? "Warehouse user"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={roleColor} />
        </Pressable>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: "#091e3a",
    paddingHorizontal: theme.space.md,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e3a5f",
  },
  topRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space.sm,
  },
  brand: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    fontStyle: "italic",
  },
  logoCompact: {
    width: 42,
    height: 42,
  },
  logoTextCompact: {
    fontSize: 24,
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  badgeWms: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeWmsText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tagline: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "600",
  },
  subTagline: {
    color: "#60a5fa",
    fontSize: 9,
    fontWeight: "500",
    marginTop: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncPill: {
    minHeight: 28,
    paddingHorizontal: 9,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncText: {
    fontSize: 11,
    fontWeight: "800",
  },
  profileButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  workspace: {
    marginTop: 8,
    minHeight: 38,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
  },
  workspaceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  workspaceRole: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  workspaceUser: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: theme.color.ink,
  },
});

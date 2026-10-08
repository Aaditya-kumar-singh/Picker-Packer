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
          ? "Server"
          : "Offline";

  const syncColor =
    status.connectivity === "ONLINE"
      ? theme.color.primary
      : status.connectivity === "CHECKING"
        ? theme.color.warnInk
        : theme.color.critical;

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
            <Text style={s.name}>YBM</Text>
            <Text style={s.tagline}>Warehouse Operations</Text>
            <Text style={s.subTagline}>Pick • Pack • Deliver</Text>
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
            style={s.profileButton}
            onPress={() => router.push("/profile" as never)}
          >
            <Ionicons name="person-outline" size={17} color={theme.color.ink} />
          </Pressable>
        </View>
      </View>

      <View style={[s.workspace, { backgroundColor: roleSoft }]}>
        <View style={[s.workspaceDot, { backgroundColor: roleColor }]} />
        <Text style={[s.workspaceRole, { color: roleColor }]}>{roleLabel}</Text>
        <Text style={s.workspaceUser} numberOfLines={1}>
          {picker?.name ?? "Warehouse user"}
        </Text>
        <Ionicons name="chevron-forward" size={20} color={roleColor} />
      </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: theme.color.primaryDark,
    paddingHorizontal: theme.space.md,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.primaryContainer,
  },
  topRow: {
    minHeight: 64,
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
    width: 58,
    height: 58,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    borderWidth: 2,
    borderColor: theme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: theme.color.onPrimary,
    fontSize: 36,
    fontWeight: "900",
    fontStyle: "italic",
  },
  logoCompact: {
    width: 48,
    height: 48,
  },
  logoTextCompact: {
    fontSize: 30,
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  tagline: {
    color: "#dbeafe",
    fontSize: 11,
    fontWeight: "600",
  },
  subTagline: {
    color: "#bfdbfe",
    fontSize: 9,
    fontWeight: "500",
    marginTop: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  syncPill: {
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    backgroundColor: theme.color.surface,
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
    fontSize: 10,
    fontWeight: "800",
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  workspace: {
    marginTop: 8,
    minHeight: 46,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  workspaceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  workspaceRole: {
    fontSize: 11,
    fontWeight: "900",
  },
  workspaceUser: {
    flex: 1,
    color: "#475569",
    fontSize: 10,
    fontWeight: "600",
  },
});

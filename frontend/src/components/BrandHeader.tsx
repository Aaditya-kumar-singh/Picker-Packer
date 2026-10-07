import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/navigation/AppProvider";
import { useSyncStatus } from "@/sync/SyncContext";
import { theme } from "@/components/ui";

export function BrandHeader() {
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
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
      <StatusBar style="dark" />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 0) + 6 }]}>
      <View style={s.topRow}>
        <View style={s.brand}>
          <View style={s.logo}>
            <Text style={s.logoText}>Y</Text>
          </View>
          <View style={s.brandCopy}>
            <Text style={s.name}>YBM</Text>
            <Text style={s.tagline}>Warehouse Operations</Text>
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
      </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: theme.brandYellow,
    paddingHorizontal: theme.space.md,
    paddingTop: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.brandYellowBorder,
  },
  topRow: {
    minHeight: 42,
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
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    borderWidth: 2,
    borderColor: theme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: theme.color.onPrimary,
    fontSize: 23,
    fontWeight: "900",
    fontStyle: "italic",
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  tagline: {
    color: "#374151",
    fontSize: 10,
    fontWeight: "600",
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
    width: 32,
    height: 32,
    borderRadius: 17,
    backgroundColor: theme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  workspace: {
    marginTop: 5,
    minHeight: 30,
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

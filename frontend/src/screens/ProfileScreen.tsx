import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AppHeader, PrimaryButton, Screen, StatusBadge, theme } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";

export function ProfileScreen() {
  const { picker, logout } = useAuth();
  if (!picker) return null;

  const isPacker = picker.role === "PACKER";
  const roleColor = isPacker ? theme.packer.primary : theme.picker.primary;
  const roleBg = isPacker ? theme.packer.light : theme.picker.light;

  return (
    <Screen>
      <AppHeader title="Operator Profile" sub="Account & Warehouse Assignment" />
      <View style={s.card}>
        <View style={[s.avatar, { backgroundColor: roleColor }]}>
          <Text style={s.avatarText}>{(picker.name || "U").charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={s.name}>{picker.name}</Text>
        <Text style={s.email}>{picker.pickerCode}</Text>
        <View style={[s.roleBadge, { backgroundColor: roleBg, borderColor: roleColor }]}>
          <Ionicons name={isPacker ? "cube" : "cart"} size={14} color={roleColor} />
          <Text style={[s.roleText, { color: roleColor }]}>{picker.role}</Text>
        </View>
      </View>

      <View style={s.details}>
        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="business-outline" size={18} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>ASSIGNED WAREHOUSE</Text>
            <Text style={s.value}>{picker.warehouseName || picker.warehouseId}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="finger-print-outline" size={18} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>WAREHOUSE ID</Text>
            <Text style={s.value}>{picker.warehouseId}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="shield-checkmark-outline" size={18} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>SECURITY CLEARANCE</Text>
            <Text style={s.value}>Operational Execution • Multi-Tenant Isolated</Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: theme.space.md }}>
        <PrimaryButton
          label="LOG OUT OF SHIFT"
          icon="log-out-outline"
          variant="danger"
          onPress={() => void logout().then(() => router.replace("/login" as never))}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: theme.color.surface,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    marginTop: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.space.sm,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
  },
  name: {
    ...(theme.type.titleMd as object),
    color: theme.color.ink,
  },
  email: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginVertical: 4,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    marginTop: 6,
  },
  roleText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  details: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    padding: theme.space.md,
    marginTop: theme.space.md,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    paddingVertical: 6,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.color.surfaceContainerLow,
    alignItems: "center",
    justifyContent: "center",
  },
  detailContent: {
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.color.muted,
    letterSpacing: 0.5,
  },
  value: {
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    fontWeight: "600",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.line,
    marginVertical: 6,
  },
});

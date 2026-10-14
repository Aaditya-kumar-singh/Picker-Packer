// Profile Screen — Operator shift identity, warehouse tenant & authentication details.
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AppHeader, PrimaryButton, Screen, theme } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";

export function ProfileScreen() {
  const { picker, logout, switchRole } = useAuth();
  if (!picker) return null;

  const isPacker = picker.role === "PACKER";
  const roleColor = isPacker ? theme.packer.primary : theme.picker.primary;
  const roleBg = isPacker ? theme.packer.light : theme.picker.light;

  return (
    <Screen contentContainerStyle={s.screenContent}>
      <AppHeader title="Operator Profile" sub="Account & Station Assignment" showBack />

      {/* Operator Card */}
      <View style={s.card}>
        <View style={[s.avatar, { backgroundColor: roleColor }]}>
          <Text style={s.avatarText}>{(picker.name || "U").charAt(0).toUpperCase()}</Text>
        </View>

        <Text style={s.name}>{picker.name}</Text>
        <Text style={s.email}>{picker.pickerCode}</Text>

        <View style={[s.roleBadge, { backgroundColor: roleBg, borderColor: roleColor }]}>
          <Ionicons name={isPacker ? "cube" : "cart"} size={13} color={roleColor} />
          <Text style={[s.roleText, { color: roleColor }]}>{picker.role}</Text>
        </View>
      </View>

      {/* Assignment Details */}
      <View style={s.details}>
        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="business-outline" size={16} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>ASSIGNED WAREHOUSE</Text>
            <Text style={s.value}>{picker.warehouseName || picker.warehouseId}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="finger-print-outline" size={16} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>WAREHOUSE ID</Text>
            <Text style={s.value}>{picker.warehouseId}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>SECURITY CLEARANCE</Text>
            <Text style={s.value}>Operational Execution • Multi-Tenant Isolated</Text>
          </View>
        </View>
      </View>

      {/* Switch Role Button */}
      <View style={{ marginTop: 12 }}>
        <PrimaryButton
          label={`SWITCH TO ${isPacker ? "PICKER" : "PACKER"} DASHBOARD`}
          icon="swap-horizontal-outline"
          onPress={() => {
            switchRole();
            router.replace((isPacker ? "/dashboard" : "/packer-dashboard") as never);
          }}
        />
      </View>

      {/* Logout Action */}
      <View style={s.logoutWrap}>
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
  screenContent: {
    paddingTop: 4,
    paddingBottom: 16,
  },
  card: {
    alignItems: "center",
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginTop: 0,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
  },
  name: {
    ...(theme.type.titleMd as object),
    color: theme.color.ink,
    fontSize: 17,
  },
  email: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    marginTop: 8,
  },
  roleText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  details: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 4,
    marginTop: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    paddingVertical: 2,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.color.surfaceContainerLow,
    alignItems: "center",
    justifyContent: "center",
  },
  detailContent: {
    flex: 1,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    color: theme.color.muted,
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 13,
    color: theme.color.ink,
    fontWeight: "600",
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.line,
    marginVertical: 3,
  },
  logoutWrap: {
    marginTop: 8,
  },
});

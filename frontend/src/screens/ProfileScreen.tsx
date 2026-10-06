import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppHeader, PrimaryButton, Screen, StatusBadge, theme } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";

export function ProfileScreen() {
  const { picker, logout } = useAuth();
  if (!picker) return null;

  return (
    <Screen>
      <AppHeader title="Profile" sub="Account and warehouse details" />
      <View style={s.card}>
        <View style={s.avatar}><Text style={s.avatarText}>{(picker.name || "U").charAt(0).toUpperCase()}</Text></View>
        <Text style={s.name}>{picker.name}</Text>
        <Text style={s.email}>{picker.pickerCode}</Text>
        <StatusBadge text={picker.role} tone="info" />
      </View>

      <View style={s.details}>
        <Text style={s.label}>WAREHOUSE</Text>
        <Text style={s.value}>{picker.warehouseName || picker.warehouseId}</Text>
        <Text style={s.label}>WAREHOUSE ID</Text>
        <Text style={s.value}>{picker.warehouseId}</Text>
        <Text style={s.label}>ACCOUNT ROLE</Text>
        <Text style={s.value}>{picker.role}</Text>
      </View>

      <PrimaryButton
        label="LOG OUT"
        onPress={() => void logout().then(() => router.replace("/login" as never))}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { alignItems: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.lg, padding: theme.space.lg, marginTop: theme.space.sm },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.color.primaryContainer, alignItems: "center", justifyContent: "center", marginBottom: theme.space.sm },
  avatarText: { fontSize: 30, fontWeight: "800", color: theme.color.onPrimary },
  name: { ...theme.type.titleMd, color: theme.color.ink },
  email: { ...theme.type.secondary, color: theme.color.muted, marginVertical: theme.space.xs },
  details: { backgroundColor: theme.color.surfaceContainerLow, borderRadius: theme.radius.lg, padding: theme.space.md, marginVertical: theme.space.sm },
  label: { ...theme.type.caption, color: theme.color.muted, marginTop: theme.space.xs },
  value: { ...theme.type.body, color: theme.color.ink },
});

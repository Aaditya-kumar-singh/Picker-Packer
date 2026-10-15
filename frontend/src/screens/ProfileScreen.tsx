import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Screen } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import * as api from "@/api/warehouseApi";

export function ProfileScreen() {
  const { picker, logout, refreshProfile } = useAuth();
  const role = picker?.role === "PACKER" ? "PACKER" : "PICKER";
  const [staff, setStaff] = useState<api.StaffProfile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "password">("view");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.profile(role);
      setStaff(data); setName(data.name || ""); setPhone(data.phone || "");
      setEmail(data.email || ""); setAddress(data.address || ""); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Profile unavailable"); }
  }, [role]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function save() {
    setBusy(true); setError("");
    try {
      const updated = await api.updateProfile(role, { name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim() });
      setStaff(updated); await refreshProfile(); setMode("view");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save profile"); }
    finally { setBusy(false); }
  }
  async function password() {
    if (!currentPassword || newPassword.length < 6) { setError("Enter current password and a new password of at least 6 characters."); return; }
    setBusy(true); setError("");
    try {
      await api.changePassword(role, currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setMode("view");
      Alert.alert("Password updated", "Your new password is ready to use.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change password"); }
    finally { setBusy(false); }
  }

  if (!picker) return null;
  const row = (icon: keyof typeof Ionicons.glyphMap, label: string, value?: string | number | null) => (
    <View style={s.row} key={label}>
      <View style={s.rowIcon}><Ionicons name={icon} size={17} color="#64748B" /></View>
      <View style={s.rowBody}><Text style={s.label}>{label}</Text><Text style={s.value}>{value || "—"}</Text></View>
    </View>
  );
  const field = (label: string, value: string, onChangeText: (value: string) => void, secureTextEntry = false) => (
    <View style={s.field} key={label}><Text style={s.label}>{label}</Text><TextInput style={s.input} value={value} onChangeText={onChangeText} secureTextEntry={secureTextEntry} autoCapitalize="none" /></View>
  );

  return <Screen contentContainerStyle={s.page}>
    <Text style={s.title}>Operator Profile</Text><Text style={s.subtitle}>Account & Station Assignment</Text>
    <View style={s.hero}>
      <View style={s.avatar}><Text style={s.avatarText}>{(staff?.name || picker.name).charAt(0).toUpperCase()}</Text></View>
      <Text style={s.name}>{staff?.name || picker.name}</Text>
      <Text style={s.phone}>{staff?.phone || picker.pickerCode}</Text>
      <View style={s.badges}><Text style={s.role}>🛒 {role}</Text><Text style={s.active}>● {staff?.status?.toUpperCase() || "ACTIVE"}</Text></View>
    </View>
    {error ? <Text style={s.error}>{error}</Text> : null}
    {!staff && !error ? <ActivityIndicator style={{ margin: 24 }} /> : null}
    {mode === "view" ? <>
      <View style={s.details}>
        {row("finger-print-outline", "STAFF ID", staff?.staffId)}
        {row("call-outline", "PHONE / LOGIN MOBILE", staff?.phone)}
        {row("mail-outline", "EMAIL ADDRESS", staff?.email)}
        {row("business-outline", "ASSIGNED WAREHOUSE / ADDRESS", staff?.address)}
        {row("card-outline", `ID CARD (${staff?.idCardType || "TYPE"})`, staff?.idCardNumber)}
      </View>
      <Pressable style={s.action} onPress={() => setMode("edit")}><Text style={s.actionText}>✎  EDIT PROFILE</Text></Pressable>
      <Pressable style={s.action} onPress={() => setMode("password")}><Text style={s.actionText}>⚿  CHANGE PASSWORD</Text></Pressable>
      <Pressable style={[s.action, s.logout]} onPress={() => void logout()}><Text style={s.logoutText}>⇥  LOG OUT OF SHIFT</Text></Pressable>
    </> : <View style={s.details}>
      <Text style={s.formTitle}>{mode === "edit" ? "Edit profile" : "Change password"}</Text>
      {mode === "edit" ? <>{field("NAME", name, setName)}{field("PHONE", phone, setPhone)}{field("EMAIL", email, setEmail)}{field("ADDRESS", address, setAddress)}</> : <>{field("CURRENT PASSWORD", currentPassword, setCurrentPassword, true)}{field("NEW PASSWORD", newPassword, setNewPassword, true)}</>}
      <Pressable disabled={busy} style={[s.action, s.save]} onPress={() => void (mode === "edit" ? save() : password())}><Text style={s.logoutText}>{busy ? "SAVING…" : "SAVE"}</Text></Pressable>
      <Pressable style={s.action} onPress={() => { setMode("view"); setError(""); }}><Text style={s.actionText}>CANCEL</Text></Pressable>
    </View>}
  </Screen>;
}

const s = StyleSheet.create({
  page: { paddingTop: 10, paddingBottom: 28, backgroundColor: "#F8FAFC" },
  title: { fontSize: 23, fontWeight: "800", color: "#0F172A" }, subtitle: { fontSize: 12, color: "#64748B", marginBottom: 12 },
  hero: { alignItems: "center", backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 18, padding: 16, marginBottom: 12 },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#028BC5", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "white", fontSize: 28, fontWeight: "800" }, name: { fontSize: 17, fontWeight: "800", color: "#172033", marginTop: 8 },
  phone: { fontSize: 12, color: "#64748B", marginTop: 2 }, badges: { flexDirection: "row", gap: 8, marginTop: 8 },
  role: { backgroundColor: "#E0F2FE", color: "#0369A1", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, fontSize: 11, fontWeight: "800" },
  active: { backgroundColor: "#DCFCE7", color: "#15803D", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, fontSize: 11, fontWeight: "800" },
  details: { backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 18, paddingHorizontal: 14, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#CBD5E1" },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }, rowBody: { marginLeft: 8, flex: 1 },
  label: { fontSize: 10, fontWeight: "700", color: "#64748B" }, value: { fontSize: 13, fontWeight: "600", color: "#172033", marginTop: 2 },
  action: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 13, alignItems: "center", padding: 14, backgroundColor: "white", marginBottom: 12 },
  actionText: { color: "#334155", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 }, logout: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  logoutText: { color: "white", fontSize: 14, fontWeight: "800" }, error: { color: "#B91C1C", marginBottom: 10 },
  formTitle: { fontSize: 17, fontWeight: "800", marginVertical: 12 }, field: { marginBottom: 12 }, input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 9, padding: 10, marginTop: 4 },
  save: { backgroundColor: "#0D6EFD", borderColor: "#0D6EFD" },
});

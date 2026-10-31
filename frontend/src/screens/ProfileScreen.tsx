import { Text, TextInput } from "@/components/Typography";
import { useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AppHeader, PrimaryButton, SecondaryButton, Screen, theme } from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { resolvePhotoUrl } from "@/api/http";

export function ProfileScreen() {
  const { picker, logout, updateProfile, toggleStatus, changePassword, refreshProfile, error: authError } = useAuth();
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Edit Profile Modal State
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editIdType, setEditIdType] = useState("");
  const [editIdNumber, setEditIdNumber] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [failedPhotoUri, setFailedPhotoUri] = useState<string | null>(null);

  // Change Password Modal State
  const [passVisible, setPassVisible] = useState(false);
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  if (!picker) return null;

  const isPacker = picker.role === "PACKER";
  const roleColor = isPacker ? theme.packer.primary : theme.picker.primary;
  const roleBg = isPacker ? theme.packer.light : theme.picker.light;
  const p = picker.profile;

  const photoUri = resolvePhotoUrl(p?.photoFilePath);

  function openEditModal() {
    setEditName(p?.name || picker?.name || "");
    setEditPhone(p?.phone || picker?.phone || "");
    setEditEmail(p?.email || picker?.email || "");
    setEditAddress(p?.address || "");
    setEditIdType(p?.idCardType || "AADHAAR");
    setEditIdNumber(p?.idCardNumber || "");
    setEditError(null);
    setEditVisible(true);
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setEditError(null);
    try {
      const result = await updateProfile({
        name: editName.trim() || undefined,
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || null,
        address: editAddress.trim() || null,
        idCardType: editIdType.trim() || null,
        idCardNumber: editIdNumber.trim() || null,
      });
      if (result.ok) {
        await refreshProfile();
      } else {
        setEditError(result.error || authError || "Failed to update profile. Please try again.");
      }
    } catch (e: any) {
      setEditError(e?.message || "Profile update failed.");
    } finally {
      setSavingProfile(false);
    }
  }

  function openPasswordModal() {
    setCurrentPass("");
    setNewPass("");
    setConfirmPass("");
    setPassError(null);
    setPassSuccess(null);
    setShowCurrentPass(false);
    setShowNewPass(false);
    setShowConfirmPass(false);
    setPassVisible(true);
  }

  async function handleChangePassword() {
    if (!currentPass) {
      setPassError("Current password is required");
      return;
    }
    if (newPass.length < 6 || newPass.length > 100) {
      setPassError("New password must be between 6 and 100 characters");
      return;
    }
    if (newPass !== confirmPass) {
      setPassError("Passwords do not match");
      return;
    }

    setSavingPass(true);
    setPassError(null);
    try {
      const result = await changePassword(currentPass, newPass);
      if (result.ok) {
        setPassSuccess("Password updated successfully!");
        setTimeout(() => {
          setPassVisible(false);
        }, 1200);
      } else {
        setPassError(result.error || authError || "Failed to update password. Verify current password.");
      }
    } catch (e: any) {
      setPassError(e?.message || "Failed to change password.");
    } finally {
      setSavingPass(false);
    }
  }

  return (
    <Screen contentContainerStyle={s.screenContent}>
      <AppHeader title="Operator Profile" sub="Account & Station Assignment" showBack />

      {/* Operator Card */}
      <View style={s.card}>
        {photoUri && failedPhotoUri !== photoUri ? (
          <Image source={{ uri: photoUri }} style={s.avatarImage} onError={() => setFailedPhotoUri(photoUri)} />
        ) : (
          <View style={[s.avatar, { backgroundColor: roleColor }]}>
            <Text style={s.avatarText}>{(picker.name || "U").charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <Text style={s.name}>{picker.name}</Text>
        <Text style={s.email}>{picker.phone || picker.pickerCode}</Text>

        <View style={s.badgeRow}>
          <View style={[s.roleBadge, { backgroundColor: roleBg, borderColor: roleColor }]}>
            <Ionicons name={isPacker ? "cube" : "cart"} size={13} color={roleColor} />
            <Text style={[s.roleText, { color: roleColor }]}>{picker.role}</Text>
          </View>

          {p?.rating ? (
            <View style={s.ratingBadge}>
              <Ionicons name="star" size={13} color="#F59E0B" />
              <Text style={s.ratingText}>{Number(p.rating).toFixed(1)}</Text>
            </View>
          ) : null}

          {p?.status ? (
            <View style={[s.statusBadge, p.status.toLowerCase() !== "active" && { backgroundColor: "#F1F5F9" }]}>
              <View style={[s.statusDot, p.status.toLowerCase() !== "active" && { backgroundColor: "#64748B" }]} />
              <Text style={[s.statusText, p.status.toLowerCase() !== "active" && { color: "#475569" }]}>{p.status.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Assignment & Profile Details */}
      <View style={s.details}>
        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="finger-print-outline" size={16} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>STAFF ID</Text>
            <Text style={s.value}>{picker.staffId || picker.id}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="call-outline" size={16} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>PHONE / LOGIN MOBILE</Text>
            <Text style={s.value}>{picker.phone || "Not set"}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="mail-outline" size={16} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>EMAIL ADDRESS</Text>
            <Text style={s.value}>{picker.email || "Not set"}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.detailRow}>
          <View style={s.detailIcon}>
            <Ionicons name="business-outline" size={16} color={theme.color.muted} />
          </View>
          <View style={s.detailContent}>
            <Text style={s.label}>ADDRESS</Text>
            <Text style={s.value}>{p?.address || "Not provided"}</Text>
          </View>
        </View>

        {p?.idCardNumber ? (
          <>
            <View style={s.divider} />
            <View style={s.detailRow}>
              <View style={s.detailIcon}>
                <Ionicons name="card-outline" size={16} color={theme.color.muted} />
              </View>
              <View style={s.detailContent}>
                <Text style={s.label}>ID CARD ({p.idCardType || "AADHAAR"})</Text>
                <Text style={s.value}>{p.idCardNumber}</Text>
              </View>
            </View>
          </>
        ) : null}
      </View>

      {/* Profile Actions */}
      <View style={s.actionsContainer}>
        <SecondaryButton
          label={statusBusy ? "UPDATING STATUS…" : p?.status?.toLowerCase() === "active" ? "GO OFF DUTY" : "GO ON DUTY"}
          icon="power-outline"
          onPress={() => {
            if (statusBusy) return;
            setStatusBusy(true);
            setStatusError(null);
            void toggleStatus().then((result) => {
              if (!result.ok) setStatusError(result.error || "Could not update duty status.");
            }).finally(() => setStatusBusy(false));
          }}
        />
        {statusError ? <Text style={{ color: "#B91C1C" }}>{statusError}</Text> : null}
        <SecondaryButton
          label="EDIT PROFILE"
          icon="create-outline"
          onPress={openEditModal}
        />
        <SecondaryButton
          label="CHANGE PASSWORD"
          icon="key-outline"
          onPress={openPasswordModal}
        />
        <PrimaryButton
          label="LOG OUT OF SHIFT"
          icon="log-out-outline"
          variant="danger"
          onPress={() => void logout().then(() => router.replace("/login" as never))}
        />
      </View>

      <View style={s.brandFooter}>
        <Image
          source={require("../../assets/images/yourbuildmart-wordmark.png")}
          style={s.footerWordmark}
          resizeMode="contain"
          accessibilityLabel="YourBuildMart"
        />
        <Text style={s.footerAppVersion}>YourBuildMart Warehouse Operations, v1.0.2</Text>
      </View>

      {/* Edit Profile Modal */}
      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView style={s.modalKeyboardAvoider} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Profile</Text>
              <Pressable onPress={() => setEditVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.color.ink} />
              </Pressable>
            </View>

            <ScrollView style={s.editFormScroll} contentContainerStyle={s.editFormContent} keyboardShouldPersistTaps="handled">
              <Text style={s.inputLabel}>Full Name</Text>
              <TextInput style={s.modalInput} value={editName} onChangeText={setEditName} placeholder="Name" />

              <Text style={s.inputLabel}>Phone Number</Text>
              <TextInput style={s.modalInput} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" placeholder="Phone" />

              <Text style={s.inputLabel}>Email Address</Text>
              <TextInput style={s.modalInput} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" placeholder="Email" />

              <Text style={s.inputLabel}>Warehouse Address</Text>
              <TextInput style={s.modalInput} value={editAddress} onChangeText={setEditAddress} placeholder="Address / Station" />

              <Text style={s.inputLabel}>ID Card Type</Text>
              <TextInput style={s.modalInput} value={editIdType} onChangeText={setEditIdType} placeholder="AADHAAR / PAN / VOTER" />

              <Text style={s.inputLabel}>ID Card Number</Text>
              <TextInput style={s.modalInput} value={editIdNumber} onChangeText={setEditIdNumber} placeholder="XXXX-1234" />

              {editError ? <Text style={s.errorText}>{editError}</Text> : null}
            </ScrollView>

            <View style={s.modalFooter}>
              <PrimaryButton
                label={savingProfile ? "Saving…" : "SAVE CHANGES"}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              />
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={passVisible} transparent animationType="slide" onRequestClose={() => setPassVisible(false)}>
        <KeyboardAvoidingView style={s.modalKeyboardAvoider} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Change Password</Text>
              <Pressable onPress={() => setPassVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.color.ink} />
              </Pressable>
            </View>

            <ScrollView style={s.passwordFormScroll} contentContainerStyle={s.editFormContent} keyboardShouldPersistTaps="handled">
            <Text style={s.inputLabel}>Current Password</Text>
            <View style={s.passwordInputWrap}>
              <TextInput
                style={[s.modalInput, s.passwordInput]}
                value={currentPass}
                onChangeText={setCurrentPass}
                secureTextEntry={!showCurrentPass}
                placeholder="Enter current password"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showCurrentPass ? "Hide current password" : "Show current password"}
                onPress={() => setShowCurrentPass((value) => !value)}
                style={s.passwordEyeButton}
              >
                <Ionicons name={showCurrentPass ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
              </Pressable>
            </View>

            <Text style={s.inputLabel}>New Password (6-100 characters)</Text>
            <View style={s.passwordInputWrap}>
              <TextInput
                style={[s.modalInput, s.passwordInput]}
                value={newPass}
                onChangeText={setNewPass}
                secureTextEntry={!showNewPass}
                placeholder="Enter new secure password"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showNewPass ? "Hide new password" : "Show new password"}
                onPress={() => setShowNewPass((value) => !value)}
                style={s.passwordEyeButton}
              >
                <Ionicons name={showNewPass ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
              </Pressable>
            </View>

            <Text style={s.inputLabel}>Confirm New Password</Text>
            <View style={s.passwordInputWrap}>
              <TextInput
                style={[s.modalInput, s.passwordInput]}
                value={confirmPass}
                onChangeText={setConfirmPass}
                secureTextEntry={!showConfirmPass}
                placeholder="Re-enter new password"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showConfirmPass ? "Hide confirmed password" : "Show confirmed password"}
                onPress={() => setShowConfirmPass((value) => !value)}
                style={s.passwordEyeButton}
              >
                <Ionicons name={showConfirmPass ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
              </Pressable>
            </View>

            {passError ? <Text style={s.errorText}>{passError}</Text> : null}
            {passSuccess ? <Text style={s.successText}>{passSuccess}</Text> : null}
            </ScrollView>

            <View style={s.modalFooter}>
              <PrimaryButton
                label={savingPass ? "Updating…" : "UPDATE PASSWORD"}
                onPress={handleChangePassword}
                disabled={savingPass}
              />
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
    paddingBottom: 24,
  },
  card: {
    alignItems: "center",
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginTop: 0,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 6,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
  },
  name: {
    ...(theme.type.titleMd as object),
    color: theme.color.ink,
    fontSize: 18,
  },
  email: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  roleText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803D",
  },
  details: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: theme.space.md,
    paddingVertical: 6,
    marginTop: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    paddingVertical: 4,
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
    marginVertical: 4,
  },
  actionsContainer: {
    marginTop: 14,
    gap: 8,
  },
  modalKeyboardAvoider: {
    flex: 1,
  },
  editFormScroll: {
    flexShrink: 1,
    maxHeight: 420,
  },
  passwordFormScroll: {
    flexShrink: 1,
    maxHeight: 420,
  },
  editFormContent: {
    paddingBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  modalBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontFamily: "OpenSans",
    fontSize: 18,
    fontWeight: "700",
    color: theme.color.ink,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.color.muted,
    marginTop: 10,
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.color.ink,
  },
  passwordInputWrap: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 48,
  },
  passwordEyeButton: {
    position: "absolute",
    right: 2,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalFooter: {
    marginTop: 16,
  },
  profileSuccessContent: {
    alignItems: "center",
    paddingVertical: 12,
  },
  profileSuccessTitle: {
    color: theme.color.ink,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  profileSuccessMessage: {
    color: theme.color.muted,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  profileSuccessButton: {
    alignSelf: "stretch",
    marginTop: 20,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 12,
    marginTop: 8,
    fontWeight: "600",
  },
  successText: {
    color: "#16A34A",
    fontSize: 12,
    marginTop: 8,
    fontWeight: "600",
  },
  brandFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 28,
    paddingBottom: 20,
    marginTop: 8,
  },
  footerWordmark: {
    width: 140,
    height: 38,
    marginBottom: 6,
  },
  footerAppVersion: {
    fontSize: 11,
    color: theme.color.muted,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

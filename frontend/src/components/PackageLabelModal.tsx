import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { SvgXml } from "react-native-svg";
import { Text, TextInput } from "@/components/Typography";
import { createPackageBarcode, packageLabelHtml } from "@/utils/packageLabel";

type Props = {
  visible: boolean;
  orderNumber: string;
  onClose: () => void;
  onLabelAttached: (packageId: string) => void;
  backendMessage?: string | null;
};

export function PackageLabelModal({ visible, orderNumber, onClose, onLabelAttached, backendMessage }: Props) {
  const [packageId, setPackageId] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printWindowOpened, setPrintWindowOpened] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const id = packageId.trim();

  useEffect(() => {
    setPackageId("");
    setPrintWindowOpened(false);
    setPrintError(null);
  }, [orderNumber]);

  const barcode = useMemo(() => {
    if (!id) return null;
    try {
      return createPackageBarcode(id);
    } catch {
      return null;
    }
  }, [id]);

  async function openPrintWindow() {
    if (!barcode || printing) return;
    setPrinting(true);
    setPrintError(null);
    setPrintWindowOpened(false);
    try {
      await Print.printAsync({ html: packageLabelHtml(id, orderNumber, barcode) });
      // Android resolves when the print window opens, before the printer finishes.
      setPrintWindowOpened(true);
    } catch (error: any) {
      setPrintError(error?.message || "Could not open the printer. Check the device's print service.");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.card}>
          <View style={s.header}>
            <View style={s.headerCopy}>
              <Text style={s.title}>Print Package Barcode</Text>
              <Text style={s.subtitle} numberOfLines={1}>Order {orderNumber}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close package label" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={23} color="#0F172A" />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.fieldLabel}>PACKAGE ID FROM WAREHOUSE SYSTEM</Text>
            <TextInput
              value={packageId}
              onChangeText={(value) => {
                setPackageId(value);
                setPrintWindowOpened(false);
                setPrintError(null);
              }}
              placeholder="Enter package ID"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
              style={s.input}
            />

            <View style={s.preview}>
              {barcode ? (
                <>
                  <View style={s.barcodeBox}>
                    <SvgXml xml={barcode} width="100%" height={92} />
                  </View>
                  <Text style={s.previewCaption}>CODE 128, PACKAGE ID</Text>
                  <Text style={s.previewId} selectable>{id}</Text>
                  <Text style={s.previewOrder}>Order {orderNumber}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="barcode-outline" size={48} color="#94A3B8" />
                  <Text style={s.placeholder}>Enter the package ID to preview its barcode label.</Text>
                </>
              )}
            </View>

            <View style={s.infoRow}>
              <Ionicons name="print-outline" size={18} color="#D95D00" />
              <Text style={s.infoText}>Choose your connected label printer in the Android print window. Use 75 × 50 mm adhesive labels.</Text>
            </View>
            <View style={s.warningRow}>
              <Ionicons name="information-circle-outline" size={18} color="#92400E" />
              <Text style={s.warningText}>The current server error asks for a packing QR code. This Code 128 barcode may not meet that server requirement, so rider assignment can still be blocked.</Text>
            </View>
            {printWindowOpened ? (
              <Text style={s.successText}>Print window opened. Confirm printing there, then check and attach the sticker.</Text>
            ) : null}
            {printError ? <Text style={s.errorText}>{printError}</Text> : null}
            {backendMessage ? <Text style={s.backendError}>{backendMessage}</Text> : null}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open print window for package barcode label"
            accessibilityState={{ disabled: !barcode || printing }}
            disabled={!barcode || printing}
            onPress={() => void openPrintWindow()}
            style={({ pressed }) => [s.printButton, (!barcode || printing) && s.disabled, pressed && barcode && !printing && { opacity: 0.85 }]}
          >
            <Ionicons name="print-outline" size={19} color="#FFFFFF" />
            <Text style={s.printButtonText}>{printing ? "Opening printer…" : "Choose Printer & Print"}</Text>
          </Pressable>
          {printWindowOpened && barcode ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onLabelAttached(id)}
              style={s.attachedButton}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#15803D" />
              <Text style={s.attachedButtonText}>Label attached — continue</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 440, maxHeight: "90%", alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 20, padding: 18 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  fieldLabel: { fontSize: 11, fontWeight: "800", color: "#334155", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#0F172A", marginBottom: 12 },
  preview: { minHeight: 226, alignItems: "center", justifyContent: "center", padding: 12, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14 },
  barcodeBox: { width: "100%", height: 98, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", paddingHorizontal: 8 },
  previewCaption: { fontSize: 10, fontWeight: "800", color: "#64748B", marginTop: 5 },
  previewId: { fontSize: 15, fontWeight: "800", color: "#0F172A", textAlign: "center" },
  previewOrder: { fontSize: 11, color: "#475569", marginTop: 3 },
  placeholder: { fontSize: 12, color: "#64748B", textAlign: "center", marginTop: 9 },
  infoRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 12 },
  infoText: { flex: 1, fontSize: 11, lineHeight: 16, color: "#475569" },
  warningRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10, padding: 10, backgroundColor: "#FFFBEB", borderRadius: 9 },
  warningText: { flex: 1, fontSize: 11, lineHeight: 16, color: "#92400E" },
  successText: { color: "#15803D", fontSize: 11, fontWeight: "700", marginTop: 10 },
  errorText: { color: "#B91C1C", fontSize: 11, fontWeight: "700", marginTop: 10 },
  backendError: { color: "#B91C1C", fontSize: 11, fontWeight: "700", marginTop: 10, padding: 10, backgroundColor: "#FEF2F2", borderRadius: 8 },
  printButton: { minHeight: 48, marginTop: 14, borderRadius: 12, backgroundColor: "#D95D00", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  printButtonText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  attachedButton: { minHeight: 42, marginTop: 8, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#F0FDF4" },
  attachedButtonText: { fontSize: 12, fontWeight: "800", color: "#15803D" },
  disabled: { opacity: 0.5 },
});

import { useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { Text } from "@/components/Typography";
import { packerAppApi } from "@/api/packerAppApi";
import { packageLabelHtml } from "@/utils/packageLabel";
import {
  DEFAULT_PACKAGE_PRINTER_SETTINGS,
  loadPackagePrinterSettings,
  loadSavedPrinter,
  normalizePackagePrinterSettings,
  savePackagePrinterSettings,
  saveSelectedPrinter,
  type PackagePrinterSettings,
} from "@/utils/packagePrinterSettings";

type Props = {
  visible: boolean;
  orderId: number;
  orderNumber: string;
  onClose: () => void;
  onLabelAttached: (packageId: string) => void;
  backendMessage?: string | null;
};

export function PackageLabelModal({ visible, orderId, orderNumber, onClose, onLabelAttached, backendMessage }: Props) {
  const [barcodeImage, setBarcodeImage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printWindowOpened, setPrintWindowOpened] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PackagePrinterSettings>(DEFAULT_PACKAGE_PRINTER_SETTINGS);
  const settingsRef = useRef(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<{ name: string; url: string } | null>(null);
  const [selectingPrinter, setSelectingPrinter] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([loadPackagePrinterSettings(), loadSavedPrinter()]).then(([savedSettings, printer]) => {
      if (!active) return;
      setSettings(savedSettings);
      settingsRef.current = savedSettings;
      setSelectedPrinter(printer);
      setSettingsLoaded(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    setBarcodeImage("");
    setPrintWindowOpened(false);
    setPrintError(null);
  }, [orderId]);

  useEffect(() => {
    if (!visible || barcodeImage || generating) return;
    let active = true;
    setGenerating(true);
    setPrintError(null);
    void packerAppApi.generatePackingBarcode(orderId)
      .then((value) => { if (active) setBarcodeImage(value); })
      .catch((error: any) => {
        if (active) setPrintError(error?.message || "Could not generate the packing barcode.");
      })
      .finally(() => { if (active) setGenerating(false); });
    return () => { active = false; };
  }, [visible, orderId, barcodeImage]);

  function retryGenerate() {
    setPrintError(null);
    setGenerating(true);
    void packerAppApi.generatePackingBarcode(orderId)
      .then(setBarcodeImage)
      .catch((error: any) => setPrintError(error?.message || "Could not generate the packing barcode."))
      .finally(() => setGenerating(false));
  }

  const barcodePreview = barcodeImage || null;
  const previewScale = Math.min(240 / settings.paperWidthMm, 158 / settings.paperHeightMm);
  const horizontalJustify = settings.horizontalAlign === "left" ? "flex-start" : settings.horizontalAlign === "right" ? "flex-end" : "center";
  const verticalJustify = settings.verticalAlign === "top" ? "flex-start" : settings.verticalAlign === "bottom" ? "flex-end" : "center";

  async function updateSettings(patch: Partial<PackagePrinterSettings>) {
    const next = normalizePackagePrinterSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettings(next);
    setSettingsError(null);
    try {
      await savePackagePrinterSettings(next);
    } catch {
      setSettingsError("Could not save these settings on this device.");
    }
  }

  async function choosePrinter() {
    if (Platform.OS !== "ios") return;
    setSelectingPrinter(true);
    setSettingsError(null);
    try {
      const printer = await Print.selectPrinterAsync();
      const saved = { name: printer.name, url: printer.url };
      setSelectedPrinter(saved);
      await saveSelectedPrinter(saved);
    } catch (error: any) {
      if (error?.message) setSettingsError(error.message);
    } finally {
      setSelectingPrinter(false);
    }
  }

  async function openPrintWindow() {
    if (!barcodePreview || printing) return;
    setPrinting(true);
    setPrintError(null);
    setPrintWindowOpened(false);
    try {
      await Print.printAsync({
        html: packageLabelHtml(barcodePreview, orderNumber, settings),
        ...(Platform.OS === "ios" && selectedPrinter ? { printerUrl: selectedPrinter.url } : {}),
      });
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

          <ScrollView
            style={s.modalScroll}
            contentContainerStyle={s.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator
          >
            <View style={s.preview}>
              {barcodePreview ? (
                <View style={[s.labelPreview, {
                  width: settings.paperWidthMm * previewScale,
                  height: settings.paperHeightMm * previewScale,
                  padding: settings.marginMm * previewScale,
                }]}>
                  <Text style={s.previewCaption}>YOURBUILDMART, PACKING BARCODE</Text>
                  <View style={{ flex: 1, width: "100%", flexDirection: "row", alignItems: verticalJustify, justifyContent: horizontalJustify, overflow: "hidden" }}>
                    <Image source={{ uri: barcodePreview }} style={{ width: settings.barcodeWidthMm * previewScale, height: settings.barcodeHeightMm * previewScale }} resizeMode="contain" />
                  </View>
                  <Text style={s.previewOrder}>Order {orderNumber}</Text>
                </View>
              ) : (
                <>
                  <Ionicons name="barcode-outline" size={48} color="#94A3B8" />
                  <Text style={s.placeholder}>{generating ? "Generating package barcode…" : "Package barcode will appear here."}</Text>
                </>
              )}
            </View>

            <View style={s.infoRow}>
              <Ionicons name="print-outline" size={18} color="#D95D00" />
              <Text style={s.infoText}>{Platform.OS === "ios" && selectedPrinter ? `Saved printer: ${selectedPrinter.name}` : "Choose your connected Bluetooth or Wi-Fi printer in the system print screen."} Copies and printer-specific options are set there.</Text>
            </View>
            <Pressable accessibilityRole="button" disabled={!settingsLoaded} onPress={() => setSettingsOpen((open) => !open)} style={[s.settingsToggle, !settingsLoaded && s.disabled]}>
              <Ionicons name="settings-outline" size={17} color="#C2410C" />
              <Text style={s.settingsToggleText}>{settingsOpen ? "Hide printer & label settings" : "Printer & label settings"}</Text>
              <Ionicons name={settingsOpen ? "chevron-up" : "chevron-down"} size={16} color="#C2410C" />
            </Pressable>
            {settingsOpen ? (
              <View style={s.settingsPanel}>
                <Text style={s.settingsHeading}>CONNECTED PRINTER</Text>
                {Platform.OS === "ios" ? (
                  <>
                    <Pressable accessibilityRole="button" disabled={selectingPrinter} onPress={() => void choosePrinter()} style={s.settingsAction}>
                      <Text style={s.settingsActionText}>{selectingPrinter ? "Searching for printers…" : selectedPrinter ? "Choose a different printer" : "Find and save printer"}</Text>
                    </Pressable>
                    {selectedPrinter ? <Text style={s.settingsHelp}>Saved on this device: {selectedPrinter.name}</Text> : null}
                  </>
                ) : (
                  <Text style={s.settingsHelp}>Android opens the system print screen. Pair Bluetooth printers or add Wi-Fi printers in Android settings; select the printer there when printing.</Text>
                )}

                <Text style={[s.settingsHeading, s.settingsSectionHeading]}>PAPER SIZE (MM)</Text>
                <View style={s.presetRow}>
                  <Pressable onPress={() => void updateSettings({ paperWidthMm: 75, paperHeightMm: 50 })} style={s.presetButton}><Text style={s.presetText}>75 × 50</Text></Pressable>
                  <Pressable onPress={() => void updateSettings({ paperWidthMm: 100, paperHeightMm: 150 })} style={s.presetButton}><Text style={s.presetText}>100 × 150</Text></Pressable>
                </View>
                <SettingStepper label="Paper width" value={settings.paperWidthMm} onChange={(value) => void updateSettings({ paperWidthMm: value })} />
                <SettingStepper label="Paper height" value={settings.paperHeightMm} onChange={(value) => void updateSettings({ paperHeightMm: value })} />
                <SettingStepper label="Margins" value={settings.marginMm} onChange={(value) => void updateSettings({ marginMm: value })} />
                <Text style={[s.settingsHeading, s.settingsSectionHeading]}>BARCODE SIZE (MM)</Text>
                <SettingStepper label="Width" value={settings.barcodeWidthMm} onChange={(value) => void updateSettings({ barcodeWidthMm: value })} />
                <SettingStepper label="Height" value={settings.barcodeHeightMm} onChange={(value) => void updateSettings({ barcodeHeightMm: value })} />
                <Text style={[s.settingsHeading, s.settingsSectionHeading]}>ALIGNMENT</Text>
                <AlignmentOptions label="Horizontal" value={settings.horizontalAlign} options={["left", "center", "right"]} onChange={(value) => void updateSettings({ horizontalAlign: value as PackagePrinterSettings["horizontalAlign"] })} />
                <AlignmentOptions label="Vertical" value={settings.verticalAlign} options={["top", "center", "bottom"]} onChange={(value) => void updateSettings({ verticalAlign: value as PackagePrinterSettings["verticalAlign"] })} />
                {!settingsLoaded ? <Text style={s.settingsHelp}>Loading saved settings…</Text> : <Text style={s.savedText}>Settings save automatically on this device.</Text>}
                {settingsError ? <Text style={s.errorText}>{settingsError}</Text> : null}
              </View>
            ) : null}
            <View style={s.warningRow}>
              <Ionicons name="information-circle-outline" size={18} color="#92400E" />
              <Text style={s.warningText}>This barcode is generated by the warehouse server and is used to verify the packed order.</Text>
            </View>
            {printWindowOpened ? (
              <Text style={s.successText}>Print screen opened. Confirm printing there, then check and attach the sticker.</Text>
            ) : null}
            {printError ? (
              <>
                <Text style={s.errorText}>{printError}</Text>
                {!barcodeImage ? (
                  <Pressable accessibilityRole="button" onPress={retryGenerate} style={s.retryButton}>
                    <Text style={s.retryButtonText}>Generate Barcode Again</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
            {backendMessage ? <Text style={s.backendError}>{backendMessage}</Text> : null}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Print package barcode"
            accessibilityState={{ disabled: !barcodePreview || printing || generating }}
            disabled={!barcodePreview || printing || generating}
            onPress={() => void openPrintWindow()}
            style={({ pressed }) => [s.printButton, (!barcodePreview || printing || generating) && s.disabled, pressed && barcodePreview && !printing && !generating && { opacity: 0.85 }]}
          >
            <Ionicons name={printWindowOpened ? "refresh" : "print-outline"} size={19} color="#FFFFFF" />
            <Text style={s.printButtonText}>{generating ? "Generating barcode…" : printing ? "Opening printer…" : printWindowOpened ? "Reprint Package Barcode" : "Choose Printer & Print"}</Text>
          </Pressable>
          {printWindowOpened && barcodePreview ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onLabelAttached(barcodeImage)}
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
  card: { width: "100%", maxWidth: 440, maxHeight: "92%", alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 20, padding: 18 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  modalScroll: { flexShrink: 1 },
  modalScrollContent: { paddingBottom: 8 },
  preview: { minHeight: 226, alignItems: "center", justifyContent: "center", padding: 12, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14 },
  labelPreview: { alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1", overflow: "hidden" },
  previewCaption: { fontSize: 10, fontWeight: "800", color: "#64748B", marginTop: 5 },
  previewOrder: { fontSize: 8, color: "#475569", marginTop: 1 },
  placeholder: { fontSize: 12, color: "#64748B", textAlign: "center", marginTop: 9 },
  infoRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 12 },
  infoText: { flex: 1, fontSize: 11, lineHeight: 16, color: "#475569" },
  settingsToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12, borderRadius: 10, backgroundColor: "#FFF7ED" },
  settingsToggleText: { fontSize: 12, fontWeight: "800", color: "#C2410C" },
  settingsPanel: { padding: 12, marginTop: 8, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, backgroundColor: "#FFFFFF" },
  settingsHeading: { fontSize: 10, fontWeight: "900", color: "#64748B", letterSpacing: 0.5 },
  settingsSectionHeading: { marginTop: 14, marginBottom: 6 },
  settingsHelp: { fontSize: 11, lineHeight: 16, color: "#64748B", marginTop: 6 },
  settingsAction: { minHeight: 38, justifyContent: "center", alignItems: "center", borderRadius: 9, backgroundColor: "#EFF6FF", marginTop: 7 },
  settingsActionText: { fontSize: 12, fontWeight: "800", color: "#1D4ED8" },
  presetRow: { flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 6 },
  presetButton: { minHeight: 34, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#F1F5F9" },
  presetText: { fontSize: 11, fontWeight: "800", color: "#334155" },
  stepperRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  stepperLabel: { flex: 1, flexShrink: 1, fontSize: 13, color: "#334155" },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: 7 },
  stepperButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#F1F5F9" },
  stepperButtonText: { fontSize: 18, fontWeight: "700", color: "#334155" },
  stepperInput: { width: 68, height: 36, paddingHorizontal: 4, textAlign: "center", textAlignVertical: "center", includeFontPadding: false, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, fontSize: 15, fontWeight: "700", color: "#0F172A", backgroundColor: "#FFFFFF" },
  alignRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  alignLabel: { fontSize: 12, color: "#334155" },
  alignOptions: { flexDirection: "row", gap: 4 },
  alignOption: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7, backgroundColor: "#F1F5F9" },
  alignOptionSelected: { backgroundColor: "#FFEDD5" },
  alignOptionText: { fontSize: 10, color: "#475569", textTransform: "capitalize" },
  alignOptionTextSelected: { color: "#C2410C", fontWeight: "800" },
  savedText: { fontSize: 10, fontWeight: "700", color: "#15803D", marginTop: 8 },
  warningRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10, padding: 10, backgroundColor: "#FFFBEB", borderRadius: 9 },
  warningText: { flex: 1, fontSize: 11, lineHeight: 16, color: "#92400E" },
  successText: { color: "#15803D", fontSize: 11, fontWeight: "700", marginTop: 10 },
  errorText: { color: "#B91C1C", fontSize: 11, fontWeight: "700", marginTop: 10 },
  retryButton: { minHeight: 38, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF7ED", borderRadius: 10, marginTop: 8 },
  retryButtonText: { fontSize: 12, fontWeight: "800", color: "#C2410C" },
  backendError: { color: "#B91C1C", fontSize: 11, fontWeight: "700", marginTop: 10, padding: 10, backgroundColor: "#FEF2F2", borderRadius: 8 },
  printButton: { minHeight: 48, marginTop: 14, borderRadius: 12, backgroundColor: "#D95D00", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  printButtonText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  attachedButton: { minHeight: 42, marginTop: 8, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#F0FDF4" },
  attachedButtonText: { fontSize: 12, fontWeight: "800", color: "#15803D" },
  disabled: { opacity: 0.5 },
});

function SettingStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <View style={s.stepperRow}>
      <Text style={s.stepperLabel}>{label}</Text>
      <View style={s.stepperControls}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(Math.max(0, value - 1))} style={s.stepperButton}><Text style={s.stepperButtonText}>−</Text></Pressable>
        <TextInput
          value={draft}
          onChangeText={(text) => setDraft(text.replace(/[^0-9]/g, ""))}
          onEndEditing={() => onChange(Number(draft) || value)}
          keyboardType="number-pad"
          style={s.stepperInput}
          accessibilityLabel={`${label} in millimeters`}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => onChange(value + 1)} style={s.stepperButton}><Text style={s.stepperButtonText}>+</Text></Pressable>
      </View>
    </View>
  );
}

function AlignmentOptions<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (value: T) => void }) {
  return (
    <View style={s.alignRow}>
      <Text style={s.alignLabel}>{label}</Text>
      <View style={s.alignOptions}>
        {options.map((option) => (
          <Pressable key={option} onPress={() => onChange(option)} style={[s.alignOption, value === option && s.alignOptionSelected]}>
            <Text style={[s.alignOptionText, value === option && s.alignOptionTextSelected]}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

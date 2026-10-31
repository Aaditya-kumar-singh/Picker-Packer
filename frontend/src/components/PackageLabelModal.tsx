import { useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { getPrintLogoSource } from "@/utils/printLogoAsset";
import { Text } from "@/components/Typography";
import { packerAppApi } from "@/api/packerAppApi";
import { getPackageLabelLayout, packageLabelHtml, type LabelBox } from "@/utils/packageLabel";
import { printPackageLabel } from "@/utils/printPackageLabel";
import {
  DEFAULT_PACKAGE_PRINTER_SETTINGS,
  PAPER_SIZE_PRESETS,
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
  const { width: windowWidth } = useWindowDimensions();
  const [barcodeImage, setBarcodeImage] = useState("");
  const [barcodeDimensions, setBarcodeDimensions] = useState<{ uri: string; ratio: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printWindowOpened, setPrintWindowOpened] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PackagePrinterSettings>(DEFAULT_PACKAGE_PRINTER_SETTINGS);
  const settingsRef = useRef(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"paper" | "margins" | "layout" | "barcode">("paper");
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

  useEffect(() => {
    if (!barcodeImage) return;
    let active = true;
    Image.getSize(barcodeImage,
      (width, height) => { if (active && height > 0) setBarcodeDimensions({ uri: barcodeImage, ratio: width / height }); },
      () => { /* Fall back to the saved aspect ratio if metadata is unavailable. */ });
    return () => { active = false; };
  }, [barcodeImage]);

  const barcodePreview = barcodeImage || null;
  const barcodeAspectRatio = barcodeDimensions?.uri === barcodeImage ? barcodeDimensions.ratio : undefined;
  const previewMaxWidth = Math.min(320, Math.max(200, windowWidth - 96));
  const previewScale = Math.min(previewMaxWidth / settings.paperWidthMm, 320 / settings.paperHeightMm);
  const labelWidthPx = settings.paperWidthMm * previewScale;
  const labelHeightPx = settings.paperHeightMm * previewScale;
  const labelLayout = getPackageLabelLayout(settings, orderNumber, barcodeAspectRatio);
  const portrait = settings.paperHeightMm >= settings.paperWidthMm;

  function changeOrientation(next: "portrait" | "landscape") {
    if ((next === "portrait") !== portrait) {
      void updateSettings({ paperWidthMm: settings.paperHeightMm, paperHeightMm: settings.paperWidthMm });
    }
  }
  const previewBox = (box: LabelBox) => ({
    position: "absolute" as const,
    left: box.x * previewScale,
    top: box.y * previewScale,
    width: box.width * previewScale,
    height: box.height * previewScale,
  });
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
    if (!barcodePreview || printing || !settingsLoaded || labelLayout.error) return;
    setPrinting(true);
    setPrintError(null);
    setPrintWindowOpened(false);
    try {
      const logoImage = await getPrintLogoSource();
      await printPackageLabel(
        packageLabelHtml(barcodePreview, orderNumber, settings, logoImage, barcodeAspectRatio),
        settings,
        Platform.OS === "ios" ? selectedPrinter?.url : undefined,
      );
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
            <View style={[s.preview, { minHeight: Math.max(226, labelHeightPx + 54) }]}>
              {barcodePreview ? (
                <View style={[s.labelPreview, { width: labelWidthPx, height: labelHeightPx }]}>
                  <Image
                    source={require("../../assets/images/yourbuildmart-wordmark.png")}
                    style={[previewBox(labelLayout.logo), { tintColor: "#000000" }]}
                    resizeMode="cover"
                    accessibilityLabel="YourBuildMart logo in black and white"
                  />
                  <Image
                    source={{ uri: barcodePreview }}
                    style={previewBox(labelLayout.barcode)}
                    resizeMode="contain"
                    accessibilityLabel="Packing barcode"
                  />
                  <Text
                    style={[s.previewOrder, previewBox(labelLayout.order), {
                      textAlign: settings.horizontalAlign,
                      fontFamily: Platform.OS === "android" ? "sans-serif" : "Arial",
                      fontSize: labelLayout.orderFontMm * previewScale,
                      lineHeight: labelLayout.order.height * previewScale,
                    }]}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >{labelLayout.orderText}</Text>
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
              <Text style={s.infoText}>{settings.paperWidthMm} × {settings.paperHeightMm} mm label · {settings.autoFit ? "Auto fit" : "Manual fit"}. Match this page size with the printer settings in the system print screen.</Text>
            </View>
            <Pressable accessibilityRole="button" disabled={!settingsLoaded} onPress={() => setSettingsOpen((open) => !open)} style={[s.settingsToggle, !settingsLoaded && s.disabled]}>
              <Ionicons name="settings-outline" size={17} color="#C2410C" />
              <Text style={s.settingsToggleText}>{settingsOpen ? "Hide printer & label settings" : "Printer & label settings"}</Text>
              <Ionicons name={settingsOpen ? "chevron-up" : "chevron-down"} size={16} color="#C2410C" />
            </Pressable>
            {settingsOpen ? (
              <View style={s.settingsPanel}>
                <View style={s.tabs}>
                  {(["paper", "margins", "layout", "barcode"] as const).map((tab) => (
                    <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: settingsTab === tab }}
                      accessibilityLabel={`Page setup: ${tab}`} onPress={() => setSettingsTab(tab)}
                      style={[s.tab, settingsTab === tab && s.tabActive]}>
                      <Text style={[s.tabText, settingsTab === tab && s.tabTextActive]}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
                    </Pressable>
                  ))}
                </View>
                {settingsTab === "paper" ? (
                  <>
                    <Text style={[s.settingsHeading, s.settingsSectionHeading]}>CONNECTED PRINTER</Text>
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
                  {PAPER_SIZE_PRESETS.map((preset) => {
                    const selected = (settings.paperWidthMm === preset.width && settings.paperHeightMm === preset.height)
                      || (settings.paperWidthMm === preset.height && settings.paperHeightMm === preset.width);
                    return (
                      <Pressable key={preset.label} accessibilityRole="button"
                        accessibilityState={{ selected }} accessibilityLabel={`Use ${preset.label} paper`}
                        onPress={() => void updateSettings({ paperWidthMm: preset.width, paperHeightMm: preset.height })}
                        style={[s.presetButton, selected && s.presetSelected]}>
                        <Text style={[s.presetText, selected && s.presetSelectedText]}>{preset.label}</Text>
                      </Pressable>
                    );
                  })}



                </View>
                <SettingStepper label="Paper width" value={settings.paperWidthMm} onChange={(value) => void updateSettings({ paperWidthMm: value })} />
                <SettingStepper label="Paper height" value={settings.paperHeightMm} onChange={(value) => void updateSettings({ paperHeightMm: value })} />
                <AlignmentOptions label="Orientation" value={portrait ? "portrait" : "landscape"} options={["portrait", "landscape"]} onChange={changeOrientation} />
                <Text style={s.settingsHelp}>Loaded paper size cannot be detected with the current print integration. Match the size here and in the system print dialog.</Text>
                  </>
                ) : null}
                {settingsTab === "margins" ? (
                  <>
                    <Text style={[s.settingsHeading, s.settingsSectionHeading]}>PAGE MARGINS · MM</Text>
                    <SettingStepper label="Top" value={settings.marginTopMm} onChange={(value) => void updateSettings({ marginTopMm: value })} />
                    <SettingStepper label="Bottom" value={settings.marginBottomMm} onChange={(value) => void updateSettings({ marginBottomMm: value })} />
                    <SettingStepper label="Left" value={settings.marginLeftMm} onChange={(value) => void updateSettings({ marginLeftMm: value })} />
                    <SettingStepper label="Right" value={settings.marginRightMm} onChange={(value) => void updateSettings({ marginRightMm: value })} />
                    <SettingStepper label="Gutter" value={settings.gutterMm} onChange={(value) => void updateSettings({ gutterMm: value })} />
                    <AlignmentOptions label="Gutter side" value={settings.gutterPosition} options={["left", "right"]} onChange={(value) => void updateSettings({ gutterPosition: value })} />
                    <Text style={s.settingsHelp}>Printable area: {labelLayout.printableWidthMm.toFixed(1)} × {labelLayout.printableHeightMm.toFixed(1)} mm.</Text>
                  </>
                ) : null}
                {settingsTab === "barcode" ? (
                  <>
                    <Text style={[s.settingsHeading, s.settingsSectionHeading]}>BARCODE SIZE · MM</Text>
                    <ToggleSetting label="Automatically fit barcode to paper" value={settings.autoFit} onChange={(value) => void updateSettings({ autoFit: value })} />
                    {!settings.autoFit ? (
                      <>
                <SettingStepper label="Width" value={settings.barcodeWidthMm} onChange={(value) => void updateSettings({ barcodeWidthMm: value })} />
                <SettingStepper label="Height" value={settings.barcodeHeightMm} onChange={(value) => void updateSettings({ barcodeHeightMm: value })} />
                      </>
                    ) : null}
                    <Text style={s.settingsHelp}>Printed barcode: {labelLayout.barcode.width.toFixed(1)} × {labelLayout.barcode.height.toFixed(1)} mm. Image proportions are preserved.</Text>
                  </>
                ) : null}
                {settingsTab === "layout" ? (
                  <>
                <Text style={[s.settingsHeading, s.settingsSectionHeading]}>ALIGNMENT</Text>
                <AlignmentOptions label="Horizontal" value={settings.horizontalAlign} options={["left", "center", "right"]} onChange={(value) => void updateSettings({ horizontalAlign: value as PackagePrinterSettings["horizontalAlign"] })} />
                <AlignmentOptions label="Vertical" value={settings.verticalAlign} options={["top", "center", "bottom"]} onChange={(value) => void updateSettings({ verticalAlign: value as PackagePrinterSettings["verticalAlign"] })} />
                    <Text style={s.settingsHelp}>Each page contains the warehouse logo, barcode and order number. The layout adjusts to the selected paper size.</Text>
                  </>
                ) : null}
                {!settingsLoaded ? <Text style={s.settingsHelp}>Loading saved settings…</Text> : <Text style={s.savedText}>Settings save automatically on this device.</Text>}
                {settingsError ? <Text style={s.errorText}>{settingsError}</Text> : null}
              </View>
            ) : null}
            <View style={s.warningRow}>
              <Ionicons name="information-circle-outline" size={18} color="#92400E" />
              <Text style={s.warningText}>This barcode is generated by the warehouse server and is used to verify the packed order.</Text>
            </View>
            {labelLayout.error ? <Text style={s.errorText}>{labelLayout.error}</Text> : null}
            {labelLayout.warning ? <Text style={s.warningText}>{labelLayout.warning}</Text> : null}
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
            accessibilityState={{ disabled: !barcodePreview || printing || generating || !settingsLoaded || !!labelLayout.error }}
            disabled={!barcodePreview || printing || generating || !settingsLoaded || !!labelLayout.error}
            onPress={() => void openPrintWindow()}
            style={({ pressed }) => [s.printButton, (!barcodePreview || printing || generating || !settingsLoaded || !!labelLayout.error) && s.disabled, pressed && barcodePreview && !printing && !generating && { opacity: 0.85 }]}
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
  labelPreview: { position: "relative", backgroundColor: "#FFFFFF", overflow: "hidden" },
  previewOrder: { color: "#000000", fontWeight: "400", includeFontPadding: false, textAlignVertical: "center" },
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
  tabs: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 10, backgroundColor: "#F1F5F9" },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  tabActive: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1" },
  tabText: { fontSize: 10, fontWeight: "700", color: "#475569" },
  tabTextActive: { fontWeight: "800", color: "#C2410C" },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 6 },
  presetButton: { minHeight: 44, flexGrow: 1, flexBasis: "28%", paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#F1F5F9" },
  presetSelected: { backgroundColor: "#FFEDD5", borderWidth: 1, borderColor: "#FDBA74" },
  presetSelectedText: { color: "#9A3412" },
  presetText: { fontSize: 11, fontWeight: "800", color: "#334155" },
  stepperRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  stepperLabel: { flex: 1, flexShrink: 1, fontSize: 13, color: "#334155" },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 },
  stepperButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#F1F5F9" },
  stepperButtonText: { fontSize: 18, fontWeight: "700", color: "#334155" },
  stepperInput: { width: 60, minWidth: 60, height: 44, paddingHorizontal: 4, paddingVertical: 2, textAlign: "center", textAlignVertical: "center", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, fontSize: 15, fontWeight: "700", color: "#0F172A", backgroundColor: "#FFFFFF" },
  alignRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  alignLabel: { fontSize: 12, color: "#334155" },
  alignOptions: { flexDirection: "row", gap: 4 },
  alignOption: { minHeight: 44, minWidth: 48, justifyContent: "center", alignItems: "center", paddingHorizontal: 6, borderRadius: 7, backgroundColor: "#F1F5F9" },
  alignOptionSelected: { backgroundColor: "#FFEDD5" },
  alignOptionText: { fontSize: 10, color: "#475569", textTransform: "capitalize" },
  alignOptionTextSelected: { color: "#C2410C", fontWeight: "800" },
  toggleSetting: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  toggleText: { fontSize: 12, flex: 1, fontWeight: "600", color: "#334155" },
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
          onChangeText={(text) => setDraft(text.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
          onEndEditing={() => onChange(draft.trim() && Number.isFinite(Number(draft)) ? Number(draft) : value)}
          keyboardType="decimal-pad"
          style={s.stepperInput}
          accessibilityLabel={`${label} in millimeters`}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => onChange(value + 1)} style={s.stepperButton}><Text style={s.stepperButtonText}>+</Text></Pressable>
      </View>
    </View>
  );
}

function ToggleSetting({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)} style={s.toggleSetting}>
      <Text style={s.toggleText}>{label}</Text>
      <Ionicons name={value ? "checkbox" : "square-outline"} size={24} color={value ? "#C2410C" : "#64748B"} />
    </Pressable>
  );
}

function AlignmentOptions<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (value: T) => void }) {
  return (
    <View style={s.alignRow}>
      <Text style={s.alignLabel}>{label}</Text>
      <View style={s.alignOptions}>
        {options.map((option) => (
          <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: value === option }} accessibilityLabel={`${label}: ${option}`} onPress={() => onChange(option)} style={[s.alignOption, value === option && s.alignOptionSelected]}>
            <Text style={[s.alignOptionText, value === option && s.alignOptionTextSelected]}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

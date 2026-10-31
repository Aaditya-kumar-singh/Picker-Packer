import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { getPrintLogoSource } from "@/utils/printLogoAsset";
import { Text } from "@/components/Typography";
import { packerAppApi } from "@/api/packerAppApi";
import { packageLabelHtml } from "@/utils/packageLabel";
import {
  DEFAULT_PACKAGE_PRINTER_SETTINGS,
  DEFAULT_PACKAGE_LABEL_LAYOUT,
  loadPackagePrinterSettings,
  loadSavedPrinter,
  normalizePackagePrinterSettings,
  savePackagePrinterSettings,
  saveSelectedPrinter,
  type PackageLabelElement,
  type PackageLabelPosition,
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
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printWindowOpened, setPrintWindowOpened] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PackagePrinterSettings>(DEFAULT_PACKAGE_PRINTER_SETTINGS);
  const settingsRef = useRef(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [barcodeAspectRatio, setBarcodeAspectRatio] = useState(4.5);
  const [activeLabelElement, setActiveLabelElement] = useState<PackageLabelElement>("barcode");
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
  const previewMaxWidth = Math.min(320, Math.max(200, windowWidth - 96));
  const previewScale = Math.min(previewMaxWidth / settings.paperWidthMm, 320 / settings.paperHeightMm);
  const labelWidthPx = settings.paperWidthMm * previewScale;
  const labelHeightPx = settings.paperHeightMm * previewScale;
  const canvasWidthPx = Math.max(1, (settings.paperWidthMm - settings.marginMm * 2) * previewScale);
  const canvasHeightPx = Math.max(1, (settings.paperHeightMm - settings.marginMm * 2) * previewScale);
  const baseBarcodeWidthPx = settings.barcodeWidthMm * previewScale;
  const baseBarcodeHeightPx = Math.min(settings.barcodeHeightMm, settings.barcodeWidthMm / barcodeAspectRatio) * previewScale;
  // Print CSS uses physical points. Scale preview text to the same physical size
  // so the editor accurately shows how the label will print.
  const orderLineHeightPx = (8 * 25.4 / 72) * previewScale * 1.2;
  const customerLineHeightPx = (7 * 25.4 / 72) * previewScale * 1.2;
  const contentWidthMm = Math.max(1, settings.paperWidthMm - settings.marginMm * 2);
  const orderTextFit = Math.min(1, (contentWidthMm * 0.78) / (`Order ${orderNumber}`.length * 8 * 0.56 * 25.4 / 72));
  const customerTextFit = Math.min(1, (contentWidthMm * 0.78) / ("Customer ID: CUST-001".length * 7 * 0.56 * 25.4 / 72));
  const labelItemMetrics: Record<PackageLabelElement, { width: number; height: number; maxScale: number }> = {
    heading: { width: canvasWidthPx * 0.68, height: canvasWidthPx * 0.68 / 3, maxScale: Math.min(1.5, canvasWidthPx / (canvasWidthPx * 0.68), canvasHeightPx / (canvasWidthPx * 0.68 / 3)) },
    barcode: { width: baseBarcodeWidthPx, height: baseBarcodeHeightPx, maxScale: Math.min(1.5, canvasWidthPx / baseBarcodeWidthPx, canvasHeightPx / baseBarcodeHeightPx) },
    order: { width: canvasWidthPx * 0.78, height: orderLineHeightPx * orderTextFit, maxScale: Math.min(1.25, canvasWidthPx / (canvasWidthPx * 0.78), canvasHeightPx / (orderLineHeightPx * orderTextFit)) },
    customer: { width: canvasWidthPx * 0.78, height: customerLineHeightPx * customerTextFit, maxScale: Math.min(1.25, canvasWidthPx / (canvasWidthPx * 0.78), canvasHeightPx / (customerLineHeightPx * customerTextFit)) },
  };
  const itemScale = (element: PackageLabelElement) => settings.labelLayout[element].scale;

  function changeActiveItemScale(change: number) {
    const element = activeLabelElement;
    const current = settingsRef.current.labelLayout[element];
    const size = labelItemMetrics[element];
    const scale = Math.min(size.maxScale, Math.max(0.5, current.scale + change));
    const scaleChange = scale - current.scale;
    if (Math.abs(scaleChange) < 0.001) return;
    updateLabelPosition(element, {
      scale,
      x: current.x - (size.width / canvasWidthPx) * 100 * scaleChange / 2,
      y: current.y - (size.height / canvasHeightPx) * 100 * scaleChange / 2,
    });
    void saveLabelPositions();
  }

  async function updateSettings(patch: Partial<PackagePrinterSettings>) {
    const merged: PackagePrinterSettings = { ...settingsRef.current, ...patch };
    const paperGeometryChanged = patch.paperWidthMm !== undefined || patch.marginMm !== undefined || patch.barcodeWidthMm !== undefined;
    if (paperGeometryChanged && patch.labelLayout === undefined) {
      const contentWidth = Math.max(1, merged.paperWidthMm - merged.marginMm * 2);
      const barcodeWidth = Math.min(merged.barcodeWidthMm, contentWidth) * settingsRef.current.labelLayout.barcode.scale;
      const barcodeX = merged.horizontalAlign === "left" ? 0 : merged.horizontalAlign === "right" ? 100 - (barcodeWidth / contentWidth) * 100 : ((contentWidth - barcodeWidth) / 2 / contentWidth) * 100;
      merged.labelLayout = { ...settingsRef.current.labelLayout, barcode: { ...settingsRef.current.labelLayout.barcode, x: barcodeX } };
    }
    const next = normalizePackagePrinterSettings(merged);
    settingsRef.current = next;
    setSettings(next);
    setSettingsError(null);
    try {
      await savePackagePrinterSettings(next);
    } catch {
      setSettingsError("Could not save these settings on this device.");
    }
  }

  function updateLabelPosition(element: PackageLabelElement, position: PackageLabelPosition) {
    const next = normalizePackagePrinterSettings({
      ...settingsRef.current,
      labelLayout: { ...settingsRef.current.labelLayout, [element]: position },
    });
    settingsRef.current = next;
    setSettings(next);
  }

  async function saveLabelPositions() {
    try {
      await savePackagePrinterSettings(settingsRef.current);
      setSettingsError(null);
    } catch {
      setSettingsError("Could not save label positions on this device.");
    }
  }

  function resetLabelPositions() {
    void updateSettings({ labelLayout: DEFAULT_PACKAGE_LABEL_LAYOUT });
  }

  function alignLabelHorizontally(value: PackagePrinterSettings["horizontalAlign"]) {
    const contentWidth = Math.max(1, settings.paperWidthMm - settings.marginMm * 2);
    const barcodeWidth = Math.min(settings.barcodeWidthMm, contentWidth);
    const barcodeScale = settingsRef.current.labelLayout.barcode.scale;
    const headingScale = settingsRef.current.labelLayout.heading.scale;
    const textScale = settingsRef.current.labelLayout.order.scale;
    const customerScale = settingsRef.current.labelLayout.customer.scale;
    const barcodeWidthPercent = (barcodeWidth / contentWidth) * 100 * barcodeScale;
    const barcodeX = value === "left" ? 0 : value === "right" ? 100 - barcodeWidthPercent : (100 - barcodeWidthPercent) / 2;
    const headingX = value === "left" ? 0 : value === "right" ? 100 - 68 * headingScale : (100 - 68 * headingScale) / 2;
    const orderX = value === "left" ? 0 : value === "right" ? 100 - 78 * textScale : (100 - 78 * textScale) / 2;
    const customerX = value === "left" ? 0 : value === "right" ? 100 - 78 * customerScale : (100 - 78 * customerScale) / 2;
    void updateSettings({
      horizontalAlign: value,
      labelLayout: {
        ...settingsRef.current.labelLayout,
        heading: { ...settingsRef.current.labelLayout.heading, x: headingX },
        barcode: { ...settingsRef.current.labelLayout.barcode, x: barcodeX },
        order: { ...settingsRef.current.labelLayout.order, x: orderX },
        customer: { ...settingsRef.current.labelLayout.customer, x: customerX },
      },
    });
  }

  function alignLabelVertically(value: PackagePrinterSettings["verticalAlign"]) {
    const top = { heading: 0, barcode: 35, order: 58, customer: 72 };
    const center = { heading: 8, barcode: 45, order: 68, customer: 82 };
    const bottom = { heading: 15, barcode: 52, order: 76, customer: 88 };
    const positions = value === "top" ? top : value === "bottom" ? bottom : center;
    void updateSettings({
      verticalAlign: value,
      labelLayout: {
        heading: { ...settingsRef.current.labelLayout.heading, y: positions.heading },
        barcode: { ...settingsRef.current.labelLayout.barcode, y: positions.barcode },
        order: { ...settingsRef.current.labelLayout.order, y: positions.order },
        customer: { ...settingsRef.current.labelLayout.customer, y: positions.customer },
      },
    });
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
      const logoImage = await getPrintLogoSource();
      await Print.printAsync({
        html: packageLabelHtml(barcodePreview, orderNumber, settings, logoImage),
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
            <View style={[s.preview, { minHeight: Math.max(226, labelHeightPx + 54) }]}>
              {barcodePreview ? (
                <View style={[s.labelPreview, { width: labelWidthPx, height: labelHeightPx }]}>
                  <View style={{ position: "absolute", left: settings.marginMm * previewScale, top: settings.marginMm * previewScale, width: canvasWidthPx, height: canvasHeightPx }}>
                    <DraggableLabelItem
                      accessibilityLabel="YourBuildMart black and white logo"
                      position={settings.labelLayout.heading}
                      canvasWidth={canvasWidthPx}
                      canvasHeight={canvasHeightPx}
                      width={labelItemMetrics.heading.width * itemScale("heading")}
                      height={labelItemMetrics.heading.height * itemScale("heading")}
                      selected={activeLabelElement === "heading"}
                      onSelect={() => setActiveLabelElement("heading")}
                      onMove={(position) => updateLabelPosition("heading", position)}
                      onRelease={() => void saveLabelPositions()}
                    >
                      <Image source={require("../../assets/images/yourbuildmart-wordmark.png")} style={{ width: "100%", height: "100%", tintColor: "#111111" }} resizeMode="contain" accessibilityLabel="YourBuildMart logo in black and white" />
                    </DraggableLabelItem>
                    <DraggableLabelItem
                      accessibilityLabel="Packing barcode"
                      position={settings.labelLayout.barcode}
                      canvasWidth={canvasWidthPx}
                      canvasHeight={canvasHeightPx}
                      width={labelItemMetrics.barcode.width * itemScale("barcode")}
                      height={labelItemMetrics.barcode.height * itemScale("barcode")}
                      selected={activeLabelElement === "barcode"}
                      onSelect={() => setActiveLabelElement("barcode")}
                      onMove={(position) => updateLabelPosition("barcode", position)}
                      onRelease={() => void saveLabelPositions()}
                    >
                      <Image
                        source={{ uri: barcodePreview }}
                        onLoad={({ nativeEvent }) => {
                          const { width, height } = nativeEvent.source;
                          if (width > 0 && height > 0) setBarcodeAspectRatio(width / height);
                        }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="contain"
                      />
                    </DraggableLabelItem>
                    <DraggableLabelItem
                      accessibilityLabel="Order number"
                      position={settings.labelLayout.order}
                      canvasWidth={canvasWidthPx}
                      canvasHeight={canvasHeightPx}
                      width={labelItemMetrics.order.width * itemScale("order")}
                      height={labelItemMetrics.order.height * itemScale("order")}
                      selected={activeLabelElement === "order"}
                      onSelect={() => setActiveLabelElement("order")}
                      onMove={(position) => updateLabelPosition("order", position)}
                      onRelease={() => void saveLabelPositions()}
                    >
                      <Text style={[s.previewOrder, { textAlign: settings.horizontalAlign, fontSize: (8 * 25.4 / 72) * previewScale * itemScale("order") * orderTextFit, lineHeight: orderLineHeightPx * itemScale("order") * orderTextFit }]} numberOfLines={1}>Order {orderNumber}</Text>
                    </DraggableLabelItem>
                    <DraggableLabelItem
                      accessibilityLabel="Sample customer ID"
                      position={settings.labelLayout.customer}
                      canvasWidth={canvasWidthPx}
                      canvasHeight={canvasHeightPx}
                      width={labelItemMetrics.customer.width * itemScale("customer")}
                      height={labelItemMetrics.customer.height * itemScale("customer")}
                      selected={activeLabelElement === "customer"}
                      onSelect={() => setActiveLabelElement("customer")}
                      onMove={(position) => updateLabelPosition("customer", position)}
                      onRelease={() => void saveLabelPositions()}
                    >
                      <Text style={[s.previewCustomer, { textAlign: settings.horizontalAlign, fontSize: (7 * 25.4 / 72) * previewScale * itemScale("customer") * customerTextFit, lineHeight: customerLineHeightPx * itemScale("customer") * customerTextFit }]} numberOfLines={1}>Customer ID: CUST-001</Text>
                    </DraggableLabelItem>
                  </View>
                </View>
              ) : (
                <>
                  <Ionicons name="barcode-outline" size={48} color="#94A3B8" />
                  <Text style={s.placeholder}>{generating ? "Generating package barcode…" : "Package barcode will appear here."}</Text>
                </>
              )}
              {barcodePreview ? <Text style={s.dragHint}>Tap an item to select; drag to move it</Text> : null}
            </View>

            {barcodePreview ? (
              <View style={s.itemEditor}>
                <Text style={s.editorHeading}>SELECT ITEM TO RESIZE</Text>
                <View style={s.elementPicker}>
                  {([
                    ["heading", "Logo"],
                    ["barcode", "Barcode"],
                    ["order", "Order ID"],
                    ["customer", "Customer ID"],
                  ] as const).map(([element, label]) => (
                    <Pressable key={element} accessibilityRole="button" onPress={() => setActiveLabelElement(element)} style={[s.elementChip, activeLabelElement === element && s.elementChipSelected]}>
                      <Text style={[s.elementChipText, activeLabelElement === element && s.elementChipTextSelected]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={s.zoomRow}>
                  <Text style={s.zoomLabel}>{Math.round(itemScale(activeLabelElement) * 100)}% size</Text>
                  <View style={s.zoomButtons}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Zoom out selected item" onPress={() => changeActiveItemScale(-0.1)} style={s.zoomButton}><Text style={s.zoomButtonText}>−</Text></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Zoom in selected item" onPress={() => changeActiveItemScale(0.1)} style={s.zoomButton}><Text style={s.zoomButtonText}>+</Text></Pressable>
                  </View>
                </View>
              </View>
            ) : null}

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
                  <Pressable onPress={() => void updateSettings({ paperWidthMm: 50.8, paperHeightMm: 50.8 })} style={s.presetButton}><Text style={s.presetText}>2 × 2 in</Text></Pressable>
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
                <AlignmentOptions label="Horizontal" value={settings.horizontalAlign} options={["left", "center", "right"]} onChange={(value) => alignLabelHorizontally(value as PackagePrinterSettings["horizontalAlign"])} />
                <AlignmentOptions label="Vertical" value={settings.verticalAlign} options={["top", "center", "bottom"]} onChange={(value) => alignLabelVertically(value as PackagePrinterSettings["verticalAlign"])} />
                <Pressable accessibilityRole="button" onPress={resetLabelPositions} style={s.settingsAction}>
                  <Text style={s.settingsActionText}>Reset label positions</Text>
                </Pressable>
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
  labelPreview: { position: "relative", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1", overflow: "hidden" },
  previewOrder: { width: "100%", fontSize: 8, lineHeight: 12, color: "#475569", textAlign: "center" },
  previewCustomer: { width: "100%", fontSize: 7, lineHeight: 10, color: "#64748B", textAlign: "center" },
  dragHint: { marginTop: 8, fontSize: 9, color: "#64748B", textAlign: "center" },
  draggingLabelItem: { borderWidth: 1, borderStyle: "dashed", borderColor: "#D95D00", backgroundColor: "rgba(255,247,237,0.28)" },
  selectedLabelItem: { borderWidth: 1, borderStyle: "dashed", borderColor: "#D95D00" },
  itemEditor: { padding: 10, marginTop: 8, borderRadius: 10, backgroundColor: "#F8FAFC" },
  editorHeading: { fontSize: 9, fontWeight: "900", letterSpacing: 0.4, color: "#64748B", marginBottom: 7 },
  elementPicker: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  elementChip: { minHeight: 30, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#E2E8F0" },
  elementChipSelected: { backgroundColor: "#FFEDD5" },
  elementChipText: { fontSize: 10, fontWeight: "700", color: "#475569" },
  elementChipTextSelected: { color: "#C2410C" },
  zoomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  zoomLabel: { fontSize: 12, fontWeight: "800", color: "#334155" },
  zoomButtons: { flexDirection: "row", gap: 8 },
  zoomButton: { width: 38, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#F1F5F9" },
  zoomButtonText: { fontSize: 20, fontWeight: "800", color: "#334155" },
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
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 6 },
  presetButton: { minHeight: 34, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#F1F5F9" },
  presetText: { fontSize: 11, fontWeight: "800", color: "#334155" },
  stepperRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  stepperLabel: { flex: 1, flexShrink: 1, fontSize: 13, color: "#334155" },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 0 },
  stepperButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#F1F5F9" },
  stepperButtonText: { fontSize: 18, fontWeight: "700", color: "#334155" },
  stepperInput: { width: 76, minWidth: 76, height: 42, paddingHorizontal: 6, paddingVertical: 4, textAlign: "center", textAlignVertical: "center", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, fontSize: 16, fontWeight: "700", color: "#0F172A", backgroundColor: "#FFFFFF" },
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

function DraggableLabelItem({
  accessibilityLabel,
  position,
  canvasWidth,
  canvasHeight,
  width,
  height,
  selected,
  onSelect,
  onMove,
  onRelease,
  children,
}: {
  accessibilityLabel: string;
  position: PackageLabelPosition;
  canvasWidth: number;
  canvasHeight: number;
  width: number;
  height: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (position: PackageLabelPosition) => void;
  onRelease: () => void;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const startPosition = useRef(position);
  const handlers = useRef({ x: position.x, y: position.y, scale: position.scale, canvasWidth, canvasHeight, width, height, onMove, onRelease, onSelect });
  handlers.current = { x: position.x, y: position.y, scale: position.scale, canvasWidth, canvasHeight, width, height, onMove, onRelease, onSelect };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      startPosition.current = { x: handlers.current.x, y: handlers.current.y, scale: handlers.current.scale };
      handlers.current.onSelect();
      setDragging(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const current = handlers.current;
      const maxX = Math.max(0, 100 - (current.width / current.canvasWidth) * 100);
      const maxY = Math.max(0, 100 - (current.height / current.canvasHeight) * 100);
      const x = Math.min(maxX, Math.max(0, startPosition.current.x + (gesture.dx / current.canvasWidth) * 100));
      const y = Math.min(maxY, Math.max(0, startPosition.current.y + (gesture.dy / current.canvasHeight) * 100));
      current.onMove({ x, y, scale: current.scale });
    },
    onPanResponderRelease: () => {
      setDragging(false);
      handlers.current.onRelease();
    },
    onPanResponderTerminate: () => {
      setDragging(false);
      handlers.current.onRelease();
    },
  })).current;

  return (
    <View
      {...panResponder.panHandlers}
      collapsable={false}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      style={[{ position: "absolute", left: `${position.x}%`, top: `${position.y}%`, width, height, justifyContent: "center" }, selected && s.selectedLabelItem, dragging && s.draggingLabelItem]}
    >
      {children}
    </View>
  );
}

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

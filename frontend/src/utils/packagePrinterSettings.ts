import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "ybm.package-printer-settings.v1";
const LABEL_SIZE_MIGRATION_KEY = `${STORAGE_KEY}.50x25-logo-barcode-order.v2`;
let settingsWriteQueue: Promise<void> = Promise.resolve();

export interface PackagePrinterSettings {
  paperWidthMm: number;
  paperHeightMm: number;
  marginMm: number; // Compatibility with saved settings from faiz13.
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  gutterMm: number;
  gutterPosition: "left" | "right";
  barcodeWidthMm: number;
  barcodeHeightMm: number;
  autoFit: boolean;
  horizontalAlign: "left" | "center" | "right";
  verticalAlign: "top" | "center" | "bottom";
}

export const PAPER_SIZE_PRESETS = [
  { label: "50 × 25", width: 50, height: 25 },
  { label: "50 × 30", width: 50, height: 30 },
  { label: "2 × 2 in", width: 50.8, height: 50.8 },
  { label: "75 × 50", width: 75, height: 50 },
  { label: "100 × 150", width: 100, height: 150 },
  { label: "A6", width: 105, height: 148 },
  { label: "A5", width: 148, height: 210 },
  { label: "A4", width: 210, height: 297 },
  { label: "Letter", width: 215.9, height: 279.4 },
] as const;

export const DEFAULT_PACKAGE_PRINTER_SETTINGS: PackagePrinterSettings = {
  paperWidthMm: 50,
  paperHeightMm: 25,
  marginMm: 1,
  marginTopMm: 1,
  marginBottomMm: 1,
  marginLeftMm: 1,
  marginRightMm: 1,
  gutterMm: 0,
  gutterPosition: "left",
  barcodeWidthMm: 40,
  barcodeHeightMm: 11,
  autoFit: true,
  horizontalAlign: "center",
  verticalAlign: "center",
};

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const number = value == null || value === "" ? NaN : typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.min(max, Math.max(min, number)) * 100) / 100;
}

export function normalizePackagePrinterSettings(value: Partial<PackagePrinterSettings> | null | undefined): PackagePrinterSettings {
  const defaults = DEFAULT_PACKAGE_PRINTER_SETTINGS;
  const paperWidthMm = clamp(value?.paperWidthMm, defaults.paperWidthMm, 30, 500);
  const paperHeightMm = clamp(value?.paperHeightMm, defaults.paperHeightMm, 15, 500);
  const marginMm = clamp(value?.marginMm, defaults.marginMm, 0, Math.min(paperWidthMm, paperHeightMm) / 4);
  const marginTopMm = clamp(value?.marginTopMm, marginMm, 0, paperHeightMm / 4);
  const marginBottomMm = clamp(value?.marginBottomMm, marginMm, 0, paperHeightMm / 4);
  const marginLeftMm = clamp(value?.marginLeftMm, marginMm, 0, paperWidthMm / 4);
  const marginRightMm = clamp(value?.marginRightMm, marginMm, 0, paperWidthMm / 4);
  const gutterMm = clamp(value?.gutterMm, 0, 0, 30);
  const contentWidthMm = Math.max(1, paperWidthMm - marginLeftMm - marginRightMm - gutterMm);
  const contentHeightMm = Math.max(1, paperHeightMm - marginTopMm - marginBottomMm);
  return {
    paperWidthMm,
    paperHeightMm,
    marginMm,
    marginTopMm,
    marginBottomMm,
    marginLeftMm,
    marginRightMm,
    gutterMm,
    gutterPosition: value?.gutterPosition === "right" ? "right" : "left",
    barcodeWidthMm: clamp(value?.barcodeWidthMm, defaults.barcodeWidthMm, 10, Math.max(10, contentWidthMm)),
    barcodeHeightMm: clamp(value?.barcodeHeightMm, defaults.barcodeHeightMm, 2, Math.max(2, contentHeightMm)),
    autoFit: typeof value?.autoFit === "boolean" ? value.autoFit : true,
    horizontalAlign: value?.horizontalAlign === "left" || value?.horizontalAlign === "right" ? value.horizontalAlign : "center",
    verticalAlign: value?.verticalAlign === "top" || value?.verticalAlign === "bottom" ? value.verticalAlign : "center",
  };
}

export async function loadPackagePrinterSettings(): Promise<PackagePrinterSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const saved = normalizePackagePrinterSettings(raw ? JSON.parse(raw) : null);
    const migrated = await AsyncStorage.getItem(LABEL_SIZE_MIGRATION_KEY);
    if (migrated !== "1") {
      const labelSettings = normalizePackagePrinterSettings({
        ...saved,
        ...DEFAULT_PACKAGE_PRINTER_SETTINGS,
      });
      await savePackagePrinterSettings(labelSettings);
      await AsyncStorage.setItem(LABEL_SIZE_MIGRATION_KEY, "1");
      return labelSettings;
    }
    return saved;
  } catch {
    return DEFAULT_PACKAGE_PRINTER_SETTINGS;
  }
}

export async function savePackagePrinterSettings(settings: PackagePrinterSettings): Promise<void> {
  const serialized = JSON.stringify(normalizePackagePrinterSettings(settings));
  settingsWriteQueue = settingsWriteQueue.catch(() => undefined).then(() => AsyncStorage.setItem(STORAGE_KEY, serialized));
  await settingsWriteQueue;
}

export async function loadSavedPrinter(): Promise<{ name: string; url: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_KEY}.ios-printer`);
    if (!raw) return null;
    const value = JSON.parse(raw) as { name?: unknown; url?: unknown };
    return typeof value.name === "string" && typeof value.url === "string" ? { name: value.name, url: value.url } : null;
  } catch {
    return null;
  }
}

export async function saveSelectedPrinter(printer: { name: string; url: string } | null): Promise<void> {
  const key = `${STORAGE_KEY}.ios-printer`;
  if (!printer) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify(printer));
}

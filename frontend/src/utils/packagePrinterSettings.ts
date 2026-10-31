import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "ybm.package-printer-settings.v1";
const LABEL_SIZE_MIGRATION_KEY = `${STORAGE_KEY}.50x25-logo-barcode-order.v2`;
let settingsWriteQueue: Promise<void> = Promise.resolve();

export interface PackagePrinterSettings {
  paperWidthMm: number;
  paperHeightMm: number;
  marginMm: number;
  barcodeWidthMm: number;
  barcodeHeightMm: number;
  horizontalAlign: "left" | "center" | "right";
  verticalAlign: "top" | "center" | "bottom";
}

export const DEFAULT_PACKAGE_PRINTER_SETTINGS: PackagePrinterSettings = {
  paperWidthMm: 50,
  paperHeightMm: 25,
  marginMm: 1,
  barcodeWidthMm: 40,
  barcodeHeightMm: 11,
  horizontalAlign: "center",
  verticalAlign: "center",
};

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const number = value == null || value === "" ? NaN : typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function normalizePackagePrinterSettings(value: Partial<PackagePrinterSettings> | null | undefined): PackagePrinterSettings {
  const defaults = DEFAULT_PACKAGE_PRINTER_SETTINGS;
  const paperWidthMm = clamp(value?.paperWidthMm, defaults.paperWidthMm, 30, 300);
  const paperHeightMm = clamp(value?.paperHeightMm, defaults.paperHeightMm, 15, 300);
  const marginMm = clamp(value?.marginMm, defaults.marginMm, 0, Math.min(paperWidthMm, paperHeightMm) / 4);
  const contentWidthMm = Math.max(1, paperWidthMm - marginMm * 2);
  const contentHeightMm = Math.max(1, paperHeightMm - marginMm * 2);
  const barcodeWidthMm = clamp(value?.barcodeWidthMm, defaults.barcodeWidthMm, 10, contentWidthMm);
  const barcodeHeightMm = clamp(value?.barcodeHeightMm, defaults.barcodeHeightMm, 2, contentHeightMm);
  return {
    paperWidthMm,
    paperHeightMm,
    marginMm,
    barcodeWidthMm,
    barcodeHeightMm,
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

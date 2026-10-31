import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "ybm.package-printer-settings.v1";
let settingsWriteQueue: Promise<void> = Promise.resolve();

export interface PackagePrinterSettings {
  paperWidthMm: number;
  paperHeightMm: number;
  marginMm: number;
  barcodeWidthMm: number;
  barcodeHeightMm: number;
  horizontalAlign: "left" | "center" | "right";
  verticalAlign: "top" | "center" | "bottom";
  labelLayout: PackageLabelLayout;
}

export type PackageLabelElement = "heading" | "barcode" | "order" | "customer";
export type PackageLabelPosition = { x: number; y: number; scale: number };
export type PackageLabelLayout = Record<PackageLabelElement, PackageLabelPosition>;

export const DEFAULT_PACKAGE_LABEL_LAYOUT: PackageLabelLayout = {
  heading: { x: 16, y: 8, scale: 1 },
  barcode: { x: 27, y: 45, scale: 1 },
  order: { x: 5, y: 68, scale: 1 },
  customer: { x: 5, y: 82, scale: 1 },
};

export const DEFAULT_PACKAGE_PRINTER_SETTINGS: PackagePrinterSettings = {
  paperWidthMm: 75,
  paperHeightMm: 50,
  marginMm: 4,
  barcodeWidthMm: 31,
  barcodeHeightMm: 31,
  horizontalAlign: "center",
  verticalAlign: "center",
  labelLayout: DEFAULT_PACKAGE_LABEL_LAYOUT,
};

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function normalizePackagePrinterSettings(value: Partial<PackagePrinterSettings> | null | undefined): PackagePrinterSettings {
  const defaults = DEFAULT_PACKAGE_PRINTER_SETTINGS;
  const paperWidthMm = clamp(value?.paperWidthMm, defaults.paperWidthMm, 30, 300);
  const paperHeightMm = clamp(value?.paperHeightMm, defaults.paperHeightMm, 30, 300);
  const marginMm = clamp(value?.marginMm, defaults.marginMm, 0, Math.min(paperWidthMm, paperHeightMm) / 4);
  const contentWidthMm = Math.max(1, paperWidthMm - marginMm * 2);
  const contentHeightMm = Math.max(1, paperHeightMm - marginMm * 2);
  const barcodeWidthMm = clamp(value?.barcodeWidthMm, defaults.barcodeWidthMm, 10, contentWidthMm);
  const barcodeHeightMm = clamp(value?.barcodeHeightMm, defaults.barcodeHeightMm, 10, contentHeightMm);
  const labelLayout: PackageLabelLayout = {
    heading: normalizeLabelPosition(value?.labelLayout?.heading, defaults.labelLayout.heading, 32, Math.max(0, 100 - ((contentWidthMm * 0.68 / 3) / contentHeightMm) * 100), Math.min(1.5, contentHeightMm / (contentWidthMm * 0.68 / 3))),
    barcode: normalizeLabelPosition(value?.labelLayout?.barcode, defaults.labelLayout.barcode, Math.max(0, 100 - (barcodeWidthMm / contentWidthMm) * 100), Math.max(0, 100 - (Math.min(barcodeHeightMm, barcodeWidthMm / 4.5) / contentHeightMm) * 100), Math.min(1.5, contentWidthMm / barcodeWidthMm, contentHeightMm / Math.min(barcodeHeightMm, barcodeWidthMm / 4.5))),
    order: normalizeLabelPosition(value?.labelLayout?.order, defaults.labelLayout.order, 22, 90, 1.25),
    customer: normalizeLabelPosition(value?.labelLayout?.customer, defaults.labelLayout.customer, 22, 92, 1.25),
  };
  return {
    paperWidthMm,
    paperHeightMm,
    marginMm,
    barcodeWidthMm,
    barcodeHeightMm,
    horizontalAlign: value?.horizontalAlign === "left" || value?.horizontalAlign === "right" ? value.horizontalAlign : "center",
    verticalAlign: value?.verticalAlign === "top" || value?.verticalAlign === "bottom" ? value.verticalAlign : "center",
    labelLayout,
  };
}

function normalizeLabelPosition(value: PackageLabelPosition | undefined, fallback: PackageLabelPosition, maxX = 100, maxY = 100, maxScale = 1.5): PackageLabelPosition {
  const scale = clamp(value?.scale, fallback.scale, 0.5, maxScale);
  return {
    x: clamp(value?.x, fallback.x, 0, Math.max(0, 100 - (100 - maxX) * scale)),
    y: clamp(value?.y, fallback.y, 0, Math.max(0, 100 - (100 - maxY) * scale)),
    scale,
  };
}

export async function loadPackagePrinterSettings(): Promise<PackagePrinterSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return normalizePackagePrinterSettings(raw ? JSON.parse(raw) : null);
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

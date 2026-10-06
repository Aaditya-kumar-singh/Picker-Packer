export type ScanMethod = "camera" | "hardware" | "manual";

export interface ScanResult {
  barcode: string;
  method: ScanMethod;
  timestamp: string;
}

const MAX_BARCODE_LENGTH = 100;
const DEBOUNCE_MS = 2000;

let lastScan = { value: "", timestamp: 0 };

export function parseBarcode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^\w\-.]/g, "").substring(0, MAX_BARCODE_LENGTH);
}

export function acceptScan(raw: string): boolean {
  const barcode = parseBarcode(raw);
  if (!barcode) return false;

  const now = Date.now();
  if (barcode === lastScan.value && now - lastScan.timestamp < DEBOUNCE_MS) {
    return false;
  }

  lastScan = { value: barcode, timestamp: now };
  return true;
}

export function buildScanResult(raw: string, method: ScanMethod): ScanResult | null {
  const barcode = parseBarcode(raw);
  if (!barcode || !acceptScan(barcode)) return null;
  return { barcode, method, timestamp: new Date().toISOString() };
}

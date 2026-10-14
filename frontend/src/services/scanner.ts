// Scanner abstraction — screens behave as if a real scanner produced the value.
// Phase 1: mock buttons + manual entry only. No native deps. Hardware/camera
// plugs in later behind these same helpers.
import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";

export interface ScanResult {
  value: string;
  source: "MOCK_CORRECT" | "MOCK_WRONG" | "MANUAL";
}

export function correctLocationScan(expectedBarcode: string): ScanResult {
  return { value: expectedBarcode, source: "MOCK_CORRECT" };
}

export function wrongLocationScan(): ScanResult {
  return { value: "WRONG-A-99", source: "MOCK_WRONG" };
}

export function correctSkuScan(expectedBarcode: string): ScanResult {
  return { value: expectedBarcode, source: "MOCK_CORRECT" };
}

export function wrongSkuScan(): ScanResult {
  return { value: "WRONG-SKU-000", source: "MOCK_WRONG" };
}

// Haptic + (future) sound feedback. Fire-and-forget by design: screens call
// these synchronously and must never break when haptics are unavailable
// (simulators, web, denied permissions) — failures are swallowed.
export function beepSuccess(): void {
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  } catch {
    // Haptics unavailable — visual SuccessFeedback banners remain.
  }
}

export function beepError(): void {
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  } catch {
    // Haptics unavailable — visual ErrorBanner remains.
  }
}

/**
 * Triggers haptic error feedback and displays an immediate native/web alert
 * when a scanned or manually submitted barcode is wrong/invalid.
 */
export function alertWrongBarcode(
  scannedValue: string,
  expectedValue?: string | null,
  reason?: string | null,
): void {
  beepError();
  const cleanScanned = scannedValue.trim() || "(empty)";
  const expectedLine = expectedValue?.trim()
    ? `\nExpected: ${expectedValue.trim()}`
    : "";
  const reasonLine = reason?.trim() ? `\n\n${reason.trim()}` : "";
  const title = "Wrong Barcode!";
  const message = `Scanned: ${cleanScanned}${expectedLine}${reasonLine}\n\nThe barcode box has been cleared. Please scan the correct item barcode.`;

  try {
    if (
      Platform.OS === "web" &&
      typeof globalThis !== "undefined" &&
      typeof (globalThis as { alert?: (msg: string) => void }).alert === "function"
    ) {
      (globalThis as { alert: (msg: string) => void }).alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message, [{ text: "Scan Again", style: "cancel" }]);
  } catch {
    // Ignore if Alert is unavailable in headless environment
  }
}

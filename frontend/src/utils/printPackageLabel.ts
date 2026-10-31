import * as Print from "expo-print";
import type { PackagePrinterSettings } from "@/utils/packagePrinterSettings";

export async function printPackageLabel(html: string, settings: PackagePrinterSettings, printerUrl?: string): Promise<void> {
  // Freeze the label into a sized PDF before opening the printer dialog so the
  // system WebView cannot reflow the logo, barcode and order number separately.
  const document = await Print.printToFileAsync({
    html,
    width: Math.round(settings.paperWidthMm * 72 / 25.4),
    height: Math.round(settings.paperHeightMm * 72 / 25.4),
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    textZoom: 100,
  });
  await Print.printAsync({
    uri: document.uri,
    orientation: settings.paperWidthMm >= settings.paperHeightMm ? Print.Orientation.landscape : Print.Orientation.portrait,
    ...(printerUrl ? { printerUrl } : {}),
  });
}

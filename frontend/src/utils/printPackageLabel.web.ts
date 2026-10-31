import type { PackagePrinterSettings } from "@/utils/packagePrinterSettings";

export async function printPackageLabel(html: string, _settings: PackagePrinterSettings, _printerUrl?: string): Promise<void> {
  // Expo's web print API prints the current page, not its supplied HTML.
  const frame = document.createElement("iframe");
  frame.title = "Package barcode label";
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;";
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Could not load the label for printing.")), 15000);
      frame.onload = () => { window.clearTimeout(timeout); resolve(); };
      frame.onerror = () => { window.clearTimeout(timeout); reject(new Error("Could not load the label for printing.")); };
      frame.srcdoc = html;
      document.body.appendChild(frame);
    });
    const printWindow = frame.contentWindow;
    if (!printWindow) throw new Error("Could not open the label print window.");
    if (Array.from(frame.contentDocument?.images ?? []).some((img) => !img.naturalWidth)) {
      throw new Error("A label image could not load. Please try printing again.");
    }
    printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    frame.remove();
    throw error;
  }
}

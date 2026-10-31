import type { PackagePrinterSettings } from "@/utils/packagePrinterSettings";

export type LabelBox = { x: number; y: number; width: number; height: number };

/** Physical millimetres shared by the native preview and the printed document. */
export function getPackageLabelLayout(settings: PackagePrinterSettings, orderNumber: string) {
  const { paperWidthMm, paperHeightMm, marginMm, horizontalAlign, verticalAlign } = settings;
  const contentWidth = paperWidthMm - marginMm * 2;
  const contentHeight = paperHeightMm - marginMm * 2;
  const orderText = `Order ${orderNumber}`;
  const orderWidth = contentWidth * 0.94;
  // Fit long identifiers without platform-specific automatic text shrinking.
  const textWidthEm = Array.from(orderText).reduce((sum, char) => sum + (/[MW@#%]/.test(char) ? 1 : 0.62), 0);
  const orderFontMm = Math.min(2.65, orderWidth / Math.max(1, textWidthEm), contentHeight * 0.16 / 1.3);
  const orderHeight = orderFontMm * 1.3;
  const logoWidth = Math.min(30, contentWidth * 0.75);
  const logoHeight = Math.min(5, contentHeight * 0.22);
  const gap = Math.min(1, contentHeight * 0.04);
  const barcodeHeight = Math.min(settings.barcodeHeightMm, contentHeight - logoHeight - orderHeight - 2 * gap);
  const barcodeWidth = Math.min(settings.barcodeWidthMm, contentWidth);
  const groupHeight = logoHeight + barcodeHeight + orderHeight + 2 * gap;
  const freeHeight = Math.max(0, contentHeight - groupHeight);
  const top = marginMm + (verticalAlign === "top" ? 0 : verticalAlign === "bottom" ? freeHeight : freeHeight / 2);
  const left = (width: number) => marginMm + (horizontalAlign === "left" ? 0 : horizontalAlign === "right" ? contentWidth - width : (contentWidth - width) / 2);
  const logo: LabelBox = { x: left(logoWidth), y: top, width: logoWidth, height: logoHeight };
  const barcode: LabelBox = { x: left(barcodeWidth), y: logo.y + logo.height + gap, width: barcodeWidth, height: barcodeHeight };
  const order: LabelBox = { x: left(orderWidth), y: barcode.y + barcode.height + gap, width: orderWidth, height: orderHeight };
  return { logo, barcode, order, orderText, orderFontMm };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

export function packageLabelHtml(barcodeImage: string, orderNumber: string, settings: PackagePrinterSettings, logoImage: string): string {
  const { paperWidthMm, paperHeightMm, horizontalAlign } = settings;
  const layout = getPackageLabelLayout(settings, orderNumber);
  const boxCss = ({ x, y, width, height }: LabelBox) => `left:${x}mm;top:${y}mm;width:${width}mm;height:${height}mm;`;
  return `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { size: ${paperWidthMm}mm ${paperHeightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: ${paperWidthMm}mm; height: ${paperHeightMm}mm; -webkit-text-size-adjust: none; text-size-adjust: none; }
    .label { position: relative; width: ${paperWidthMm}mm; height: ${paperHeightMm}mm; background: #fff; color: #000; overflow: hidden; font-family: Arial, sans-serif; }
    .brand, .barcode, .order { position: absolute; margin: 0; padding: 0; }
    .brand { ${boxCss(layout.logo)} filter: brightness(0); overflow: hidden; }
    .brand img { object-fit: cover; }
    .barcode { ${boxCss(layout.barcode)} }
    img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .order { ${boxCss(layout.order)} font-size: ${layout.orderFontMm}mm; line-height: ${layout.order.height}mm; font-weight: normal; text-align: ${horizontalAlign}; white-space: nowrap; }
  </style></head><body><div class="label">
    <div class="brand"><img src="${escapeHtml(logoImage)}" alt="YourBuildMart" /></div>
    <div class="barcode"><img src="${escapeHtml(barcodeImage)}" alt="Packing barcode" /></div>
    <div class="order">${escapeHtml(layout.orderText)}</div>
  </div></body></html>`;
}

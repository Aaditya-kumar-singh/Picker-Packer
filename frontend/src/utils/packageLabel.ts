import type { PackagePrinterSettings } from "@/utils/packagePrinterSettings";

export type LabelBox = { x: number; y: number; width: number; height: number };

/** Coordinates in millimetres are shared by on-screen preview and generated PDF. */
export function getPackageLabelLayout(settings: PackagePrinterSettings, orderNumber: string, imageAspectRatio?: number) {
  const { paperWidthMm, paperHeightMm, horizontalAlign, verticalAlign } = settings;
  const leftPadding = settings.marginLeftMm + (settings.gutterPosition === "left" ? settings.gutterMm : 0);
  const rightPadding = settings.marginRightMm + (settings.gutterPosition === "right" ? settings.gutterMm : 0);
  const contentWidth = Math.max(0, paperWidthMm - leftPadding - rightPadding);
  const contentHeight = Math.max(0, paperHeightMm - settings.marginTopMm - settings.marginBottomMm);
  const orderText = `Order ${orderNumber}`;
  const sizeScale = Math.min(3, Math.max(1, Math.sqrt(contentWidth * contentHeight / (48 * 23))));
  const orderWidth = contentWidth * 0.94;

  // Fit long identifiers without relying on platform-specific text autosizing.
  const textWidthEm = Array.from(orderText).reduce((sum, char) => sum + (/[MW@#%]/.test(char) ? 1 : 0.62), 0);
  const orderFontMm = Math.max(0.01, Math.min(2.65 * sizeScale, orderWidth / Math.max(1, textWidthEm), contentHeight * 0.16 / 1.3));
  const orderHeight = orderFontMm * 1.3;
  const logoHeight = Math.min(5 * sizeScale, contentHeight * 0.22);
  const logoWidth = Math.min(30 * sizeScale, contentWidth * 0.75, logoHeight * 6);
  const gap = Math.min(sizeScale, contentHeight * 0.04);
  const availableHeight = Math.max(0, contentHeight - logoHeight - orderHeight - 2 * gap);

  // Use the actual server barcode dimensions when available; never stretch a QR or 1D code.
  const ratio = imageAspectRatio && Number.isFinite(imageAspectRatio) && imageAspectRatio > 0
    ? imageAspectRatio : settings.barcodeWidthMm / settings.barcodeHeightMm;
  const maxWidth = settings.autoFit ? Math.min(contentWidth * 0.92, 60) : Math.min(settings.barcodeWidthMm, contentWidth);
  const maxHeight = settings.autoFit ? Math.min(availableHeight, 45) : Math.min(settings.barcodeHeightMm, availableHeight);
  const barcodeWidth = Math.max(0.01, Math.min(maxWidth, maxHeight * ratio));
  const barcodeHeight = barcodeWidth / ratio;

  const groupHeight = logoHeight + barcodeHeight + orderHeight + 2 * gap;
  const freeHeight = Math.max(0, contentHeight - groupHeight);
  const top = settings.marginTopMm + (verticalAlign === "top" ? 0 : verticalAlign === "bottom" ? freeHeight : freeHeight / 2);
  const left = (width: number) => leftPadding + (horizontalAlign === "left" ? 0 : horizontalAlign === "right" ? contentWidth - width : (contentWidth - width) / 2);
  const logo: LabelBox = { x: left(logoWidth), y: top, width: logoWidth, height: logoHeight };
  const barcode: LabelBox = { x: left(barcodeWidth), y: logo.y + logo.height + gap, width: barcodeWidth, height: barcodeHeight };
  const order: LabelBox = { x: left(orderWidth), y: barcode.y + barcode.height + gap, width: orderWidth, height: orderHeight };

  const error = contentWidth < 12 || contentHeight < 9
    ? "Margins and gutter leave too little printable space. Reduce them or choose a larger label."
    : barcodeWidth < 10 || barcodeHeight < 3
      ? "The barcode is too small to print reliably. Use larger paper or reduce margins."
      : orderFontMm < 1
        ? "Order number cannot fit legibly. Choose larger paper or shorten the identifier."
        : null;
  const warning = !error && (barcodeHeight < 6 || (ratio < 1.5 && barcodeWidth < 15))
    ? "Small barcode: confirm the printed label scans correctly before using it."
    : null;
  return {
    logo, barcode, order, orderText, orderFontMm, warning, error,
    printableWidthMm: contentWidth,
    printableHeightMm: contentHeight,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

export function packageLabelHtml(barcodeImage: string, orderNumber: string, settings: PackagePrinterSettings, logoImage: string, imageAspectRatio?: number): string {
  const { paperWidthMm, paperHeightMm, horizontalAlign } = settings;
  const layout = getPackageLabelLayout(settings, orderNumber, imageAspectRatio);
  if (layout.error) throw new Error(layout.error);
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

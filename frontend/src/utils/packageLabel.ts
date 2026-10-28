import type { PackagePrinterSettings } from "@/utils/packagePrinterSettings";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

export function packageLabelHtml(barcodeImage: string, orderNumber: string, settings: PackagePrinterSettings): string {
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeBarcodeImage = escapeHtml(barcodeImage);
  const { paperWidthMm, paperHeightMm, marginMm, barcodeWidthMm, barcodeHeightMm, horizontalAlign, verticalAlign } = settings;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${paperWidthMm}mm ${paperHeightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${paperWidthMm}mm; height: ${paperHeightMm}mm; }
    * { box-sizing: border-box; }
    .label { width: ${paperWidthMm}mm; height: ${paperHeightMm}mm; padding: ${marginMm}mm; display: flex; flex-direction: column; align-items: ${horizontalAlign === "left" ? "flex-start" : horizontalAlign === "right" ? "flex-end" : "center"}; justify-content: ${verticalAlign === "top" ? "flex-start" : verticalAlign === "bottom" ? "flex-end" : "center"}; font-family: Arial, sans-serif; color: #000; background: #fff; overflow: hidden; }
    .heading { font-size: 8pt; font-weight: bold; margin-bottom: 2mm; }
    .barcode { width: ${barcodeWidthMm}mm; height: ${barcodeHeightMm}mm; display: flex; align-items: center; justify-content: center; }
    .barcode img { width: 100%; height: 100%; object-fit: contain; }
    .order { font-size: 8pt; text-align: center; margin-top: 1mm; }
  </style></head><body><div class="label">
    <div class="heading">YOURBUILDMART, PACKING BARCODE</div>
    <div class="barcode"><img src="${safeBarcodeImage}" /></div>
    <div class="order">Order ${safeOrderNumber}</div>
  </div></body></html>`;
}

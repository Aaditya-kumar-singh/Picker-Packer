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

export function packageLabelHtml(barcodeImage: string, orderNumber: string, settings: PackagePrinterSettings, logoImage: string): string {
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeBarcodeImage = escapeHtml(barcodeImage);
  const safeLogoImage = escapeHtml(logoImage);
  const { paperWidthMm, paperHeightMm, marginMm, barcodeWidthMm, barcodeHeightMm, horizontalAlign, labelLayout } = settings;
  const contentWidthMm = Math.max(1, paperWidthMm - marginMm * 2);
  const orderText = `Order ${orderNumber}`;
  const customerText = "Customer ID: CUST-001";
  const fitText = (text: string, fontPt: number, boxWidthMm: number) => Math.min(1, boxWidthMm / (text.length * fontPt * 0.56 * 25.4 / 72));
  const orderFit = fitText(orderText, 8 * labelLayout.order.scale, contentWidthMm * 0.78 * labelLayout.order.scale);
  const customerFit = fitText(customerText, 7 * labelLayout.customer.scale, contentWidthMm * 0.78 * labelLayout.customer.scale);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${paperWidthMm}mm ${paperHeightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${paperWidthMm}mm; height: ${paperHeightMm}mm; }
    * { box-sizing: border-box; }
    .label { position: relative; width: ${paperWidthMm}mm; height: ${paperHeightMm}mm; background: #fff; color: #000; overflow: hidden; font-family: Arial, sans-serif; }
    .canvas { position: absolute; left: ${marginMm}mm; top: ${marginMm}mm; right: ${marginMm}mm; bottom: ${marginMm}mm; }
    .brand, .order, .customer, .barcode { position: absolute; margin: 0; }
    .brand { left: ${labelLayout.heading.x}%; top: ${labelLayout.heading.y}%; width: ${68 * labelLayout.heading.scale}%; max-height: ${18 * labelLayout.heading.scale}mm; object-fit: contain; filter: grayscale(1) contrast(1.2); }
    .barcode { left: ${labelLayout.barcode.x}%; top: ${labelLayout.barcode.y}%; width: ${barcodeWidthMm * labelLayout.barcode.scale}mm; }
    .barcode img { display: block; width: 100%; height: auto; max-height: ${barcodeHeightMm * labelLayout.barcode.scale}mm; object-fit: contain; }
    .order { left: ${labelLayout.order.x}%; top: ${labelLayout.order.y}%; width: ${78 * labelLayout.order.scale}%; font-size: ${8 * labelLayout.order.scale * orderFit}pt; line-height: 1.2; text-align: ${horizontalAlign}; white-space: nowrap; }
    .customer { left: ${labelLayout.customer.x}%; top: ${labelLayout.customer.y}%; width: ${78 * labelLayout.customer.scale}%; font-size: ${7 * labelLayout.customer.scale * customerFit}pt; line-height: 1.2; text-align: ${horizontalAlign}; white-space: nowrap; }
  </style></head><body><div class="label"><div class="canvas">
    <img class="brand" src="${safeLogoImage}" alt="YourBuildMart" />
    <div class="barcode"><img src="${safeBarcodeImage}" /></div>
    <div class="order">Order ${safeOrderNumber}</div>
    <div class="customer">Customer ID: CUST-001</div>
  </div>
  </div></body></html>`;
}

// Use bwip-js's generic SVG renderer. Its default React Native entry imports
// a zlib implementation that fails during Expo Go startup on this project.
import bwipjs from "bwip-js/generic";

export function createPackageBarcode(packageId: string): string {
  return bwipjs.toSVG({
    bcid: "code128",
    text: packageId,
    scale: 2,
    height: 18,
    padding: 8,
    includetext: false,
    monochrome: true,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

export function packageLabelHtml(packageId: string, orderNumber: string, barcodeSvg: string): string {
  const safePackageId = escapeHtml(packageId);
  const safeOrderNumber = escapeHtml(orderNumber);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 75mm 50mm; margin: 0; }
    html, body { margin: 0; padding: 0; width: 75mm; height: 50mm; }
    * { box-sizing: border-box; }
    .label { width: 75mm; height: 50mm; padding: 4mm; display: flex; flex-direction: column; justify-content: center; font-family: Arial, sans-serif; color: #000; background: #fff; }
    .heading { font-size: 8pt; font-weight: bold; margin-bottom: 2mm; }
    .barcode { width: 67mm; height: 25mm; display: flex; align-items: center; justify-content: center; }
    .barcode svg { width: 100%; height: 100%; }
    .id { font-size: 10pt; font-weight: bold; text-align: center; overflow-wrap: anywhere; margin-top: 1mm; }
    .order { font-size: 8pt; text-align: center; margin-top: 1mm; }
  </style></head><body><div class="label">
    <div class="heading">YOURBUILDMART, CODE 128 PACKAGE BARCODE</div>
    <div class="barcode">${barcodeSvg}</div>
    <div class="id">${safePackageId}</div>
    <div class="order">Order ${safeOrderNumber}</div>
  </div></body></html>`;
}

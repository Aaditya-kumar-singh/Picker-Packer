import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const frontend = path.resolve(import.meta.dirname, "../frontend");
const requireFrontend = createRequire(path.join(frontend, "package.json"));
const ts = requireFrontend("typescript");

function loadTs(relativePath, imports = {}) {
  const filename = path.join(frontend, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unexpected dependency in ${relativePath}: ${name}`);
    },
  }, { filename });
  return module.exports;
}

function settingsModule(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { writes.push(key); values.set(key, value); },
    async removeItem(key) { writes.push(key); values.delete(key); },
  };
  return {
    ...loadTs("src/utils/packagePrinterSettings.ts", { "@react-native-async-storage/async-storage": storage }),
    values,
    writes,
  };
}

const { getPackageLabelLayout, packageLabelHtml } = loadTs("src/utils/packageLabel.ts");

test("50 x 25 mm sticker and an 8 mm barcode height survive settings normalization", () => {
  const { normalizePackagePrinterSettings } = settingsModule();
  const settings = normalizePackagePrinterSettings({ paperWidthMm: 50, paperHeightMm: 25, barcodeHeightMm: 8 });
  assert.equal(settings.paperWidthMm, 50);
  assert.equal(settings.paperHeightMm, 25);
  assert.equal(settings.barcodeHeightMm, 8);
  const defaults = normalizePackagePrinterSettings(null);
  assert.equal(defaults.paperHeightMm, 25);
  assert.equal(defaults.marginMm, 1);
  for (const value of Object.values(defaults)) {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
});

test("logo, barcode and order remain inside the label with separate vertical bounds", () => {
  const { normalizePackagePrinterSettings } = settingsModule();
  const tolerance = 1e-8;
  for (const [paperWidthMm, paperHeightMm] of [[30, 15], [50, 25], [75, 50], [100, 150]]) {
    for (const marginMm of [0, 1, 100]) {
      for (const horizontalAlign of ["left", "center", "right"]) {
        for (const verticalAlign of ["top", "center", "bottom"]) {
          for (const barcodeHeightMm of [2, 11, 300]) {
            for (const barcodeWidthMm of [10, 40, 300]) {
              const settings = normalizePackagePrinterSettings({
                paperWidthMm, paperHeightMm, marginMm, horizontalAlign, verticalAlign,
                barcodeHeightMm, barcodeWidthMm,
              });
              const layout = getPackageLabelLayout(settings, "SO-20261026-23951");
              for (const box of [layout.logo, layout.barcode, layout.order]) {
                assert.ok(box.width > 0 && box.height > 0);
                assert.ok(box.x >= settings.marginMm - tolerance);
                assert.ok(box.y >= settings.marginMm - tolerance);
                assert.ok(box.x + box.width <= settings.paperWidthMm - settings.marginMm + tolerance);
                assert.ok(box.y + box.height <= settings.paperHeightMm - settings.marginMm + tolerance);
              }
              assert.ok(layout.logo.y + layout.logo.height < layout.barcode.y);
              assert.ok(layout.barcode.y + layout.barcode.height < layout.order.y);
            }
          }
        }
      }
    }
  }
});

test("long order IDs shrink within the same physical text box", () => {
  const { DEFAULT_PACKAGE_PRINTER_SETTINGS: settings } = settingsModule();
  const short = getPackageLabelLayout(settings, "SO-123");
  const long = getPackageLabelLayout(settings, `SO-${"W".repeat(80)}`);
  assert.equal(short.order.width, long.order.width);
  assert.ok(long.orderFontMm < short.orderFontMm);
  assert.ok(long.orderFontMm > 0);
  assert.ok(long.order.y + long.order.height <= settings.paperHeightMm - settings.marginMm);
});

test("print HTML uses 50 x 25 mm and contains only logo, backend barcode and escaped order", () => {
  const { DEFAULT_PACKAGE_PRINTER_SETTINGS: settings } = settingsModule();
  const barcode = "data:image/png;base64,YmFyY29kZQ==";
  const logo = "data:image/png;base64,bG9nbw==";
  const html = packageLabelHtml(barcode, 'SO-123<&"', settings, logo);
  assert.match(html, /@page\s*\{\s*size:\s*50mm 25mm/);
  assert.equal([...html.matchAll(/<img\b/g)].length, 2);
  assert.ok(html.includes(`src="${barcode}"`));
  assert.ok(html.includes(`src="${logo}"`));
  assert.ok(html.includes("Order SO-123&lt;&amp;&quot;"));
  assert.doesNotMatch(html, /Customer ID|CUST-001|class="customer"/);
  assert.match(html, /object-fit:\s*contain/);
});

test("legacy 30 mm settings migrate once without changing the saved printer", async () => {
  const settingsKey = "ybm.package-printer-settings.v1";
  const printerKey = `${settingsKey}.ios-printer`;
  const printer = JSON.stringify({ name: "Warehouse label printer", url: "ipp://warehouse.local/label" });
  const settings = settingsModule({
    [settingsKey]: JSON.stringify({
      paperWidthMm: 50, paperHeightMm: 30, marginMm: 4, barcodeWidthMm: 32, barcodeHeightMm: 10,
      labelLayout: { customer: { x: 4, y: 83 }, order: { x: 4, y: 66 } },
    }),
    [`${settingsKey}.50x25-migrated`]: "1",
    [printerKey]: printer,
  });
  const migrated = await settings.loadPackagePrinterSettings();
  assert.equal(migrated.paperWidthMm, 50);
  assert.equal(migrated.paperHeightMm, 25);
  assert.equal(migrated.marginMm, 1);
  assert.equal(migrated.barcodeWidthMm, 40);
  assert.equal(migrated.barcodeHeightMm, 11);
  assert.equal(migrated.labelLayout, undefined);
  assert.equal(settings.values.get(printerKey), printer);
  assert.ok(!settings.writes.includes(printerKey));
  assert.equal((await settings.loadSavedPrinter()).name, "Warehouse label printer");

  await settings.savePackagePrinterSettings({ ...migrated, barcodeWidthMm: 35, barcodeHeightMm: 8, horizontalAlign: "right" });
  const reloaded = await settings.loadPackagePrinterSettings();
  assert.equal(reloaded.paperHeightMm, 25);
  assert.equal(reloaded.barcodeWidthMm, 35);
  assert.equal(reloaded.barcodeHeightMm, 8);
  assert.equal(reloaded.horizontalAlign, "right");
  assert.equal(settings.values.get(printerKey), printer);
});

test("Android print logo embeds the downloaded asset and reuses its cached bytes", async () => {
  let downloads = 0;
  let reads = 0;
  const asset = { localUri: null, async downloadAsync() { downloads++; this.localUri = "file:///cache/wordmark.png"; } };
  const { getPrintLogoSource } = loadTs("src/utils/printLogoAsset.android.ts", {
    "../../assets/images/yourbuildmart-wordmark.png": 17,
    "expo-asset": { Asset: { fromModule(id) { assert.equal(id, 17); return asset; } } },
    "expo-file-system": { File: class {
      constructor(uri) { assert.equal(uri, "file:///cache/wordmark.png"); }
      async base64() { reads++; return "bG9nbw=="; }
    } },
  });
  assert.equal(await getPrintLogoSource(), "data:image/png;base64,bG9nbw==");
  assert.equal(await getPrintLogoSource(), "data:image/png;base64,bG9nbw==");
  assert.equal(downloads, 1);
  assert.equal(reads, 1);
});

test("native printing renders a sized PDF before passing only its URI to the printer", async () => {
  const { DEFAULT_PACKAGE_PRINTER_SETTINGS: settings } = settingsModule();
  const calls = [];
  let finishRendering;
  const rendering = new Promise((resolve) => { finishRendering = resolve; });
  const { printPackageLabel } = loadTs("src/utils/printPackageLabel.ts", {
    "expo-print": {
      Orientation: { landscape: "landscape", portrait: "portrait" },
      printToFileAsync(options) { calls.push({ kind: "render", options }); return rendering; },
      async printAsync(options) { calls.push({ kind: "print", options }); },
    },
  });
  const printing = printPackageLabel("<html>label</html>", settings);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, "render");
  assert.equal(calls[0].options.html, "<html>label</html>");
  assert.equal(calls[0].options.width, 142);
  assert.equal(calls[0].options.height, 71);
  assert.equal(calls[0].options.textZoom, 100);
  for (const side of ["top", "right", "bottom", "left"]) assert.equal(calls[0].options.margins[side], 0);

  finishRendering({ uri: "file:///cache/label.pdf", numberOfPages: 1 });
  await printing;
  assert.equal(calls.length, 2);
  assert.equal(calls[1].kind, "print");
  assert.equal(calls[1].options.uri, "file:///cache/label.pdf");
  assert.equal(calls[1].options.orientation, "landscape");
  assert.equal(calls[1].options.html, undefined);
  assert.equal(calls[1].options.printerUrl, undefined);
});

test("native printing preserves a saved iOS printer and follows portrait media orientation", async () => {
  const { DEFAULT_PACKAGE_PRINTER_SETTINGS: defaults } = settingsModule();
  let printed;
  const { printPackageLabel } = loadTs("src/utils/printPackageLabel.ts", {
    "expo-print": {
      Orientation: { landscape: "landscape", portrait: "portrait" },
      async printToFileAsync() { return { uri: "file:///cache/portrait.pdf", numberOfPages: 1 }; },
      async printAsync(options) { printed = options; },
    },
  });
  await printPackageLabel("<html>label</html>", { ...defaults, paperWidthMm: 50, paperHeightMm: 75 }, "ipp://warehouse.local/label");
  assert.equal(printed.orientation, "portrait");
  assert.equal(printed.printerUrl, "ipp://warehouse.local/label");
  assert.equal(printed.uri, "file:///cache/portrait.pdf");
});

test("failed PDF generation prevents opening the native print dialog", async () => {
  const { DEFAULT_PACKAGE_PRINTER_SETTINGS: settings } = settingsModule();
  let printCalls = 0;
  const { printPackageLabel } = loadTs("src/utils/printPackageLabel.ts", {
    "expo-print": {
      Orientation: { landscape: "landscape", portrait: "portrait" },
      async printToFileAsync() { throw new Error("PDF renderer unavailable"); },
      async printAsync() { printCalls++; },
    },
  });
  await assert.rejects(printPackageLabel("<html>label</html>", settings), /PDF renderer unavailable/);
  assert.equal(printCalls, 0);
});

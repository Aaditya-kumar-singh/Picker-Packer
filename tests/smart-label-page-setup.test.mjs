import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const frontend = path.resolve(import.meta.dirname, "../frontend");
const ts = createRequire(path.join(frontend, "package.json"))("typescript");

function loadTs(relative, imports = {}) {
  const filename = path.join(frontend, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename });
  return module.exports;
}

const storage = new Map();
const asyncStorage = {
  getItem: async (key) => storage.get(key) ?? null,
  setItem: async (key, value) => { storage.set(key, value); },
  removeItem: async (key) => { storage.delete(key); },
};
const settingsModule = loadTs("src/utils/packagePrinterSettings.ts", {
  "@react-native-async-storage/async-storage": asyncStorage,
});
const { normalizePackagePrinterSettings: normalize, DEFAULT_PACKAGE_PRINTER_SETTINGS: defaults, PAPER_SIZE_PRESETS: presets } = settingsModule;
const { getPackageLabelLayout: layout, packageLabelHtml: html } = loadTs("src/utils/packageLabel.ts");

test("paper presets include the original 50 x 25 mm and A4, A5, A6 and Letter", () => {
  for (const label of ["50 × 25", "50 × 30", "75 × 50", "100 × 150", "A4", "A5", "A6", "Letter"]) {
    assert.ok(presets.some((p) => p.label === label), `Missing preset: ${label}`);
  }
  assert.equal(defaults.paperWidthMm, 50);
  assert.equal(defaults.paperHeightMm, 25);
  const custom = normalize({ paperWidthMm: 58.5, paperHeightMm: 32.4 });
  assert.equal(custom.paperWidthMm, 58.5);
  assert.equal(custom.paperHeightMm, 32.4);
  assert.equal(normalize({ paperWidthMm: 297, paperHeightMm: 210 }).paperWidthMm, 297);
});

test("separate margins and gutter constrain printed coordinates", () => {
  const right = normalize({ paperWidthMm: 75, paperHeightMm: 50, marginTopMm: 2,
    marginBottomMm: 7, marginLeftMm: 3, marginRightMm: 5, gutterMm: 2, gutterPosition: "right" });
  const left = normalize({ ...right, gutterPosition: "left" });
  const rightLayout = layout(right, "SO-123");
  const leftLayout = layout(left, "SO-123");
  assert.equal(rightLayout.error, null);
  assert.equal(rightLayout.printableWidthMm, 65);
  assert.equal(rightLayout.printableHeightMm, 41);
  assert.ok(Math.abs(leftLayout.logo.x - rightLayout.logo.x - 2) < 0.001);
  for (const box of [rightLayout.logo, rightLayout.barcode, rightLayout.order]) {
    assert.ok(box.x >= right.marginLeftMm);
    assert.ok(box.x + box.width <= right.paperWidthMm - right.marginRightMm - right.gutterMm + 0.001);
    assert.ok(box.y >= right.marginTopMm);
    assert.ok(box.y + box.height <= right.paperHeightMm - right.marginBottomMm + 0.001);
  }
});

test("barcode maintains square QR or wide 1D proportions and has manual override", () => {
  const s = normalize({ paperWidthMm: 75, paperHeightMm: 50 });
  for (const ratio of [1, 3.2, 4]) {
    const calculated = layout(s, "SO-123", ratio);
    assert.equal(calculated.error, null);
    assert.ok(Math.abs(calculated.barcode.width / calculated.barcode.height - ratio) < 0.001);
  }
  const fixed = layout(normalize({ ...s, autoFit: false, barcodeWidthMm: 22, barcodeHeightMm: 8 }), "SO-123");
  assert.equal(fixed.error, null);
  assert.ok(fixed.barcode.width <= 22);
  assert.ok(fixed.barcode.height <= 8);
});

test("small barcode warnings and impossible margins block print", () => {
  const impossible = normalize({ paperWidthMm: 30, paperHeightMm: 15, gutterMm: 20 });
  assert.match(layout(impossible, "SO-123").error, /printable space/);
  assert.throws(() => html("data:image/png;base64,AA", "SO-123", impossible, "data:image/png;base64,BB"), /printable space/);
  const smallBarcode = layout(normalize({ autoFit: false, barcodeWidthMm: 14, barcodeHeightMm: 4 }), "SO-123");
  assert.equal(smallBarcode.error, null);
  assert.match(smallBarcode.warning, /scans correctly/);
});

test("letter paper text scales while retaining the original barcode and logo images", () => {
  const paper = normalize({ paperWidthMm: 215.9, paperHeightMm: 279.4 });
  const large = layout(paper, "SO-123", 4);
  assert.equal(large.error, null);
  assert.ok(large.orderFontMm > layout(defaults, "SO-123").orderFontMm);
  assert.ok(large.logo.height > layout(defaults, "SO-123").logo.height);
  const barcode = "data:image/png;base64,YmFyY29kZQ==";
  const logo = "data:image/png;base64,bG9nbw==";
  const output = html(barcode, "SO-123", paper, logo, 4);
  assert.match(output, /size: 215.9mm 279.4mm/);
  assert.ok(output.includes(`src="${barcode}"`));
  assert.ok(output.includes(`src="${logo}"`));
  assert.equal([...output.matchAll(/<img\b/g)].length, 2);
});

test("saves independent margins without overwriting the selected printer", async () => {
  const printerKey = "ybm.package-printer-settings.v1.ios-printer";
  storage.set(printerKey, JSON.stringify({ name: "Warehouse", url: "ipp://warehouse/printer" }));
  const original = normalize({ paperWidthMm: 75, paperHeightMm: 50,
    marginTopMm: 2, marginBottomMm: 3, marginLeftMm: 4, marginRightMm: 5,
    autoFit: false, gutterMm: 1.5, gutterPosition: "right" });
  await settingsModule.savePackagePrinterSettings(original);
  storage.set("ybm.package-printer-settings.v1.50x25-logo-barcode-order.v2", "1");
  const restored = await settingsModule.loadPackagePrinterSettings();
  assert.equal(restored.marginLeftMm, 4);
  assert.equal(restored.marginRightMm, 5);
  assert.equal(restored.autoFit, false);
  assert.equal(restored.gutterMm, 1.5);
  assert.equal((await settingsModule.loadSavedPrinter()).name, "Warehouse");
});

test("checking default saves exactly one paper size and restores it for new labels", async () => {
  storage.clear();
  const key = "ybm.package-printer-settings.v1";
  storage.set(`${key}.50x25-logo-barcode-order.v2`, "1");
  storage.set(`${key}.default-paper-migration.v1`, "1");
  storage.set(`${key}.ios-printer`, JSON.stringify({ name: "Warehouse", url: "ipp://printer" }));
  await settingsModule.savePackagePrinterSettings(normalize({
    paperWidthMm: 100, paperHeightMm: 150, marginLeftMm: 3, autoFit: false,
  }));

  // Unsaved paper selections are for the current print only.
  let loaded = await settingsModule.loadPackagePrinterSettings();
  assert.equal(loaded.paperWidthMm, 50);
  assert.equal(loaded.paperHeightMm, 25);

  await settingsModule.saveDefaultPaperSize({ paperWidthMm: 75, paperHeightMm: 50 });
  assert.equal(storage.has(`${key}.default-paper-size.v1`), true);
  loaded = await settingsModule.loadPackagePrinterSettings();
  assert.equal(loaded.paperWidthMm, 75);
  assert.equal(loaded.paperHeightMm, 50);
  assert.equal(loaded.marginLeftMm, 3);
  assert.equal(loaded.autoFit, false);

  // A one-off print at another size must not silently replace the default.
  await settingsModule.savePackagePrinterSettings(normalize({ ...loaded, paperWidthMm: 100, paperHeightMm: 150 }));
  const reopened = await settingsModule.loadPackagePrinterSettings();
  assert.equal(reopened.paperWidthMm, 75);
  assert.equal(reopened.paperHeightMm, 50);
  assert.equal((await settingsModule.loadSavedPrinter()).name, "Warehouse");
});

test("unchecking removes the saved default, restores built-in size, and preserves other settings", async () => {
  const key = "ybm.package-printer-settings.v1";
  await settingsModule.saveDefaultPaperSize(null);
  assert.equal(storage.has(`${key}.default-paper-size.v1`), false);
  assert.equal(await settingsModule.loadDefaultPaperSize(), null);
  const reloaded = await settingsModule.loadPackagePrinterSettings();
  assert.equal(reloaded.paperWidthMm, 50);
  assert.equal(reloaded.paperHeightMm, 25);
  assert.equal(reloaded.marginLeftMm, 3);
  assert.equal(reloaded.autoFit, false);
  assert.equal((await settingsModule.loadSavedPrinter()).name, "Warehouse");
});

test("a different custom or landscape size can replace the saved default", async () => {
  storage.clear();
  storage.set("ybm.package-printer-settings.v1.50x25-logo-barcode-order.v2", "1");
  await settingsModule.saveDefaultPaperSize({ paperWidthMm: 100, paperHeightMm: 150 });
  await settingsModule.saveDefaultPaperSize({ paperWidthMm: 150, paperHeightMm: 100 });
  const loaded = await settingsModule.loadPackagePrinterSettings();
  assert.equal(loaded.paperWidthMm, 150);
  assert.equal(loaded.paperHeightMm, 100);
  assert.equal((await settingsModule.loadDefaultPaperSize()).paperHeightMm, 100);
});

test("one-time migration preserves a previously saved paper size without restoring it after clearing", async () => {
  storage.clear();
  const key = "ybm.package-printer-settings.v1";
  storage.set(`${key}.50x25-logo-barcode-order.v2`, "1");
  storage.set(key, JSON.stringify({ ...defaults, paperWidthMm: 75, paperHeightMm: 50 }));
  const upgraded = await settingsModule.loadPackagePrinterSettings();
  assert.equal(upgraded.paperWidthMm, 75);
  assert.equal(upgraded.paperHeightMm, 50);
  assert.equal((await settingsModule.loadDefaultPaperSize()).paperWidthMm, 75);
  assert.equal(storage.get(`${key}.default-paper-migration.v1`), "1");

  await settingsModule.saveDefaultPaperSize(null);
  assert.equal(storage.has(`${key}.default-paper-size.v1`), false);
  const withoutDefault = await settingsModule.loadPackagePrinterSettings();
  assert.equal(withoutDefault.paperWidthMm, 50);
  assert.equal(withoutDefault.paperHeightMm, 25);
  assert.equal(await settingsModule.loadDefaultPaperSize(), null);
});

test("corrupt or invalid saved defaults fall back safely, without becoming defaults", async () => {
  const key = "ybm.package-printer-settings.v1.default-paper-size.v1";
  await assert.rejects(
    settingsModule.saveDefaultPaperSize({ paperWidthMm: 0, paperHeightMm: 50 }),
    /valid paper size/,
  );
  storage.set(key, JSON.stringify({ paperWidthMm: 9999, paperHeightMm: 50 }));
  assert.equal(await settingsModule.loadDefaultPaperSize(), null);
  let restored = await settingsModule.loadPackagePrinterSettings();
  assert.equal(restored.paperWidthMm, 50);
  storage.set(key, "{invalid");
  assert.equal(await settingsModule.loadDefaultPaperSize(), null);
  restored = await settingsModule.loadPackagePrinterSettings();
  assert.equal(restored.paperWidthMm, 50);
  storage.delete(key);
});

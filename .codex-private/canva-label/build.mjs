import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "C:/Users/mrfai/OneDrive/Desktop/YourBuildMart Picker Packer/Picker-Packer";
const buildDir = path.join(workspaceDir, ".codex-private/canva-label");
const outputDir = path.join(workspaceDir, "output");
const finalPath = path.join(outputDir, "yourbuildmart-packing-label-canva-mobile-editable.pptx");
const skillDir = "C:/Users/mrfai/.codex/plugins/cache/openai-primary-runtime/presentations/26.1017.22136/skills/presentations";
const runtimeNode = "C:/Users/mrfai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe";
const runtimePython = "C:/Users/mrfai/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
process.env.RUNTIME_NODE_MODULES = "C:/Users/mrfai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
const presentation = Presentation.create({ slideSize: { width: 283.465, height: 188.976 } });
const slide = presentation.slides.add();
slide.background.fill = "#FFFFFF";

function addText(name, text, position, style) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    name,
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = { typeface: "Arial", color: "#111111", alignment: "center", verticalAlignment: "middle", ...style };
  shape.text.insets = 0;
  return shape;
}

addText("Editable YourBuildMart wordmark", "YourBuildMart", { left: 42, top: 43, width: 200, height: 23 }, {
  fontSize: 18, bold: true, italic: true, color: "#262626",
});

// Sample barcode is a single selectable vector object for easier mobile editing.
const widths = Array.from({ length: 45 }, (_, index) => [0.9, 2.0, 1.0, 1.0, 2.6, 1.3, 1.9][(index * 5 + Math.floor(index / 3)) % 7]);
const gap = 1.25;
const barcodeWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
let barX = 0;
const bars = widths.map((width) => {
  const bar = `<rect x="${barX.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="34" fill="#111111"/>`;
  barX += width + gap;
  return bar;
}).join("");
const barcodeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${barcodeWidth}mm" height="34mm" viewBox="0 0 ${barcodeWidth} 34">${bars}</svg>`;
const barcodeBytes = Buffer.from(barcodeSvg, "utf8");
slide.images.add({
  blob: barcodeBytes.buffer.slice(barcodeBytes.byteOffset, barcodeBytes.byteOffset + barcodeBytes.byteLength),
  contentType: "image/svg+xml",
  alt: "Editable sample barcode graphic",
  fit: "contain",
  position: { left: (283.465 - barcodeWidth) / 2, top: 78, width: barcodeWidth, height: 34 },
});

addText("Editable order number", "Order SO-20261029-06403", { left: 20, top: 119, width: 243.465, height: 15 }, {
  fontSize: 11, color: "#111111",
});
addText("Editable sample customer ID", "Customer ID: CUST-001", { left: 20, top: 136, width: 243.465, height: 13 }, {
  fontSize: 9.5, color: "#111111",
});

const preview = await presentation.export({ slide, format: "png", scale: 4 });
await fs.writeFile(path.join(buildDir, "label-preview.png"), new Uint8Array(await preview.arrayBuffer()));
const candidatePath = path.join(buildDir, "candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, "container_tools/artifact_tool_utils.mjs")).href);
const result = await finalizePresentation({
  explicitTotalSlideCount: 1,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "2700004,1799996", "--validate-bullet-geometry", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: ["Arial"] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "validation-mobile.json"),
});
console.log(JSON.stringify({ finalPath, result }));

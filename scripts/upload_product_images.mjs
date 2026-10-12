#!/usr/bin/env node
/**
 * Upload the SKU-named product photos to Supabase Storage and then map them
 * to public.product_catalog.image_path.
 *
 * Safe by default: without --upload this only validates the local files.
 * Set SUPABASE_SERVICE_ROLE_KEY in the current shell for an upload run.
 * Never put the service-role key in source control or frontend/.env.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_DIR = path.join(ROOT, "product-images");
const ENV_FILE = path.join(ROOT, "frontend", ".env");
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
let currentStage = "initialization";

function readEnvFile(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const doUpload = process.argv.includes("--upload");
  const envText = await fs.readFile(ENV_FILE, "utf8");
  const env = { ...readEnvFile(envText), ...process.env };
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert(supabaseUrl, "EXPO_PUBLIC_SUPABASE_URL is missing from frontend/.env.");
  if (doUpload) {
    assert(apiKey, "Set SUPABASE_SERVICE_ROLE_KEY in this shell before using --upload. Do not put it in frontend/.env or commit it.");
  }

  const entries = (await fs.readdir(IMAGE_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();

  assert(entries.length === 70, `Expected 70 product images; found ${entries.length}.`);
  const skuNames = new Set();
  const files = [];
  for (const name of entries) {
    const sku = path.basename(name, path.extname(name));
    assert(/^YBM-[A-Z0-9-]+$/.test(sku), `Unexpected image filename: ${name}`);
    assert(!skuNames.has(sku), `Duplicate SKU image: ${sku}`);
    skuNames.add(sku);
    const filePath = path.join(IMAGE_DIR, name);
    const body = await fs.readFile(filePath);
    assert(body.length > 0 && body.length <= MAX_BYTES, `${name} is empty or exceeds the 5 MB bucket limit.`);
    const extension = path.extname(name).toLowerCase();
    const contentType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
    files.push({ name, sku, body, contentType });
  }

  console.log(`Local validation passed: ${files.length} SKU-named images, all within the 5 MB limit.`);
  if (!doUpload) {
    console.log("No files uploaded. Run with --upload after setting SUPABASE_SERVICE_ROLE_KEY in the current shell.");
    return;
  }

  let parsedSupabaseUrl;
  try {
    parsedSupabaseUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL is not a valid URL. Check frontend/.env.");
  }
  assert(parsedSupabaseUrl.protocol === "https:", "Supabase URL must use HTTPS.");
  const baseUrl = parsedSupabaseUrl.toString().replace(/\/+$/, "");
  const invalidKeyChars = [...apiKey].map((character, index) => ({ character, index, code: character.charCodeAt(0) })).filter(({ code }) => code < 33 || code > 126);
  assert(invalidKeyChars.length === 0, `The API key contains ${invalidKeyChars.length} invalid header character(s) at position(s): ${invalidKeyChars.map(({ index, code }) => `${index + 1} (character code ${code})`).join(", ")}. Re-copy the complete key without quotes or whitespace.`);
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
  currentStage = "connecting to Supabase REST API / reading product catalog";
  const catalogResponse = await fetch(
    `${baseUrl}/rest/v1/product_catalog?select=sku,active&active=eq.true`,
    { headers: { ...headers, Accept: "application/json" } },
  );
  if (!catalogResponse.ok) throw new Error(`Could not read product catalog (${catalogResponse.status}): ${await catalogResponse.text()}`);
  const catalog = await catalogResponse.json();
  const activeSkus = new Set(catalog.map((row) => row.sku));
  const missing = [...activeSkus].filter((sku) => !skuNames.has(sku));
  const extra = [...skuNames].filter((sku) => !activeSkus.has(sku));
  assert(activeSkus.size === 70 && missing.length === 0 && extra.length === 0,
    `Catalog/image mismatch. Active catalog SKUs=${activeSkus.size}, missing photos=${missing.join(",") || "none"}, extra photos=${extra.join(",") || "none"}.`);

  let uploaded = 0;
  for (const file of files) {
    currentStage = `uploading image ${file.name}`;
    const uploadUrl = `${baseUrl}/storage/v1/object/product-images/${file.name.split("/").map(encodeURIComponent).join("/")}`;
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": file.contentType, "x-upsert": "true" },
      body: file.body,
    });
    if (!response.ok) throw new Error(`Upload failed for ${file.name} (${response.status}): ${await response.text()}`);
    uploaded++;
    if (uploaded % 10 === 0 || uploaded === files.length) console.log(`Uploaded ${uploaded}/${files.length}`);
  }

  // Only map catalog rows after every storage upload succeeds.
  for (const file of files) {
    currentStage = `mapping catalog image for ${file.sku}`;
    const updateUrl = `${baseUrl}/rest/v1/product_catalog?sku=eq.${encodeURIComponent(file.sku)}&active=eq.true`;
    const response = await fetch(updateUrl, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ image_path: file.name }),
    });
    if (!response.ok) throw new Error(`Catalog mapping failed for ${file.sku} (${response.status}): ${await response.text()}`);
  }

  console.log(`Done: uploaded ${uploaded} photos and mapped their image_path values in product_catalog.`);
  console.log("Next verification: confirm 70 storage objects and 70 active catalog rows with image_path set.");
}

main().catch((error) => {
  const cause = error?.cause;
  const detail = cause?.code || error?.code;
  const detailMessage = cause?.message;
  console.error(`ERROR during ${currentStage}: ${error.message}${detail ? ` (network code: ${detail})` : ""}${detailMessage ? ` (cause: ${detailMessage})` : ""}`);
  if (detail === "ENOTFOUND") console.error("Check the Supabase project URL and DNS/internet access.");
  else if (detail === "ECONNREFUSED" || detail === "ETIMEDOUT" || detail === "ECONNRESET") console.error("Check internet access, VPN/proxy/firewall, then retry.");
  else if (detail === "CERT_HAS_EXPIRED" || detail === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") console.error("Check system clock and HTTPS inspection/proxy certificates; do not disable TLS verification.");
  process.exitCode = 1;
});

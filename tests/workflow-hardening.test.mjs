import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("production migration has balanced SQL dollar quoting and one commit", () => {
  const sql = read("supabase/migrations/0001_harden_workflow.sql");
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, (sql.match(/\$\$/g) ?? []).length / 2);
  assert.equal((sql.match(/\bCOMMIT;/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /AS \$(?:\r?\n)/);
  assert.doesNotMatch(sql, /^\s*\d+\t/m);
});

test("RLS and warehouse isolation are defined for operational data", () => {
  const sql = read("supabase/migrations/0001_harden_workflow.sql");
  for (const table of ["users","orders","order_items","scan_events","exceptions","packages","audit_events","idempotency_keys","riders","exception_evidence"]) {
    assert.match(sql, new RegExp("ALTER TABLE public\\." + table + " ENABLE ROW LEVEL SECURITY"));
  }
  assert.match(sql, /warehouse_id = public\.current_warehouse\(\)/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.users, public\.orders/);
});

test("workflow mutations are server RPCs", () => {
  const client = read("frontend/src/api/client.ts");
  for (const rpc of ["picker_start_order","picker_pick_item","picker_complete_order","packer_start_order","packer_confirm_item","packer_create_package","packer_complete_order","assign_rider","create_exception","sync_scan_event"]) {
    assert.match(client, new RegExp("rpc\\(\\\"" + rpc + "\\\""));
  }
  assert.doesNotMatch(client, /from\(["'](?:orders|order_items|scan_events|exceptions|packages)["']\)\.\s*(?:insert|update|upsert|delete)/);
});

test("offline replay handles every defined event type", () => {
  const client = read("frontend/src/api/client.ts");
  for (const eventType of ["ORDER_STARTED","LOCATION_SCANNED","SKU_SCANNED","QTY_CONFIRMED","EXCEPTION_RAISED","ORDER_COMPLETED"]) {
    assert.match(client, new RegExp("event\\.eventType === \\\"" + eventType + "\\\""));
  }
  const offline = read("frontend/src/sync/offlineApi.ts");
  assert.match(offline, /payload: \{ qty, uom, sku: line\.skuBarcode \}/);
});

test("product scan starts from a pending line and camera scans count immediately", () => {
  const domain = read("frontend/src/domain/order.ts");
  const offline = read("frontend/src/sync/offlineApi.ts");
  const screen = read("frontend/src/screens/SkuScanScreen.tsx");
  assert.match(domain, /status === "PENDING"\s*\|\| status === "LOCATION_VALIDATED"\) return "sku"/);
  assert.match(offline, /line\.status !== "PENDING" && line\.status !== "LOCATION_VALIDATED" && line\.status !== "SKU_VALIDATED"/);
  assert.match(offline, /payload: \{ scanValue: normalize\(scanValue\) \}/);
  assert.match(screen, /onScanned=\{\(value\) => \{\s*setManual\(value\);\s*void processItemBarcode\(value\);/);
  assert.match(screen, /pickerRepository\.pickQuantity\(line\.id,\s*1,\s*line\.uom,\s*newIdemKey\(\)\)/);
  assert.match(screen, /setSkuVerified\(!completed\)/);
});

test("picker and packer count quantity from individual barcode scans only", () => {
  const picker = read("frontend/src/screens/SkuScanScreen.tsx");
  const packer = read("frontend/src/screens/PackerOrderScreen.tsx");
  const scanner = read("frontend/src/scanner/BarcodeScannerModal.tsx");
  assert.ok(picker.includes("pickerRepository.pickQuantity(line.id, 1,"));
  assert.ok(picker.includes("const verified = await pickerRepository.validateSku(line.id, barcode);"));
  assert.ok(packer.includes("async function scan(value?: string): Promise<boolean>"));
  assert.ok(packer.includes("onScanned={enqueueCameraScan}"));
  assert.ok(packer.includes("continuous"));
  assert.ok(packer.includes("        1,\n      );"));
  assert.doesNotMatch(packer, /setPackQty|Decrease pack quantity|Increase pack quantity|Confirm Pack|stepperBox|stepperBtn/);
  assert.match(packer, /Scan each physical product separately/);
  assert.ok(scanner.includes("continuous?: boolean"));
  assert.ok(scanner.includes("if (!continuous)"));
  assert.ok(scanner.includes("}, 750);"));
});

test("packer and evidence routes exist", () => {
  for (const file of [
    "frontend/src/app/(tabs)/packer-dashboard.tsx",
    "frontend/src/app/pack/order/[id].tsx",
    "frontend/src/screens/PackerDashboardScreen.tsx",
    "frontend/src/screens/PackerOrderScreen.tsx",
    "frontend/src/screens/DispatchScreen.tsx",
  ]) assert.equal(fs.existsSync(path.join(root, file)), true, file);
  assert.equal(fs.existsSync(path.join(root, "frontend/src/app/(tabs)/dispatch.tsx")), false);
  const api = read("frontend/src/services/supabasePickerApi.ts");
  assert.match(api, /grantEvidenceUpload/);
});

test("legacy worker and hardcoded login credentials are gone", () => {
  const files = [
    "frontend/src/api/client.ts",
    "frontend/src/navigation/AppProvider.tsx",
    "frontend/src/screens/LoginScreen.tsx",
  ].map(read).join("\n");
  assert.doesNotMatch(files, /8788|wrangler|EXPO_PUBLIC_API_URL/);
  assert.doesNotMatch(files, /admin@example\.com|test@example\.com|password123|test1234/);
});

test("role separation is enforced by every picker/packer RPC", () => {
  const sql = read("supabase/migrations/0001_harden_workflow.sql");
  for (const rpc of ["picker_start_order","picker_pick_item","picker_complete_order"]) {
    const body = sql.slice(sql.indexOf("FUNCTION public." + rpc), sql.indexOf("END;", sql.indexOf("FUNCTION public." + rpc)) + 4);
    assert.match(body, /v_user\.role <> 'PICKER'/);
  }
  for (const rpc of ["packer_start_order","packer_pack_item","packer_create_package","packer_complete_order"]) {
    const body = sql.slice(sql.indexOf("FUNCTION public." + rpc), sql.indexOf("END;", sql.indexOf("FUNCTION public." + rpc)) + 4);
    assert.match(body, /v_user\.role <> 'PACKER'/);
  }
});

test("packing confirmation enforces packer role and item verification", () => {
  const packing = read("supabase/migrations/0007_role_separated_packing_verification.sql");
  assert.match(packing, /packer_confirm_item/);
  assert.match(packing, /v_user\.role <> 'PACKER'/);
  assert.match(packing, /Product type does not match/);
  assert.match(packing, /Product barcode does not match/);
});

test("app routes are role separated", () => {
  const layout = read("frontend/src/app/_layout.tsx");
  assert.match(layout, /picker\.role === "PICKER" && packerRoots\.has/);
  assert.match(layout, /picker\.role === "PACKER" && pickerRoots\.has/);
  assert.match(layout, /router\.replace\("\/dashboard"/);
  assert.match(layout, /router\.replace\("\/packer-dashboard"/);
});

test("picker and packer operations are warehouse scoped", () => {
  const sql = read("supabase/migrations/0001_harden_workflow.sql");
  assert.match(sql, /v_order\.warehouse_id <> v_user\.warehouse_id/);
  assert.match(sql, /warehouse_id=v_user\.warehouse_id/);
});

test("wrong SKU, over-picking and over-packing are rejected server-side", () => {
  const sql = read("supabase/migrations/0001_harden_workflow.sql");
  assert.match(sql, /SKU does not match/);
  assert.match(sql, /Picked quantity cannot exceed required quantity/);
  assert.match(sql, /Packed quantity cannot exceed picked quantity/);
});

test("wrong location is rejected by scan RPC", () => {
  const sql = read("supabase/migrations/0003_harden_scan_idempotency.sql");
  assert.match(sql, /WHEN upper\(p_scan_type\)='LOCATION' THEN v_item\.location/);
  assert.match(sql, /Scan does not match expected value/);
});

test("rider assignment rejects inactive and cross-warehouse riders", () => {
  const sql = read("supabase/migrations/0001_harden_workflow.sql");
  assert.match(sql, /warehouse_id=v_user\.warehouse_id AND active=true/);
  assert.match(sql, /Rider not found or inactive/);
});

test("offline scan event is idempotent", () => {
  const sql = read("supabase/migrations/0003_harden_scan_idempotency.sql");
  assert.match(sql, /operation='sync_scan_event'/);
  assert.match(sql, /RETURN jsonb_build_object\('ok',true,'duplicate',true\)/);
  assert.match(sql, /idempotency_keys/);
});

test("unauthenticated workflow access is rejected", () => {
  const sql = read("supabase/migrations/0001_harden_workflow.sql") + read("supabase/migrations/0003_harden_scan_idempotency.sql");
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /Authentication required/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.sync_scan_event/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public/);
});

test("test order generator uses the warehouse product catalog and barcodes", () => {
  const sql = read("supabase/migrations/0009_product_catalog_and_realistic_order_generator.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.product_catalog/);
  assert.match(sql, /product_type text NOT NULL/);
  assert.match(sql, /barcode text NOT NULL UNIQUE/);
  assert.match(sql, /100000000106/);
  assert.match(sql, /100000000131/);
  assert.match(sql, /100000000123/);
  assert.match(sql, /v_item_count := 3 \+ floor\(random\(\) \* 5\)/);
  assert.match(sql, /FROM public\.product_catalog/);
  assert.match(sql, /sku_barcode/);
  assert.match(sql, /location_barcode/);
  assert.match(sql, /product_specs/);
});

test("expanded product catalog has unique warehouse barcodes and six-line generator cap", () => {
  const sql = read("supabase/migrations/0010_expand_product_catalog_and_cap_generator.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.generate_test_order/);
  assert.match(sql, /v_item_count := 1 \+ floor\(random\(\) \* 6\)/);
  assert.match(sql, /FROM public\.product_catalog/);
  assert.match(sql, /status IN \('ASSIGNED','PICKING'\)/);
  assert.match(sql, /v_max_active_orders constant integer := 30/);
  assert.match(sql, /100000000191/);
  assert.match(sql, /100000000152/);
  assert.match(sql, /ON CONFLICT \(sku\) DO UPDATE/);
});

test("product-only picking keeps product validation and removes the location prerequisite", () => {
  const legacy = read("supabase/migrations/0005_barcode_scan_workflow.sql");
  const current = read("supabase/migrations/0014_product_only_picker_scan.sql");
  const idempotency = read("supabase/migrations/0015_picker_idempotency_result.sql");
  const timestampFix = read("supabase/migrations/0017_fix_picker_scan_timestamp_validation.sql");
  assert.match(legacy, /Location barcode must be scanned first/); // applied migration is preserved
  assert.match(current, /Product barcode does not match/);
  assert.match(current, /Product barcode must be scanned first/);
  assert.doesNotMatch(current, /Location barcode must be scanned first/);
  assert.match(current, /v_order\.warehouse_id <> v_user\.warehouse_id/);
  assert.match(current, /Picked quantity cannot exceed required quantity/);
  assert.match(current, /Re-check after acquiring the order lock/);
  assert.match(current, /pg_advisory_xact_lock/);
  assert.equal(current.split("$function$").length - 1, 2);
  assert.equal((current.match(/COMMIT;/g) ?? []).length, 1);
  assert.match(idempotency, /pg_advisory_xact_lock\(hashtextextended\(p_idempotency_key, 0\)\)/);
  assert.match(idempotency, /Idempotency key is already used by another operation/);
  assert.match(idempotency, /v_existing\.response_body::jsonb ->> 'pickedQty'/);
  assert.doesNotMatch(idempotency, /Location barcode must be scanned first/);
  assert.match(timestampFix, /upper\(trim\(se\.barcode\)\) = upper\(trim\(v_expected_barcode\)\)/);
  assert.match(timestampFix, /upper\(trim\(se\.expected_value\)\) = upper\(trim\(v_expected_barcode\)\)/);
  assert.doesNotMatch(timestampFix, /se\.created_at\s*>=\s*COALESCE/);
  assert.match(timestampFix, /GRANT EXECUTE ON FUNCTION public\.picker_pick_item/);
});

test("test order generator caps the picker backlog at 30", () => {
  const sql = read("supabase/migrations/0006_test_order_backlog_cap.sql");
  assert.match(sql, /v_max_active_orders constant integer := 30/);
  assert.match(sql, /status IN \('ASSIGNED','PICKING'\)/);
  assert.match(sql, /v_active_orders >= v_max_active_orders/);
  assert.match(sql, /PICKER_BACKLOG_LIMIT/);
  assert.match(sql, /'maxActiveOrders',v_max_active_orders/);
});

test("picker step transitions use replacement navigation and cannot strand the final line", () => {
  const sku = read("frontend/src/screens/SkuScanScreen.tsx");
  const location = read("frontend/src/screens/LocationScanScreen.tsx");
  const quantity = read("frontend/src/screens/QuantityScreen.tsx");
  const exception = read("frontend/src/screens/ExceptionScreen.tsx");

  for (const source of [sku, location, quantity, exception]) {
    assert.doesNotMatch(source, /router\.push\([^\n]*\/pick\//);
  }
  assert.doesNotMatch(sku, /awaitingNext|goNext/);
  assert.match(sku, /nextStep === "complete"/);
  assert.match(sku, /pathname: "\/pick\/\[orderId\]\/complete"/);
  assert.match(quantity, /SkuScanScreen as QuantityScreen/);
  assert.doesNotMatch(quantity, /Increment quantity|Decrement quantity|Select All/);
});

test("picker order reads reject stale in-flight responses after workflow mutations", () => {
  const api = read("frontend/src/services/supabasePickerApi.ts");
  assert.match(api, /private orderGeneration = new Map/);
  assert.match(api, /private invalidateOrder\(id: string\)/);
  assert.match(api, /const generation = this\.orderGeneration\.get\(id\) \?\? 0/);
  assert.match(api, /this\.orderGeneration\.get\(id\) \?\? 0\) !== generation/);
  assert.match(api, /this\.invalidateOrder\(orderId\);/);
});

test("all picker workflow screens derive the next step from authoritative line state", () => {
  for (const file of [
    "frontend/src/screens/LocationScanScreen.tsx",
    "frontend/src/screens/SkuScanScreen.tsx",
    "frontend/src/screens/CompletionScreen.tsx",
    "frontend/src/screens/OrderDetailScreen.tsx",
    "frontend/src/screens/ExceptionScreen.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /resolvePickStep|pickStepPath/, file);
  }
});

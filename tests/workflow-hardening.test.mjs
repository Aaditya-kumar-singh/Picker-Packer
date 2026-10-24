import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("Supabase is completely removed from frontend dependencies and config", () => {
  const pkg = JSON.parse(read("frontend/package.json"));
  const lock = JSON.parse(read("frontend/package-lock.json"));
  const app = JSON.parse(read("frontend/app.json")).expo;
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[""].version);
  assert.equal(pkg.version, app.version);
  assert.ok(app.android.blockedPermissions.includes("android.permission.RECORD_AUDIO"));
  assert.equal(pkg.dependencies["@supabase/supabase-js"], undefined);
  assert.equal(pkg.dependencies["expo-sqlite"], undefined);
  assert.equal(pkg.dependencies["react-native-url-polyfill"], undefined);
  assert.equal(pkg.dependencies["expo-image-picker"], undefined);

  const appJson = JSON.parse(read("frontend/app.json"));
  assert.ok(!appJson.expo.plugins.includes("expo-sqlite"));

  const metro = read("frontend/metro.config.js");
  assert.doesNotMatch(metro, /wasm/);

  // Local .env is intentionally gitignored and may not exist in a clean CI checkout.
  if (fs.existsSync(path.join(root, "frontend/.env"))) {
    const env = read("frontend/.env");
    assert.doesNotMatch(env, /SUPABASE/);
    assert.match(env, /EXPO_PUBLIC_API_BASE_URL/);
  }

  const envExample = read("frontend/.env.example");
  assert.doesNotMatch(envExample, /SUPABASE/);
  assert.match(envExample, /EXPO_PUBLIC_API_BASE_URL/);
  assert.match(envExample, /EXPO_PUBLIC_API_ENV=test/);

  assert.equal(fs.existsSync(path.join(root, "frontend/eas.json")), false);
  assert.equal(app.extra?.eas?.projectId, undefined);

  const scripts = pkg.scripts;
  assert.match(scripts["android:codespace"], /build-android-codespace/);
  assert.match(scripts["setup:codespace-signing"], /setup-codespace-signing/);
  assert.match(scripts.ship, /ship-codespace/);

  const devcontainer = JSON.parse(read(".devcontainer/devcontainer.json"));
  assert.ok(devcontainer.features["ghcr.io/devcontainers/features/java:1"]);
  assert.ok(devcontainer.features["ghcr.io/nordcominc/devcontainer-features/android-sdk:1.2.0"]);

  const releaseWorkflow = read(".github/workflows/android-release.yml");
  assert.match(releaseWorkflow, /CODESPACES_TOKEN/);
  assert.match(releaseWorkflow, /gh codespace create/);
  assert.match(releaseWorkflow, /gh codespace ssh/);
  assert.match(releaseWorkflow, /npm run ship/);
  assert.match(releaseWorkflow, /TEST-BACKEND APK Release/);

  const buildScript = read("frontend/scripts/build-android-codespace.mjs");
  assert.match(buildScript, /EXPO_PUBLIC_API_ENV = 'test'/);
  assert.match(buildScript, /EXPO_PUBLIC_API_BASE_URL = 'https:\/\/test\.yourbuildmart\.com\/api\/'/);
  assert.match(buildScript, /YBM-Picker-Packer-TEST-BACKEND-/);
  assert.match(buildScript, /apiEnvironment: 'test'/);

  const shipScript = read("frontend/scripts/ship-codespace.mjs");
  assert.match(shipScript, /YBM-Picker-Packer-TEST-BACKEND-/);
  assert.match(shipScript, /must not be used for production warehouse operations/);
  assert.match(shipScript, /android-test-v\$\{metadata\.version\}/);
  assert.doesNotMatch(releaseWorkflow, /EXPO_TOKEN|eas-cli|EAS Build/i);

  const readme = read("frontend/README.md");
  assert.match(readme, /test backend/i);
  assert.match(readme, /production/i);
});

test("no legacy Supabase files remain in the project tree", () => {
  const deletedFiles = [
    "frontend/src/api/supabase.ts",
    "frontend/src/services/supabasePickerApi.ts",
    "frontend/src/services/pickerApi.ts",
    "frontend/src/repositories/pickerRepository.ts",
    "frontend/src/screens/LocationScanScreen.tsx",
    "frontend/src/app/pick/[orderId]/location.tsx",
    "frontend/src/app/pick/[orderId]/quantity.tsx",
    "frontend/src/screens/QuantityScreen.tsx",
    "frontend/src/screens/ExceptionScreen.tsx",
    "frontend/src/app/pick/[orderId]/exception.tsx",
    "frontend/src/components/ExceptionForm.tsx",
    "frontend/src/scanner/ScannerInput.tsx",
    "frontend/src/scanner/parser.ts",
    "frontend/src/storage",
    "frontend/src/sync",
    "frontend/src/components/SyncBadge.tsx",
    "Supabase_Schema.sql",
    "supabase",
    "scripts/fetch_product_images.py",
    "scripts/upload_product_images.mjs",
    "product-images",
    "docs/PICKER_FLOW_UPDATE_REPORT.md"
  ];

  for (const file of deletedFiles) {
    assert.equal(fs.existsSync(path.join(root, file)), false, `File ${file} should have been deleted`);
  }
});

test("frontend source code contains zero references to Supabase", () => {
  function checkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        checkDir(fullPath);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        const content = fs.readFileSync(fullPath, "utf8");
        assert.doesNotMatch(content, /@supabase\/supabase-js/, `Found @supabase import in ${fullPath}`);
        assert.doesNotMatch(content, /supabase\.rpc\(/, `Found supabase.rpc call in ${fullPath}`);
        assert.doesNotMatch(content, /from\(["']orders["']\)/, `Found supabase table query in ${fullPath}`);
      }
    }
  }
  checkDir(path.join(root, "frontend/src"));
});

test("REST API client layers implement required endpoints and envelope unwrapping", () => {
  const httpSource = read("frontend/src/api/http.ts");
  assert.match(httpSource, /EXPO_PUBLIC_API_BASE_URL/);
  assert.match(httpSource, /Bearer \$\{token\}/);
  assert.match(httpSource, /auth_token|TOKEN_KEY/);
  assert.match(httpSource, /onUnauthorized/);
  assert.doesNotMatch(httpSource, /DEFAULT_API_BASE_URL/);
  assert.match(httpSource, /TEST_API_HOSTS/);
  assert.match(httpSource, /EXPO_PUBLIC_API_ENV/);
  assert.match(httpSource, /isProductionBuild && apiEnvironment !== "production"/);
  assert.match(httpSource, /apiEnvironment === "production" && isTestHost/);
  assert.match(httpSource, /isProductionBuild/);
  assert.match(httpSource, /EXPO_PUBLIC_API_RELEASE_CHANNEL === "test"/);
  assert.match(httpSource, /API_CONFIGURATION_ERROR/);
  assert.match(httpSource, /if \(!API_BASE_URL\) return null/);
  assert.doesNotMatch(httpSource, /"https:\/\/test\.yourbuildmart\.com"\s*;/);
  assert.match(httpSource, /One-time migration for tokens saved by older builds/);
  assert.match(httpSource, /Could not save the session securely/);
  assert.match(httpSource, /Secure session storage is unavailable/);
  assert.doesNotMatch(httpSource, /fallback to AsyncStorage/);

  const authSource = read("frontend/src/api/authApi.ts");
  assert.match(authSource, /\/api\/auth\/login/);
  assert.match(authSource, /\/api\/auth\/otp\/request/);
  assert.match(authSource, /unsupported staff role/);
  assert.match(authSource, /did not contain a recognized PICKER or PACKER role/);
  assert.doesNotMatch(authSource, /Default fallback if unknown/);

  const pickerSource = read("frontend/src/api/pickerAppApi.ts");
  assert.match(pickerSource, /\/api\/picker-app\/stats/);
  assert.match(pickerSource, /\/api\/picker-app\/orders\/assigned/);
  assert.match(pickerSource, /\/api\/picker-app\/orders\/history\?\$\{query\}/);
  assert.match(pickerSource, /\/api\/picker-app\/orders\/history\/count/);
  assert.match(pickerSource, /\/api\/picker-app\/profile\/status/);
  assert.doesNotMatch(pickerSource, /\/api\/picker-app\/orders\/completed/);
  assert.doesNotMatch(pickerSource, /sessionCompletedOrders|getSessionCompletedOrders/);
  assert.match(pickerSource, /\/api\/picker-app\/orders\/\$\{orderId\}\/items/);
  assert.match(pickerSource, /\/api\/picker-app\/orders\/\$\{orderId\}\/scan/);
  assert.match(pickerSource, /\/api\/picker-app\/available-packers/);
  assert.match(pickerSource, /\/api\/picker-app\/orders\/\$\{orderId\}\/assign-packer/);
  assert.match(pickerSource, /\/api\/picker-app\/profile/);
  assert.match(pickerSource, /\/api\/picker-app\/change-password/);

  const packerSource = read("frontend/src/api/packerAppApi.ts");
  assert.match(packerSource, /\/api\/packer-app\/stats/);
  assert.match(packerSource, /\/api\/packer-app\/orders\/assigned/);
  assert.match(packerSource, /\/api\/packer-app\/orders\/\$\{orderId\}/);
  assert.match(packerSource, /\/api\/packer-app\/orders\/\$\{orderId\}\/scan/);
  assert.match(packerSource, /\/api\/packer-app\/riders\/available/);
  assert.match(packerSource, /\/api\/packer-app\/orders\/\$\{orderId\}\/assign-rider/);
  assert.match(packerSource, /\/api\/packer-app\/profile/);
  assert.match(packerSource, /\/api\/packer-app\/change-password/);
  assert.match(packerSource, /\/api\/packer-app\/orders\/history\?\$\{query\}/);
  assert.match(packerSource, /\/api\/packer-app\/orders\/history\/count/);
  assert.match(packerSource, /\/api\/packer-app\/profile\/status/);

  const facade = read("frontend/src/api/client.ts");
  assert.match(facade, /pickerAppApi/);
  assert.match(packerSource, /packerAppApi/);
  assert.match(facade, /authApi/);
});

test("domain rules operate on REST DTO contracts", () => {
  const domain = read("frontend/src/domain/order.ts");
  assert.match(domain, /nextPendingLine/);
  assert.match(domain, /isOrderFullyPicked/);
  assert.match(domain, /isOrderFullyPacked/);
  assert.match(domain, /resolvePickStep/);
  assert.match(domain, /formatItemLocation/);
});

test("picker order completion is handled via assign-packer step", () => {
  const completionScreen = read("frontend/src/screens/CompletionScreen.tsx");
  assert.match(completionScreen, /getAvailablePackers/);
  assert.match(completionScreen, /assignPacker/);
});

test("security and workflow guards prevent unsafe fallbacks", () => {
  const authSource = read("frontend/src/api/authApi.ts");
  const loginScreen = read("frontend/src/screens/LoginScreen.tsx");
  const otpScreen = read("frontend/src/screens/OtpScreen.tsx");
  assert.doesNotMatch(authSource, /developmentOtp/);
  assert.doesNotMatch(loginScreen, /developmentOtp/);
  assert.doesNotMatch(otpScreen, /developmentOtp|Development OTP/);
  const provider = read("frontend/src/navigation/AppProvider.tsx");
  assert.doesNotMatch(provider, /warehouseId: \(profile as any\)\.warehouseId \?\? 3/);
  assert.doesNotMatch(provider, /warehouseName: profile\.address/);
  const orderDetail = read("frontend/src/screens/OrderDetailScreen.tsx");
  const skuScan = read("frontend/src/screens/SkuScanScreen.tsx");
  assert.doesNotMatch(orderDetail, /SO-\$\{numOrderId\}|warehouseId: 3/);
  assert.doesNotMatch(skuScan, /SO-\$\{numOrderId\}|warehouseId: 3/);
  const completion = read("frontend/src/screens/CompletionScreen.tsx");
  assert.match(completion, /isOrderFullyPicked/);
  assert.match(completion, /A valid assigned order is required/);
  const notifications = read("frontend/src/context/NotificationContext.tsx");
  assert.match(notifications, /AppState\.addEventListener/);
});

test("packer order dispatch is handled via assign-rider step", () => {
  const dispatchScreen = read("frontend/src/screens/DispatchScreen.tsx");
  assert.match(dispatchScreen, /getAvailableRiders/);
  assert.match(dispatchScreen, /assignRider/);

  const packerOrderScreen = read("frontend/src/screens/PackerOrderScreen.tsx");
  assert.match(packerOrderScreen, /assignRider/);

  const historyScreen = read("frontend/src/screens/HistoryScreen.tsx");
  assert.match(historyScreen, /getHistoryOrderCount/);
  assert.match(historyScreen, /getHistory\(pageNumber, PAGE_SIZE\)/);
  assert.match(historyScreen, /new Map<number, FulfillmentHistoryDto\[\]>/);
  assert.doesNotMatch(historyScreen, /getAssignedOrders|getSessionDispatchedOrders/);
  const packerApi = read("frontend/src/api/packerAppApi.ts");
  assert.doesNotMatch(packerApi, /sessionDispatchedOrders|getSessionDispatchedOrders/);
});


test("warehouse identity and assignment boundaries fail closed", () => {
  const profileTypes = read("frontend/src/types/index.ts");
  assert.match(profileTypes, /warehouseId\?: number \| string \| null/);
  assert.match(profileTypes, /warehouseName\?: string \| null/);

  const warehouse = read("frontend/src/utils/warehouse.ts");
  assert.match(warehouse, /WH-ID unavailable/);
  assert.match(warehouse, /export function isSameWarehouse/);
  assert.match(warehouse, /leftId === rightId/);

  const provider = read("frontend/src/navigation/AppProvider.tsx");
  assert.match(provider, /warehouseId: profile\.warehouseId/);
  assert.match(provider, /warehouseName: profile\.warehouseName/);

  const completion = read("frontend/src/screens/CompletionScreen.tsx");
  assert.match(completion, /validOrder\.warehouseId/);
  assert.match(completion, /isSameWarehouse\(packer\.warehouseId, orderWithItems\.warehouseId\)/);

  const dispatch = read("frontend/src/screens/DispatchScreen.tsx");
  assert.match(dispatch, /isSameWarehouse\(r\.warehouseId, o\.warehouseId\)/);

  const packerApi = read("frontend/src/api/packerAppApi.ts");
  assert.match(packerApi, /cachedAssignedOrders = cachedAssignedOrders\.filter\(\(order\) => order\.orderId !== orderId\)/);
  assert.doesNotMatch(packerApi, /order\.orderStatus = "RIDER_ASSIGNED"/);
});

test("OTP request UI state never copies a server-provided OTP or response message", () => {
  const auth = read("frontend/src/api/authApi.ts");
  assert.match(auth, /message: "Verification code requested\."/);
  assert.doesNotMatch(auth, /res\?\.message/);
  assert.doesNotMatch(auth, /developmentOtp/);
});

test("CI runs automatically only for master changes", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /push:\s+branches: \[master\]/);
  assert.match(ci, /pull_request:\s+branches: \[master\]/);
  assert.doesNotMatch(ci, /branches: \[master, aadi\]/);
});

// Integration tests require the optional standalone reference backend.
test("reference REST backend integration and contract validation", async (t) => {
  const backendPath = path.join(root, "backend", "server.js");
  if (!fs.existsSync(backendPath)) {
    t.skip("Reference backend is not present in this repository; live API integration must be tested against the separately deployed REST API.");
    return;
  }
  const server = (await import("../backend/server.js")).default || (await import("../backend/server.js"));
  
  await new Promise((resolve) => {
    server.listen(0, resolve);
  });
  
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  async function request(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await res.json();
    return { status: res.status, ok: res.ok, data };
  }

  try {
    // Development-only reference credentials and fixed OTP must be disabled in production mode.
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const productionLoginRes = await request("/api/auth/login", {
        method: "POST", body: JSON.stringify({ identifier: "9876543210", password: "password123" })
      });
      assert.equal(productionLoginRes.status, 503);
      assert.equal(productionLoginRes.data.error, "AUTH_PROVIDER_NOT_CONFIGURED");
      const productionOtpRes = await request("/api/auth/otp/request", {
        method: "POST", body: JSON.stringify({ identifier: "9876543210" })
      });
      assert.equal(productionOtpRes.status, 503);
      assert.equal(productionOtpRes.data.error, "OTP_PROVIDER_NOT_CONFIGURED");
      assert.equal(productionOtpRes.data.data, undefined);
      const productionMockTokenRes = await request("/api/picker-app/stats", {
        headers: { Authorization: "Bearer mock-jwt-token-1-picker" }
      });
      assert.equal(productionMockTokenRes.status, 401);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }

    // 1. Invalid credentials must never create a session.
    const invalidLoginRes = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "9876543210", password: "incorrect" })
    });
    assert.equal(invalidLoginRes.status, 401);

    // 2. Auth login
    const loginRes = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "9876543210", password: "password123" })
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.data.success, true);
    assert.equal(loginRes.data.data.user.role, "PICKER");
    const token = loginRes.data.data.token;
    assert.ok(token);

    const otpRequestRes = await request("/api/auth/otp/request", {
      method: "POST", body: JSON.stringify({ identifier: "9876543210" })
    });
    assert.equal(otpRequestRes.status, 200);
    assert.equal(otpRequestRes.data.data.developmentOtp, "123456");
    const otpLoginRes = await request("/api/auth/login", {
      method: "POST", body: JSON.stringify({ identifier: "9876543210", otp: "123456", loginMethod: "OTP" })
    });
    assert.equal(otpLoginRes.status, 200);

    const authHeaders = { Authorization: `Bearer ${token}` };
    const invalidTokenRes = await request("/api/picker-app/stats", { headers: { Authorization: "Bearer invalid-token" } });
    assert.equal(invalidTokenRes.status, 401);

    // 2. Picker Stats
    const statsRes = await request("/api/picker-app/stats", { headers: authHeaders });
    assert.equal(statsRes.status, 200);
    assert.equal(statsRes.data.success, true);
    assert.ok(typeof statsRes.data.data.assignedOrdersCount === "number");

    // 3. Assigned Orders
    const assignedRes = await request("/api/picker-app/orders/assigned", { headers: authHeaders });
    assert.equal(assignedRes.status, 200);
    assert.ok(Array.isArray(assignedRes.data.data));
    assert.ok(assignedRes.data.data.length > 0);
    const order = assignedRes.data.data[0];
    const orderId = order.orderId;

    // 4. Order Items
    const itemsRes = await request(`/api/picker-app/orders/${orderId}/items`, { headers: authHeaders });
    assert.equal(itemsRes.status, 200);
    assert.ok(Array.isArray(itemsRes.data.data));
    const targetItem = itemsRes.data.data[0];

    // 5. Soft Failure on wrong barcode (HTTP 400 with success: false)
    const wrongScanRes = await request(`/api/picker-app/orders/${orderId}/scan`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ barcode: "WRONG-BARCODE-999" })
    });
    assert.equal(wrongScanRes.status, 400);
    assert.equal(wrongScanRes.data.success, false);
    assert.match(wrongScanRes.data.message, /does not belong to this order/);
    assert.equal(wrongScanRes.data.data.barcode, "WRONG-BARCODE-999");

    // 6. Successful Item Scan
    const validScanRes = await request(`/api/picker-app/orders/${orderId}/scan`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ barcode: targetItem.barcode })
    });
    assert.equal(validScanRes.status, 200);
    assert.equal(validScanRes.data.success, true);
    assert.equal(validScanRes.data.data.barcode, targetItem.barcode);
    assert.equal(validScanRes.data.data.scannedQty, targetItem.pickedQty + 1);

    // 7. Invalid scan and premature assignment must not change workflow state.
    const emptyScanRes = await request(`/api/picker-app/orders/${orderId}/scan`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({ barcode: "   " })
    });
    assert.equal(emptyScanRes.status, 400);
    assert.match(emptyScanRes.data.message, /Empty barcode/);

    const packersRes = await request("/api/picker-app/available-packers", { headers: authHeaders });
    assert.equal(packersRes.status, 200);
    assert.ok(Array.isArray(packersRes.data.data));
    assert.ok(packersRes.data.data.length > 0);
    const selectedPacker = packersRes.data.data[0];

    const prematureAssignRes = await request(`/api/picker-app/orders/${orderId}/assign-packer`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({ packerId: selectedPacker.id })
    });
    assert.equal(prematureAssignRes.status, 400);
    assert.match(prematureAssignRes.data.message, /Not all items have been picked/);

    // Finish picking every ordered unit before assigning the packer.
    const secondUnitRes = await request(`/api/picker-app/orders/${orderId}/scan`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({ barcode: targetItem.barcode })
    });
    assert.equal(secondUnitRes.status, 200);
    assert.equal(secondUnitRes.data.data.scannedQty, 2);
    const otherItem = itemsRes.data.data[1];
    const finalPickRes = await request(`/api/picker-app/orders/${orderId}/scan`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({ barcode: otherItem.barcode })
    });
    assert.equal(finalPickRes.status, 200);
    assert.equal(finalPickRes.data.data.orderFullyPicked, true);

    const duplicatePickRes = await request(`/api/picker-app/orders/${orderId}/scan`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({ barcode: targetItem.barcode })
    });
    assert.equal(duplicatePickRes.status, 400);
    assert.match(duplicatePickRes.data.message, /already fully scanned/i);

    // 8. Assign Packer only after every item is fully picked.
    const assignPackerRes = await request(`/api/picker-app/orders/${orderId}/assign-packer`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({ packerId: selectedPacker.id })
    });
    assert.equal(assignPackerRes.status, 200);
    assert.equal(assignPackerRes.data.data, "Packer assigned");

    // Completed picking work is server-authoritative, scoped to the authenticated picker.
    const completedPickerOrdersRes = await request("/api/picker-app/orders/completed", { headers: authHeaders });
    assert.equal(completedPickerOrdersRes.status, 200);
    assert.ok(completedPickerOrdersRes.data.data.some(o => o.orderId === orderId && o.orderStatus === "PACKING"));
    // 9. Packer Flow: Login as Packer.
    const packerLoginRes = await request("/api/auth/login", {
      method: "POST", body: JSON.stringify({ identifier: "9876543211", password: "password123" })
    });
    assert.equal(packerLoginRes.status, 200);
    assert.equal(packerLoginRes.data.data.user.role, "PACKER");
    const packerHeaders = { Authorization: `Bearer ${packerLoginRes.data.data.token}` };
    const completedAsPackerRes = await request("/api/picker-app/orders/completed", { headers: packerHeaders });
    assert.equal(completedAsPackerRes.status, 400);

    const packerStatsRes = await request("/api/packer-app/stats", { headers: packerHeaders });
    assert.equal(packerStatsRes.status, 200);
    assert.deepEqual(Object.keys(packerStatsRes.data.data).sort(), ["assignedOrders", "completedOrders", "todayItemsScanned", "todayOrdersPacked"].sort());
    const packerAssignedRes = await request("/api/packer-app/orders/assigned", { headers: packerHeaders });
    assert.equal(packerAssignedRes.status, 200);
    assert.ok(packerAssignedRes.data.data.some(o => o.orderId === orderId));
    const rawItemsRes = await request(`/api/packer-app/orders/${orderId}/items`, { headers: packerHeaders });
    assert.equal(rawItemsRes.status, 200);
    assert.ok(Array.isArray(rawItemsRes.data.data));
    assert.equal(rawItemsRes.data.data[0].salesOrderId, orderId);
    assert.ok("unitPrice" in rawItemsRes.data.data[0]);

    // Rider assignment before packing must be rejected.
    const prematureRiderRes = await request(`/api/packer-app/orders/${orderId}/assign-rider`, {
      method: "POST", headers: packerHeaders, body: JSON.stringify({ riderId: 5 })
    });
    assert.equal(prematureRiderRes.status, 400);
    assert.match(prematureRiderRes.data.message, /fully packed/i);

    // Pack each picked unit. The final scan alone transitions the order to PACKED.
    let finalPackScanRes;
    for (const [barcode, count] of [[targetItem.barcode, 2], [otherItem.barcode, 1]]) {
      for (let i = 0; i < count; i += 1) {
        finalPackScanRes = await request(`/api/packer-app/orders/${orderId}/scan`, {
          method: "POST", headers: packerHeaders, body: JSON.stringify({ barcode })
        });
        assert.equal(finalPackScanRes.status, 200, finalPackScanRes.data.message);
      }
    }
    assert.equal(finalPackScanRes.data.data.totalItemsScanned, 2);
    assert.equal(finalPackScanRes.data.data.orderFullyPacked, true);
    assert.ok(finalPackScanRes.data.data.items.every(i => i.fullyScanned === (i.packedQty >= i.orderedQty)));
    const packedOrderRes = await request(`/api/packer-app/orders/${orderId}`, { headers: packerHeaders });
    assert.equal(packedOrderRes.data.data.orderStatus, "PACKED");
    const assignedWithPackedRes = await request("/api/packer-app/orders/assigned", { headers: packerHeaders });
    assert.ok(assignedWithPackedRes.data.data.some(o => o.orderId === orderId && o.orderStatus === "PACKED"));

    const duplicatePackRes = await request(`/api/packer-app/orders/${orderId}/scan`, {
      method: "POST", headers: packerHeaders, body: JSON.stringify({ barcode: targetItem.barcode })
    });
    assert.equal(duplicatePackRes.status, 400);
    assert.match(duplicatePackRes.data.message, /not in packing status|already fully packed/i);

    const ridersRes = await request("/api/packer-app/riders/available", { headers: packerHeaders });
    assert.equal(ridersRes.status, 200);
    assert.ok(Array.isArray(ridersRes.data.data));
    const selectedRider = ridersRes.data.data[0];
    assert.equal(typeof selectedRider.vehicleType, "string");
    assert.equal(typeof selectedRider.loginEnabled, "boolean");
    assert.equal(typeof selectedRider.warehouseId, "number");

    const missingRiderRes = await request(`/api/packer-app/orders/${orderId}/assign-rider`, {
      method: "POST", headers: packerHeaders, body: JSON.stringify({})
    });
    assert.equal(missingRiderRes.status, 400);
    assert.match(missingRiderRes.data.message, /Rider ID is required/);

    const assignRiderRes = await request(`/api/packer-app/orders/${orderId}/assign-rider`, {
      method: "POST", headers: packerHeaders, body: JSON.stringify({ riderId: selectedRider.id })
    });
    assert.equal(assignRiderRes.status, 200);
    assert.equal(assignRiderRes.data.data, "Rider assigned");

    // Dispatched orders remain visible from the server after refreshing the list.
    const refreshedAssignedRes = await request("/api/packer-app/orders/assigned", { headers: packerHeaders });
    assert.equal(refreshedAssignedRes.status, 200);
    const persistedDispatchedOrder = refreshedAssignedRes.data.data.find(o => o.orderId === orderId);
    assert.ok(persistedDispatchedOrder);
    assert.equal(persistedDispatchedOrder.orderStatus, "RIDER_ASSIGNED");

    // 13. Profile fetch and update
    const profileRes = await request("/api/picker-app/profile", { headers: authHeaders });
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.data.data.staffId, 1);

    const updateProfileRes = await request("/api/picker-app/profile", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ name: "Ravi Kumar Updated" })
    });
    assert.equal(updateProfileRes.status, 200);
    assert.equal(updateProfileRes.data.data.name, "Ravi Kumar Updated");

    // 14. Invalid password changes must be rejected without changing the stored password.
    const wrongPasswordRes = await request("/api/picker-app/change-password", {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ currentPassword: "incorrect", newPassword: "newpassword456" })
    });
    assert.equal(wrongPasswordRes.status, 400);
    assert.equal(wrongPasswordRes.data.message, "Current password is incorrect");
    const invalidNewPasswordRes = await request("/api/picker-app/change-password", {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ currentPassword: "password123", newPassword: "123" })
    });
    assert.equal(invalidNewPasswordRes.status, 400);
    assert.equal(invalidNewPasswordRes.data.error, "VALIDATION_ERROR");

    const changePassRes = await request("/api/picker-app/change-password", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ currentPassword: "password123", newPassword: "newpassword456" })
    });
    assert.equal(changePassRes.status, 200);
    assert.equal(changePassRes.data.success, true);

  } finally {
    server.close();
  }
});

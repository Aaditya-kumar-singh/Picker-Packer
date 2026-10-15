import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("Supabase is completely removed from frontend dependencies and config", () => {
  const pkg = JSON.parse(read("frontend/package.json"));
  assert.equal(pkg.dependencies["@supabase/supabase-js"], undefined);
  assert.equal(pkg.dependencies["expo-sqlite"], undefined);
  assert.equal(pkg.dependencies["react-native-url-polyfill"], undefined);
  assert.equal(pkg.dependencies["expo-image-picker"], undefined);

  const appJson = JSON.parse(read("frontend/app.json"));
  assert.ok(!appJson.expo.plugins.includes("expo-sqlite"));

  const metro = read("frontend/metro.config.js");
  assert.doesNotMatch(metro, /wasm/);

  const env = read("frontend/.env");
  assert.doesNotMatch(env, /SUPABASE/);
  assert.match(env, /EXPO_PUBLIC_API_BASE_URL/);

  const envExample = read("frontend/.env.example");
  assert.doesNotMatch(envExample, /SUPABASE/);
  assert.match(envExample, /EXPO_PUBLIC_API_BASE_URL/);

  const eas = JSON.parse(read("frontend/eas.json"));
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_API_BASE_URL, "https://test.yourbuildmart.com/api/");
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

  const authSource = read("frontend/src/api/authApi.ts");
  assert.match(authSource, /\/api\/auth\/login/);
  assert.match(authSource, /\/api\/auth\/otp\/request/);

  const pickerSource = read("frontend/src/api/pickerAppApi.ts");
  assert.match(pickerSource, /\/api\/picker-app\/stats/);
  assert.match(pickerSource, /\/api\/picker-app\/orders\/assigned/);
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

test("packer order dispatch is handled via assign-rider step", () => {
  const dispatchScreen = read("frontend/src/screens/DispatchScreen.tsx");
  assert.match(dispatchScreen, /getAvailableRiders/);
  assert.match(dispatchScreen, /assignRider/);

  const packerOrderScreen = read("frontend/src/screens/PackerOrderScreen.tsx");
  assert.match(packerOrderScreen, /assignRider/);
});

// Integration tests with standalone reference backend
test("reference REST backend integration and contract validation", async () => {
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
    // 1. Auth login
    const loginRes = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "9876543210", password: "password123" })
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.data.success, true);
    assert.equal(loginRes.data.data.user.role, "PICKER");
    const token = loginRes.data.data.token;
    assert.ok(token);

    const authHeaders = { Authorization: `Bearer ${token}` };

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

    // 7. Available Packers
    const packersRes = await request("/api/picker-app/available-packers", { headers: authHeaders });
    assert.equal(packersRes.status, 200);
    assert.ok(Array.isArray(packersRes.data.data));
    assert.ok(packersRes.data.data.length > 0);
    const selectedPacker = packersRes.data.data[0];

    // 8. Assign Packer
    const assignPackerRes = await request(`/api/picker-app/orders/${orderId}/assign-packer`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ packerId: selectedPacker.id })
    });
    assert.equal(assignPackerRes.status, 200);
    assert.equal(assignPackerRes.data.success, true);
    assert.equal(assignPackerRes.data.data, "Packer assigned");

    // 9. Packer Flow: Login as Packer
    const packerLoginRes = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "9876543211", password: "password123" })
    });
    assert.equal(packerLoginRes.status, 200);
    assert.equal(packerLoginRes.data.data.user.role, "PACKER");
    const packerToken = packerLoginRes.data.data.token;
    const packerHeaders = { Authorization: `Bearer ${packerToken}` };

    // 10. Packer Stats & Assigned Orders
    const packerStatsRes = await request("/api/packer-app/stats", { headers: packerHeaders });
    assert.equal(packerStatsRes.status, 200);

    const packerAssignedRes = await request("/api/packer-app/orders/assigned", { headers: packerHeaders });
    assert.equal(packerAssignedRes.status, 200);

    // 11. Available Riders
    const ridersRes = await request("/api/packer-app/riders/available", { headers: packerHeaders });
    assert.equal(ridersRes.status, 200);
    assert.ok(Array.isArray(ridersRes.data.data));
    const selectedRider = ridersRes.data.data[0];

    // 12. Assign Rider (Dispatch)
    const assignRiderRes = await request(`/api/packer-app/orders/${orderId}/assign-rider`, {
      method: "POST",
      headers: packerHeaders,
      body: JSON.stringify({ riderId: selectedRider.id })
    });
    assert.equal(assignRiderRes.status, 200);
    assert.equal(assignRiderRes.data.success, true);
    assert.equal(assignRiderRes.data.data, "Rider assigned");

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

    // 14. Change Password
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

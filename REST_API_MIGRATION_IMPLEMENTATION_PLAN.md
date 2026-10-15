# YBM Picker & Packer — Complete Supabase Removal & REST API Migration Plan

**Target Contracts:** `picker-app-api.md` (`/api/picker-app`) & `packer-app-api.md` (`/api/packer-app`)  
**Goal:** Completely remove the Supabase backend (`@supabase/supabase-js`, PostgreSQL RPCs, Supabase Auth, Supabase Storage, and SQLite outbox) and run the mobile/web app exclusively against the REST endpoints defined in `picker-app-api.md` and `packer-app-api.md`.

---

## 1. What Is NOT Given in `picker-app-api.md` & `packer-app-api.md` (Gaps & Missing Specifications)

Before changing code, every omission or ambiguity in the two Markdown API guides must be accounted for so the app does not break on edge cases or missing fields.

### 1.1 Authentication Endpoints (`/api/auth/*`) Are Referenced but Not Specified
Both `.md` files state in their intro:
> **Auth:** `Authorization: Bearer <JWT>` — role `ROLE_PICKER` / `ROLE_PACKER`. Token from `POST /api/auth/login` (`{ "identifier", "password", "loginMethod": "PASSWORD" }`) or the OTP flow (`POST /api/auth/otp/request` → login with `loginMethod: "OTP"`, `otp`).

**What is NOT given in the `.md` files:**
| Missing Item | Details Not Provided in `.md` | Planned Fallback / Handling in App |
|---|---|---|
| **Login Response Envelope & Token Path** | Whether `POST /api/auth/login` wraps the token in `{ success, message, data: { token, role, ... } }` or returns `{ token, accessToken, user, roles }` at the top level. | Parser will accept `data?.token ?? data?.accessToken ?? body?.token ?? body?.accessToken` and extract role from `data?.role ?? data?.user?.role ?? JWT payload claims (role / authorities)`. |
| **OTP Request Payload & Response** | Exact field name for `POST /api/auth/otp/request` (`{ identifier }` vs `{ phone }` vs `{ mobile }`) and response shape (`expiresIn`, `masked`). | Send `{ identifier, phone: identifier, mobile: identifier }` (or configure key in `authApi.ts`) and handle any standard `{ success, message, data }` envelope. |
| **Token Refresh & Logout Endpoints** | No `POST /api/auth/refresh` or `POST /api/auth/logout` endpoint is documented. | Store JWT in `expo-secure-store` (native) / `AsyncStorage` (web). On any `401 UNAUTHORIZED` response, clear local token/session and route to `/login`. |
| **Base Server URL** | Only relative paths (`/api/picker-app`, `/api/packer-app`, `/api/auth`) are given; no host/port is specified. | Read `EXPO_PUBLIC_API_BASE_URL` from `frontend/.env` (strip trailing `/`). |

### 1.2 No Product Barcode Field Separate from `sku` on `FulfillmentOrderItemDto`
* **What is in the `.md` files:**
  * `FulfillmentOrderItemDto` (§1.2) has `"sku": "TSH-M-NVY"` with note `"Scan/verify against this"`, and **no `barcode` or `skuBarcode` field**.
  * However, `POST /orders/{id}/scan` (§1.3 & §2.2/2.3) shows `"barcode": "8901234567890"` (an EAN-13 barcode) and soft-failures like `"Barcode not found. Please register this barcode first."` and `"This barcode is not a product barcode."`
* **Why this matters:**
  * The server resolves physical EAN/UPC barcodes (`8901234567890`) to product variants (`TSH-M-NVY`) internally.
  * Because `FulfillmentOrderItemDto` only gives the client `sku` (not the registered EAN barcode), **the client must NOT block a scan locally when the scanned string differs from `item.sku`**. Instead, the app must send every scanned value directly to `POST /api/{picker|packer}-app/orders/{id}/scan` and let the backend validate it.

### 1.3 No Product Image URLs on Order Items (`FulfillmentOrderItemDto`)
* **What is NOT given:** Neither `picker-app-api.md` nor `packer-app-api.md` includes `productImageUrl`, `imagePath`, or `thumbnailUrl` on `FulfillmentOrderItemDto` or `RawItem`.
* **What is given for staff photos:** `PackerStaff` and `Profile` have `photoFilePath: "staff/ravi.jpg"`, which is a relative path without a documented CDN/static base URL.
* **Handling in App:**
  * Remove the Supabase `product_catalog` lookup and `product-images` bucket dependency.
  * Render clean category/cube iconography on item cards when no image URL is present, and resolve `photoFilePath` against `EXPO_PUBLIC_API_BASE_URL` if non-null.

### 1.4 No Single-Order Endpoint (`GET /orders/{id}`) for Picker
* **What is NOT given:** `packer-app-api.md` provides `GET /api/packer-app/orders/{id}` (§2.2) to fetch a single order plus `GET /api/packer-app/orders/{id}/items` (§2.5). `picker-app-api.md` only provides `GET /api/picker-app/orders/assigned` (§2.1) and `GET /api/picker-app/orders/{id}/items` (§2.4) — there is **no** `GET /api/picker-app/orders/{id}`.
* **Handling in App:**
  * `pickerAppApi` will cache the `FulfillmentOrderDto` objects returned by `GET /api/picker-app/orders/assigned` in memory/local storage and merge fresh line items from `GET /api/picker-app/orders/{id}/items` and `POST /api/picker-app/orders/{id}/scan`.

### 1.5 Always-Null Order Fields & Missing Priority / SLA Fields
* **Explicitly always `null` in §1.1 of both `.md` files:**
  * `warehouseName`, `customerName`, `customerPhone`, `shippingAddress`, `fulfillmentStaffId`, `fulfillmentStaffName`, `fulfillmentStartedAt`, `fulfillmentCompletedAt` are declared on `FulfillmentOrderDto` with the warning: **"Declared but always `null` today — do not render"**.
* **Completely absent from `FulfillmentOrderDto`:**
  * `priority` (`URGENT` / `HIGH` / `NORMAL`) and `slaMinutes` / `slaDueAt` (which existed in Supabase `orders`) do **not** exist in the REST DTO.
  * Instead, `FulfillmentOrderDto` provides `orderDate` (`ISO-8601`), `grandTotal` (`number`), `paymentMethod` (`"COD"`, `"PREPAID"`), `warehouseId` (`number`), `totalItems` (`number`), and `totalItemsScanned` (`number`).
* **Handling in App:**
  * Replace all UI references to `customer`, `priority`, and `Pick by <SLA>` with `orderNumber`, `paymentMethod` badge (`COD` / `PREPAID`), `grandTotal` (`₹`), `orderDate`, `Warehouse #{warehouseId}`, and `totalItemsScanned / totalItems` lines completed.

### 1.6 No Completed / Dispatched Orders List Endpoint
* **What is NOT given:**
  * Picker: `GET /api/picker-app/orders/assigned` returns only `PICKING` orders. Once a packer is assigned (`POST /orders/{id}/assign-packer`), the order becomes `PACKING` and leaves the picker's list. No `/orders/completed` endpoint exists.
  * Packer: `GET /api/packer-app/orders/assigned` returns `PACKING` and `PACKED` orders. Once a rider is assigned (`POST /orders/{id}/assign-rider`), the order becomes `RIDER_ASSIGNED` and leaves `/orders/assigned`. No `/orders/dispatched` endpoint exists.
* **Handling in App:**
  * **Picker Completed Tab (`completed-orders.tsx`)**: Show session-completed orders cached locally when `assign-packer` succeeds, alongside the daily `completedOrdersCount` and `totalItemsPickedToday` counters from `GET /api/picker-app/stats`.
  * **Packer Completed Tab (`PackerCompletedScreen.tsx`)**: Show `PACKED` orders (ready for rider assignment from `GET /api/packer-app/orders/assigned`) plus session-dispatched (`RIDER_ASSIGNED`) orders cached locally when `assign-rider` succeeds, alongside `completedOrders` and `todayOrdersPacked` from `GET /api/packer-app/stats`.

### 1.7 No Exception Reporting, Photo Evidence, Location Scan, Package Creation, or Offline Sync Endpoints
* **What is NOT given in the `.md` files:**
  1. **No Exception / Short-Pick API**: Both `POST /api/picker-app/orders/{id}/assign-packer` (`"Not all items have been picked yet"`) and `POST /api/packer-app/orders/{id}/assign-rider` (`"Not all items have been fully packed"`) require 100% of ordered items to be scanned. There is no `create_exception` or `exception-evidence` upload API.
  2. **No Location Barcode Scan API**: Picker items include `zone`, `aisle`, `rack`, `bin`, `shelf`, and `locationCode` (nullable if no inventory location exists) as **visual guidance only**. There is no location scan endpoint.
  3. **No Explicit `start-order` or `complete-order` or `create-package` API**:
     * Picker orders arrive already in `PICKING` status; completion is performed by calling `POST /api/picker-app/orders/{id}/assign-packer` (`{ packerId }`).
     * Packer orders arrive in `PACKING` status; scanning the last unit via `POST /api/packer-app/orders/{id}/scan` **automatically transitions** the order to `PACKED` (`orderFullyPacked: true`), and completion is performed by calling `POST /api/packer-app/orders/{id}/assign-rider` (`{ riderId, notes? }`).
  4. **No Offline Batch Sync (`/sync`) or Client Idempotency Keys**: Scans are live unit-by-unit POST requests (`{ "barcode": "..." }`) that return the authoritative updated item list immediately.

---

## 2. File-by-File Inventory of Everything to Delete, Create, or Modify

### 2.1 Files & Directories to DELETE Completely

| Path | Reason for Deletion |
|---|---|
| `frontend/src/api/supabase.ts` | Initializes `@supabase/supabase-js` client; no longer used. |
| `frontend/src/services/supabasePickerApi.ts` | Supabase adapter implementing `IPickerApi`; replaced by direct REST services. |
| `frontend/src/screens/LocationScanScreen.tsx` | Legacy location-scan step; REST API has no location scan endpoint. |
| `frontend/src/app/pick/[orderId]/location.tsx` | Legacy route for location scan. |
| `frontend/src/app/pick/[orderId]/quantity.tsx` | Legacy route for separate quantity screen. |
| `frontend/src/screens/QuantityScreen.tsx` | Legacy re-export of `SkuScanScreen`. |
| `frontend/src/screens/ExceptionScreen.tsx` | Exception & photo-evidence upload screen; not supported by REST API. |
| `frontend/src/app/pick/[orderId]/exception.tsx` | Route for `ExceptionScreen`. |
| `frontend/src/components/ExceptionForm.tsx` | Unused exception form component. |
| `frontend/src/scanner/ScannerInput.tsx` | Legacy unused scanner component (`BarcodeDisplay` + `BarcodeScannerModal` are used). |
| `frontend/src/scanner/parser.ts` | Legacy helper only used by `ScannerInput.tsx`. |
| `frontend/src/storage/schema.ts` | SQLite outbox DDL for Supabase offline sync. |
| `frontend/src/storage/store.ts` | Outbox `RowStore` interface. |
| `frontend/src/storage/drivers/expoStore.ts` | `expo-sqlite` outbox driver. |
| `frontend/src/storage/drivers/fileStore.ts` | Node file store driver for offline outbox tests. |
| `frontend/src/sync/connectivity.ts` | Outbox connectivity poller. |
| `frontend/src/sync/events.ts` | Outbox event types (`ORDER_STARTED`, `LOCATION_SCANNED`, etc.). |
| `frontend/src/sync/logger.ts` | Outbox logger. |
| `frontend/src/sync/offlineApi.ts` | `OfflineFirstPickerApi` wrapper around Supabase RPCs. |
| `frontend/src/sync/orderCache.ts` | SQLite order snapshot cache for outbox validation. |
| `frontend/src/sync/runtime.ts` | Outbox `SyncRuntime` factory. |
| `frontend/src/sync/setup.ts` | Supabase probe + `expo-sqlite` sync setup. |
| `frontend/src/sync/status.ts` | Outbox status store. |
| `frontend/src/sync/SyncContext.tsx` | React context for SQLite outbox sync. |
| `frontend/src/sync/syncEngine.ts` | Outbox batch uploader. |
| `frontend/src/components/SyncBadge.tsx` | Outbox conflict/queued badge component. |
| `Supabase_Schema.sql` | Legacy Supabase database schema. |
| `supabase/migrations/0001_*.sql` .. `0017_*.sql` | All 16 Supabase SQL migration files. |
| `scripts/fetch_product_images.py` | Script for downloading test plumbing images for Supabase Storage. |
| `scripts/upload_product_images.mjs` | Script for uploading images to Supabase Storage bucket. |
| `product-images/` & `product-images.zip` | Local copies of Supabase Storage test product images. |

---

### 2.2 New Files to CREATE

| New File Path | Purpose & Contents |
|---|---|
| `frontend/src/api/http.ts` | Core `fetch` wrapper configured with `EXPO_PUBLIC_API_BASE_URL`, `Authorization: Bearer <token>` injection, secure token storage (`expo-secure-store` on iOS/Android + `AsyncStorage` on Web), `401 UNAUTHORIZED` auto-logout listener, standard envelope unwrapping (`{ success, message, data }`), hard error parsing (`{ traceId, error, message, status, fieldErrors, timestamp }`), and HTTP 400 scan soft-failure handling (`success: false` with `data.message`). |
| `frontend/src/api/authApi.ts` | Implements `loginWithPassword({ identifier, password })`, `requestOtp({ identifier })`, and `loginWithOtp({ identifier, otp })` against `/api/auth/login` and `/api/auth/otp/request`. |
| `frontend/src/api/pickerAppApi.ts` | Implements all 9 endpoints in `picker-app-api.md` (`/api/picker-app/orders/assigned`, `POST /orders/{id}/scan`, `POST /orders/{id}/assign-packer`, `GET /orders/{id}/items`, `GET /stats`, `GET /available-packers`, `GET /profile`, `PUT /profile`, `POST /change-password`) plus session cache fororders assigned/completed in the shift. |
| `frontend/src/api/packerAppApi.ts` | Implements all 10 endpoints in `packer-app-api.md` (`/api/packer-app/orders/assigned`, `GET /orders/{id}`, `POST /orders/{id}/scan`, `POST /orders/{id}/assign-rider`, `GET /orders/{id}/items`, `GET /stats`, `GET /riders/available`, `GET /profile`, `PUT /profile`, `POST /change-password`) plus session cache for dispatched (`RIDER_ASSIGNED`) orders. |

---

### 2.3 Existing Files to MODIFY (Detailed Line & Logic Changes)

#### A. Configuration & Package Files
1. **`frontend/package.json`**:
   * **Remove dependencies**: `@supabase/supabase-js`, `react-native-url-polyfill`, `expo-sqlite`, `expo-image-picker`.
   * **Keep dependencies**: `expo`, `expo-camera`, `expo-clipboard`, `expo-haptics`, `expo-router`, `expo-secure-store`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, etc.
2. **`frontend/app.json`**:
   * Remove `"expo-sqlite"` from `plugins` array.
3. **`frontend/metro.config.js`**:
   * Remove `.wasm` resolver extensions added solely for `expo-sqlite` on web.
4. **`frontend/.env.example` & `frontend/.env`**:
   * Replace `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` with:
     ```env
     EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
     ```
5. **`frontend/eas.json`**:
   * Remove hardcoded preview Supabase test credentials (`EXPO_PUBLIC_DEV_PICKER_EMAIL`, `EXPO_PUBLIC_DEV_PICKER_PASSWORD`, etc.) and replace with `EXPO_PUBLIC_API_BASE_URL`.

#### B. Types, Domain & API Layer
6. **`frontend/src/types/index.ts`** (Complete Rewrite):
   * Define exact TypeScript interfaces matching `picker-app-api.md` (§1.1–§1.6) and `packer-app-api.md` (§1.1–§1.7):
     * `UserRole = "PICKER" | "PACKER"` (mapped from `"ROLE_PICKER"` / `"ROLE_PACKER"`).
     * `OrderStatus = "CONFIRMED" | "PICKING" | "PACKING" | "PACKED" | "RIDER_ASSIGNED"`.
     * `FulfillmentOrderItemDto`: `itemId: number`, `productId: number`, `variantId: number`, `sku: string`, `productName: string`, `variantLabel: string | null`, `orderedQty: number`, `pickedQty: number`, `packedQty: number`, `fullyScanned: boolean`, plus optional picker location fields (`zone`, `aisle`, `rack`, `bin`, `shelf`, `locationCode`: `string | null`).
     * `FulfillmentOrderDto`: `orderId: number`, `orderNumber: string`, `orderStatus: OrderStatus`, `orderDate: string`, `grandTotal: number`, `paymentMethod: string`, `warehouseId: number`, `pickerId: number | null`, `packerId: number | null`, `packerAssignedAt: string | null`, `totalItems: number`, `totalItemsScanned: number`, `items: FulfillmentOrderItemDto[]`.
     * `PickerScanResponseDto` (`orderFullyPicked: boolean`, `totalItemsPicked: number`, `scannedQty: number`, `orderedQty: number`, `items: FulfillmentOrderItemDto[]`, etc.).
     * `PackerScanResponseDto` (`orderFullyPacked: boolean`, `totalItemsScanned: number`, `scannedQty: number`, `orderedQty: number`, `orderStatus: "PACKING" | "PACKED"`, `items: FulfillmentOrderItemDto[]`, etc.).
     * `PickerStatsDto`: `{ assignedOrdersCount: number; completedOrdersCount: number; totalItemsPickedToday: number }`.
     * `PackerStatsDto`: `{ assignedOrders: number; completedOrders: number; todayOrdersPacked: number; todayItemsScanned: number }`.
     * `PackerCandidateDto`: `{ id: number; name: string; phone: string; email?: string; status: string; loginEnabled: boolean; rating: number | null; photoFilePath: string | null; warehouseId: number }`.
     * `RiderCandidateDto`: `{ id: number; name: string; phone: string; vehicleType: string; status: string; loginEnabled: boolean; rating: number | null; warehouseId: number }`.
     * `FulfillmentStaffProfileDto`: `{ staffId: number; name: string; phone: string; email: string | null; status: string; rating: number | null; idCardType: string | null; idCardNumber: string | null; address: string | null; photoFilePath: string | null }`.
     * `RawSalesOrderItemDto`: §1.7 of `packer-app-api.md` (`id`, `salesOrderId`, `sku`, `productName`, `variantLabel`, `hsn`, `orderedQty`, `pickedQty`, `packedQty`, `unitPrice`, `discountAmount`, `taxPercentage`, `netUnitPrice`, `taxAmount`, `lineTotal`).
7. **`frontend/src/api/client.ts`** (Rewrite):
   * Re-export the clean typed methods and DTOs from `http.ts`, `authApi.ts`, `pickerAppApi.ts`, and `packerAppApi.ts` so screens have a single, unified API entry point.
8. **`frontend/src/domain/order.ts`** (Simplify & Align with REST DTOs):
   * Update helper functions to work with `FulfillmentOrderDto` and `FulfillmentOrderItemDto`:
     * `nextPendingLine(order)`: returns first `FulfillmentOrderItemDto` where `!item.fullyScanned && item.pickedQty < item.orderedQty`.
     * `isOrderFullyPicked(order)`: returns `order.items.length > 0 && order.items.every(i => i.pickedQty >= i.orderedQty)`.
     * `isOrderFullyPacked(order)`: returns `order.orderStatus === "PACKED" || (order.items.length > 0 && order.items.every(i => i.packedQty >= i.orderedQty))`.
     * Format location helper: `formatItemLocation(item)` returning `item.locationCode` or joining non-null `[item.zone, item.aisle, item.rack, item.bin, item.shelf]` with `"-"`, falling back to `"Unassigned Location"`.
9. **`frontend/src/repositories/pickerRepository.ts` & `frontend/src/services/pickerApi.ts`**:
   * Replace the legacy mock/Supabase `IPickerApi` contract with thin delegation to `pickerAppApi` so all Picker screens use the exact REST contract.
10. **`frontend/src/utils/warehouse.ts`**:
    * Update `getWarehouseDisplay(warehouseId?: number | string | null, profileAddress?: string | null)` to handle numeric `warehouseId` (e.g., `Warehouse #3`) and use the operator's `profile.address` when available.
    * Update `getOrderProgress(order: FulfillmentOrderDto)` to compute line progress (`totalItemsScanned / totalItems`) and unit progress (`sum(pickedQty) / sum(orderedQty)`).

#### C. Navigation, Auth & Header Components
11. **`frontend/src/navigation/AppProvider.tsx`**:
    * Remove `supabase.auth.*` and `supabase.from("users")`.
    * Restore JWT from `http.ts` (`getStoredToken()`) on startup, fetch `/api/picker-app/profile` or `/api/packer-app/profile` based on stored role, and register the `401 UNAUTHORIZED` callback to clear auth state and redirect to `/login`.
    * Implement `loginWithPassword(identifier, password, rememberMe)`, `requestOtp(identifier)`, `loginWithOtp(identifier, otp)`, `refreshProfile()`, and `logout()`.
12. **`frontend/src/app/_layout.tsx` & `frontend/src/app/(tabs)/_layout.tsx`**:
    * Remove `<SyncProvider>` wrapper from `_layout.tsx`.
    * Remove `pick/[orderId]/location`, `pick/[orderId]/quantity`, and `pick/[orderId]/exception` stack screens from `_layout.tsx`.
13. **`frontend/src/components/BrandHeader.tsx`**:
    * Remove `useSyncStatus()` outbox conflicts/pending notifications.
    * Drive connection indicator from `@react-native-community/netinfo` (or last API call health) and populate the notification drawer from `/api/picker-app/orders/assigned` (for `PICKER`) or `/api/packer-app/orders/assigned` (for `PACKER`).

#### D. Auth & Profile Screens
14. **`frontend/src/screens/LoginScreen.tsx`**:
    * Support login with mobile number / identifier + password (`POST /api/auth/login` with `loginMethod: "PASSWORD"`), plus a `"Login with OTP"` button that requests an OTP (`POST /api/auth/otp/request`) and navigates to `/otp`.
15. **`frontend/src/screens/OtpScreen.tsx`**:
    * Wire `onVerify` to `POST /api/auth/login` with `{ identifier, otp, loginMethod: "OTP" }` and `onResend` to `POST /api/auth/otp/request`.
16. **`frontend/src/screens/ProfileScreen.tsx`**:
    * Render all `FulfillmentStaffProfileDto` fields (`staffId`, `name`, `phone`, `email`, `status`, `rating`, `idCardType`, `idCardNumber`, `address`, `photoFilePath`).
    * Add **Edit Profile** modal/form calling `PUT /api/{picker|packer}-app/profile` (partial update of `name`, `phone`, `email`, `address`, `idCardType`, `idCardNumber`, `photoFilePath`).
    * Add **Change Password** modal/form calling `POST /api/{picker|packer}-app/change-password` (`{ currentPassword, newPassword }` with 6–100 char validation and field-error display).

#### E. Picker Screens (`/api/picker-app/*`)
17. **`frontend/src/screens/DashboardScreen.tsx`**:
    * Call `GET /api/picker-app/stats` (`assignedOrdersCount`, `completedOrdersCount`, `totalItemsPickedToday`) and `GET /api/picker-app/orders/assigned` in parallel.
    * Display the 3 server stats + remaining units to pick across assigned orders, and the active `PICKING` order resume card.
18. **`frontend/src/screens/OrdersScreen.tsx`**:
    * Call `GET /api/picker-app/orders/assigned` for active `PICKING` orders (and read session-completed orders for the `Completed` tab).
    * Render `orderNumber`, `orderDate`, `paymentMethod`, `grandTotal`, `totalItemsScanned / totalItems`, and line previews (`productName`, `variantLabel`, `sku`, `locationCode`).
    * Tapping an order or `"Continue Picking"` navigates directly to `/order/${order.orderId}` (no separate `startOrder` call needed since orders are already in `PICKING`).
19. **`frontend/src/screens/OrderDetailScreen.tsx`**:
    * Load order items from `GET /api/picker-app/orders/{id}/items` (and order summary from `/orders/assigned` cache).
    * Display each `FulfillmentOrderItemDto` with `productName`, `variantLabel`, `sku`, `pickedQty / orderedQty`, `fullyScanned`, and full location breakdown (`locationCode`, `zone`, `aisle`, `rack`, `bin`, `shelf`).
    * Wire barcode scan sheet and camera scanner to `POST /api/picker-app/orders/{id}/scan` (`{ barcode }`):
      * On `200 OK` (`success: true`): beep success, update order lines from `data.items`, show `data.message` (`Item scanned successfully.` / `All items picked! Order is ready for packing.`).
      * On `400` soft-failure (`success: false`): trigger `alertWrongBarcode(barcode, activeLine.sku, data.message)` and clear/refocus the input.
      * When `data.orderFullyPicked === true` (or all lines have `fullyScanned === true`), enable the **"Assign Packer"** CTA (opening the Packer Selection modal or navigating to `/pick/${order.orderId}/complete`).
20. **`frontend/src/screens/SkuScanScreen.tsx`**:
    * Single-item focused picking view driven by `GET /api/picker-app/orders/{id}/items` and `POST /api/picker-app/orders/{id}/scan`.
    * Shows location card (`locationCode`, `zone`, `aisle`, `rack`, `bin`, `shelf`), `productName`, `variantLabel`, `sku`, and `pickedQty / orderedQty`.
    * Automatically advances to `/pick/${orderId}/complete` when `orderFullyPicked === true`.
21. **`frontend/src/screens/CompletionScreen.tsx`**:
    * Implements Step 5 of `picker-app-api.md` (§2.3 & §2.6):
      * Fetches `GET /api/picker-app/available-packers` (`PackerStaff[]`: `id`, `name`, `phone`, `rating`, `photoFilePath`).
      * Lets the picker select an active packer and calls `POST /api/picker-app/orders/{id}/assign-packer` (`{ packerId }`).
      * Once assigned (`"Packer assigned"`), records the order in the session-completed list and navigates back to `/orders` or `/dashboard`.

#### F. Packer Screens (`/api/packer-app/*`)
22. **`frontend/src/screens/PackerDashboardScreen.tsx`**:
    * Call `GET /api/packer-app/stats` (`assignedOrders`, `completedOrders`, `todayOrdersPacked`, `todayItemsScanned`) and `GET /api/packer-app/orders/assigned`.
    * Render the 4 stats from `/api/packer-app/stats` and the queue of `PACKING` (in progress) and `PACKED` (ready for rider assignment) orders.
    * Render `orderNumber`, `orderDate`, `paymentMethod`, `grandTotal`, and `totalItemsScanned / totalItems`.
23. **`frontend/src/screens/PackerOrderScreen.tsx`**:
    * Load order detail from `GET /api/packer-app/orders/{id}` and available riders from `GET /api/packer-app/riders/available`.
    * In the **Order Info** modal, optionally fetch `GET /api/packer-app/orders/{id}/items` (§2.5) to display raw item pricing (`unitPrice`, `discountAmount`, `taxPercentage`, `taxAmount`, `lineTotal`, `hsn`).
    * Wire barcode input and continuous camera scanner to `POST /api/packer-app/orders/{id}/scan` (`{ barcode }`):
      * On `200 OK` (`success: true`): beep success, update `order.items` from `data.items` and `order.orderStatus` from `data.orderStatus`.
      * On `400` soft-failure (`success: false`): trigger `alertWrongBarcode(barcode, activeItem?.sku, data.message)` for all 8 documented soft-failure reasons (empty barcode, unknown barcode, non-product barcode, variant not found, wrong order, not picked yet, already fully packed, packing more than picked).
      * When `data.orderFullyPacked === true` (`orderStatus === "PACKED"`), prompt the packer to open the **Assign Rider** modal.
    * Wire Rider selection modal to `POST /api/packer-app/orders/{id}/assign-rider` (`{ riderId, notes }`), displaying rider `name`, `phone`, `vehicleType`, and `rating`.
24. **`frontend/src/screens/PackerCompletedScreen.tsx` & `frontend/src/screens/DispatchScreen.tsx`**:
    * Show `PACKED` orders (awaiting rider assignment from `GET /api/packer-app/orders/assigned`) and session-dispatched (`RIDER_ASSIGNED`) orders, allowing direct rider assignment via `GET /api/packer-app/riders/available` and `POST /api/packer-app/orders/{id}/assign-rider`.

#### G. Automated Tests & Documentation
25. **`tests/workflow-hardening.test.mjs`**:
    * Rewrite tests to verify:
      * Zero references to `@supabase/supabase-js` or Supabase RPCs across `frontend/`.
      * `http.ts` properly unwraps `200 OK` envelopes, returns soft-failure objects on `400` scan responses with `success: false`, throws structured errors on `BUSINESS_ERROR` / `VALIDATION_ERROR`, and triggers logout on `401 UNAUTHORIZED`.
      * `pickerAppApi` and `packerAppApi` hit the exact paths and HTTP methods specified in `picker-app-api.md` and `packer-app-api.md`.
26. **`frontend/README.md`**:
    * Update architecture, environment variables (`EXPO_PUBLIC_API_BASE_URL`), and workflow documentation to reflect the REST backend.

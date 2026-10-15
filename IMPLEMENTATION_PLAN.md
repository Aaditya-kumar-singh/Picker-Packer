# YBM Picker & Packer — Complete Supabase Removal & REST API Migration Plan

**Target References:** `picker-app-api.md` (`/api/picker-app`) & `packer-app-api.md` (`/api/packer-app`)  
**Goal:** Completely remove Supabase (`@supabase/supabase-js`, PostgreSQL RPCs, Storage buckets, SQLite offline outbox, and catalog scripts) and run the mobile/web app 100% on the REST APIs defined in `picker-app-api.md` and `packer-app-api.md`.

---

## 1. Executive Summary of Architectural Shift

| Layer / Feature | Old Supabase Architecture (To Remove) | New REST API Architecture (`picker-app-api.md` & `packer-app-api.md`) |
| :--- | :--- | :--- |
| **Backend Transport** | `@supabase/supabase-js` table queries + PostgreSQL RPCs (`supabase.rpc(...)`) | Standard HTTP `fetch` client against `${EXPO_PUBLIC_API_BASE_URL}/api/*` with `Authorization: Bearer <JWT>` |
| **Authentication** | `supabase.auth.signInWithPassword` + `public.users` table select | `POST /api/auth/login` (`loginMethod: "PASSWORD"` or `"OTP"`) & `POST /api/auth/otp/request`; roles `ROLE_PICKER` and `ROLE_PACKER` |
| **Primary Keys** | String UUIDs / text IDs (`order.id: string`, `item.id: string`) | Numeric IDs (`orderId: number`, `itemId: number`, `productId: number`, `variantId: number`, `packerId: number`, `riderId: number`, `staffId: number`) |
| **Picker Order Lifecycle** | `ASSIGNED` → `picker_start_order` → `PICKING` → `picker_complete_order` → `READY_FOR_PACKING` (no packer selection) | `CONFIRMED` → *(admin assigns picker)* → `PICKING` → *(picker scans all items)* → *(picker selects & assigns packer via `POST /orders/{id}/assign-packer`)* → `PACKING` |
| **Picker Item Scanning** | 2 RPCs per scan: `sync_scan_event` + `picker_pick_item` | 1 REST call per unit: `POST /api/picker-app/orders/{id}/scan` (`{ barcode }`) → increments `pickedQty` by `1`, returns fresh `items[]` and `orderFullyPicked: boolean` |
| **Packer Order Lifecycle** | `READY_FOR_PACKING` → `packer_start_order` → `PACKING` → `packer_create_package` + `packer_complete_order` → `PACKED` → `assign_rider` → `RIDER_ASSIGNED` | `PICKING` → *(picker assigns packer)* → `PACKING` → *(final unit scan auto-transitions order to `PACKED` with `orderFullyPacked: true`)* → *(packer assigns rider via `POST /orders/{id}/assign-rider`)* → `RIDER_ASSIGNED` |
| **Packer Item Scanning** | `sync_scan_event` + `packer_confirm_item` + `packer_create_package` + `packer_complete_order` | 1 REST call per unit: `POST /api/packer-app/orders/{id}/scan` (`{ barcode }`) → increments `packedQty` by `1`, auto-completes to `PACKED` when all lines reach `packedQty >= orderedQty` |
| **Profile & Password** | Read-only `public.users` row | `GET /profile`, `PUT /profile` (partial update), `POST /change-password` (`{ currentPassword, newPassword }`) on both `/api/picker-app` and `/api/packer-app` |

---

## 2. What Is NOT Given in `picker-app-api.md` & `packer-app-api.md` (Detailed Gap Analysis)

### 2.1 Backend Contract Details Referenced But Not Fully Specified in the Two `.md` Files

| # | Missing / Unspecified Item | What the `.md` Files Say | How the App Implementation Will Handle It |
| :--- | :--- | :--- | :--- |
| **1** | **Backend Base Host / Origin URL** | Docs specify relative paths (`/api/picker-app`, `/api/packer-app`, `/api/auth/login`, `/api/auth/otp/request`), but no hostname or port. | Read `EXPO_PUBLIC_API_BASE_URL` from `frontend/.env` (strip trailing slash, default to `http://localhost:8080` in `.env.example`). |
| **2** | **`POST /api/auth/login` Response Schema** | Docs specify request body `{ "identifier", "password", "loginMethod": "PASSWORD" }` or `{ "identifier", "otp", "loginMethod": "OTP" }` and say *"store `token`; verify role `ROLE_PICKER` / `ROLE_PACKER`"*, but do not show the exact `data` JSON object. | Support flexible token & role extraction in `authApi.ts`: read JWT from `data.token ?? data.accessToken ?? data.jwt`, and resolve role from `data.role ?? data.user?.role ?? data.roles?.[0]` with a fallback JWT payload base64 decode (`role` / `roles` / `authorities`), plus profile verification via `GET /api/{picker\|packer}-app/profile`. |
| **3** | **`POST /api/auth/otp/request` Request & Response Schema** | Docs state *"or the OTP flow (`POST /api/auth/otp/request` → login with `loginMethod: "OTP"`, `otp`)"*, without showing the request payload key (`identifier` vs `phone`) or response `data` shape. | Send `{ identifier }` (and tolerate string/object `data` in the success envelope `{ success: true, message, data }`). |
| **4** | **Single-Order Detail Endpoint for Picker (`GET /api/picker-app/orders/{id}`)** | `packer-app-api.md` (§2.2) has `GET /api/packer-app/orders/{id}` returning a full `FulfillmentOrderDto`. **`picker-app-api.md` does NOT have `GET /api/picker-app/orders/{id}`** — it only has `GET /api/picker-app/orders/assigned` (`Order[]`) and `GET /api/picker-app/orders/{id}/items` (`OrderItem[]`). | For Picker order detail refresh: seed the order header (`orderNumber`, `orderDate`, `grandTotal`, `paymentMethod`, `warehouseId`) from `GET /api/picker-app/orders/assigned` cache and refresh line items + locations from `GET /api/picker-app/orders/{id}/items` (and from `POST /orders/{id}/scan` response `data.items`). |
| **5** | **Completed Orders List Endpoint for Picker & Dispatched List for Packer** | - Picker `GET /orders/assigned` only returns `PICKING` orders (once a packer is assigned, status becomes `PACKING` and it leaves the list).<br>- Packer `GET /orders/assigned` returns `PACKING` and `PACKED` orders (once a rider is assigned, status becomes `RIDER_ASSIGNED` and it leaves the list).<br>- Neither `.md` file has a `GET /orders/completed` endpoint. | - **Packer Completed Tab**: Filter `GET /api/packer-app/orders/assigned` for `orderStatus === "PACKED"` (finished packing, awaiting rider) + keep a session history list of orders dispatched (`RIDER_ASSIGNED`) during the current shift.<br>- **Picker Completed Tab**: Display `completedOrdersCount` and `totalItemsPickedToday` from `GET /api/picker-app/stats` + session history of orders handed off to packers during the shift. |
| **6** | **Always-`null` Fields on `FulfillmentOrderDto`** | Both `.md` files (§1.1) explicitly warn that `warehouseName`, `customerName`, `customerPhone`, `shippingAddress`, `fulfillmentStaffId`, `fulfillmentStaffName`, `fulfillmentStartedAt`, and `fulfillmentCompletedAt` are **always `null` today — do not render**. | Remove customer name/phone/address and `warehouseName` dependencies from order cards and headers. Render `orderNumber`, `orderDate`, `paymentMethod` (`COD` / `PREPAID`), `grandTotal` (`₹`), `warehouseId` (`Warehouse #{warehouseId}`), and line item progress (`totalItemsScanned / totalItems`). |
| **7** | **Product Thumbnail Images on Order Items** | `FulfillmentOrderItemDto` (§1.2) has `itemId`, `productId`, `variantId`, `sku`, `productName`, `variantLabel`, `orderedQty`, `pickedQty`, `packedQty`, `fullyScanned`, and location fields — **no `productImageUrl` field**. | Replace remote Supabase product image thumbnails on order lines with clean category/SKU vector icon avatars and display `variantLabel` (e.g., `"Size: M, Color: Navy"`) where `productSpecs` was previously shown. |
| **8** | **Staff Photo Base URL (`photoFilePath`)** | `PackerStaff` (§1.5) and `Profile` (§1.6) return relative paths like `"photoFilePath": "staff/ravi.jpg"`, without specifying whether static files are served at `${BASE_URL}/${photoFilePath}` or `/uploads/${photoFilePath}`. | Resolve relative `photoFilePath` against `EXPO_PUBLIC_API_BASE_URL` and gracefully fall back to the operator's initials avatar on image load error. |
| **9** | **Packer Scan Response Field Naming Difference** | - Picker scan response (§1.3) uses `totalItemsPicked` and `orderFullyPicked`.<br>- Packer scan response (§1.3) uses `totalItemsScanned` and `orderFullyPacked`. | Define distinct TypeScript interfaces (`PickerScanResponseDto` and `PackerScanResponseDto`) and normalize them cleanly in the API layer. |
| **10** | **Barcode Validation Soft-Failures Return HTTP 400 with Success Envelope** | Both `.md` files state: `POST /orders/{id}/scan` returns **HTTP 400 with the success envelope** (`{ "success": false, "message": "...", "data": { "success": false, "message": "<reason>", "barcode": "..." } }`) for barcode/quantity errors, whereas ownership/status errors return the hard error envelope (`{ traceId, error: "BUSINESS_ERROR", message, status: 400 }`). | In `http.ts`, inspect HTTP 400 responses before throwing: if `"success" in body && body.success === false`, return it as a structured scan soft-failure (`{ ok: true, softFailure: true, data: body.data }`) rather than throwing a hard exception. |

---

### 2.2 Old Supabase Features Not Present in the `.md` Specs (To Be Removed)

1. **Supabase Client & Auth (`@supabase/supabase-js`, `frontend/src/api/supabase.ts`, `frontend/src/services/supabasePickerApi.ts`)**: Completely removed.
2. **PostgreSQL RPCs & Migrations (`Supabase_Schema.sql`, `supabase/migrations/0001..0017`)**: Completely removed.
3. **Product Image Scraper & Supabase Storage Uploader (`scripts/fetch_product_images.py`, `scripts/upload_product_images.mjs`, `product-images/`, `product-images.zip`)**: Completely removed.
4. **Offline SQLite Outbox & Sync Engine (`frontend/src/storage/*`, `frontend/src/sync/*`, `frontend/src/components/SyncBadge.tsx`)**:
   - The REST API has no batch `/sync` endpoint, no client-generated UUID idempotency keys, and requires live server responses on every unit scan (`POST /orders/{id}/scan`) to return updated `items[]` and `orderFullyPicked` / `orderFullyPacked`.
   - Remove `expo-sqlite` outbox tables (`event_outbox`, `order_cache`, `sync_meta`) and `SyncEngine`. Replace `SyncContext` / header badge with a lightweight live API reachability indicator.
5. **Exception Reporting & Photo Evidence (`ExceptionScreen.tsx`, `ExceptionForm.tsx`, `frontend/src/app/pick/[orderId]/exception.tsx`)**:
   - Neither `picker-app-api.md` nor `packer-app-api.md` has an exception endpoint (`POST /exceptions` does not exist) or photo evidence upload endpoint. Furthermore, `picker-app-api.md` §2.3 enforces **all lines fully picked** (`Not all items have been picked yet`) as a precondition to assigning a packer.
   - Remove the exception screen, route, and evidence upload logic.
6. **Location Barcode Scan Step (`LocationScanScreen.tsx`, `frontend/src/app/pick/[orderId]/location.tsx`)**:
   - `picker-app-api.md` §1.2 provides `zone`, `aisle`, `rack`, `bin`, `shelf`, and `locationCode` (e.g. `"A-03-R2-B7-S1"`) as display-only location fields on each `OrderItem`. There is no location barcode scan endpoint.
7. **Separate `startOrder` / `createPackage` / `completeOrder` Calls**:
   - Picker orders are already in `PICKING` when fetched from `GET /api/picker-app/orders/assigned`.
   - Picker completion is the **Assign Packer** step (`GET /api/picker-app/available-packers` → `POST /api/picker-app/orders/{id}/assign-packer`).
   - Packer orders in `PACKING` auto-transition to `PACKED` on the final item scan (`POST /api/packer-app/orders/{id}/scan` returns `orderFullyPacked: true`, `orderStatus: "PACKED"`), and are completed by **Assign Rider** (`GET /api/packer-app/riders/available` → `POST /api/packer-app/orders/{id}/assign-rider`).

---

## 3. File-by-File Inventory: Delete, Create, and Modify

### 3.1 Files & Directories to DELETE

| Path | Reason for Deletion |
| :--- | :--- |
| `Supabase_Schema.sql` | Legacy Supabase base schema |
| `supabase/` *(entire directory, migrations `0001`–`0017`)* | Legacy Supabase SQL migrations and RPC definitions |
| `scripts/fetch_product_images.py` | Legacy catalog image scraper for Supabase |
| `scripts/upload_product_images.mjs` | Legacy Supabase Storage uploader |
| `product-images/` *(entire directory)* & `product-images.zip` | Legacy static images for Supabase Storage bucket |
| `docs/PICKER_FLOW_UPDATE_REPORT.md` | Superseded by `picker-app-api.md` (which requires picker-side packer assignment) |
| `frontend/src/api/supabase.ts` | Supabase client initialization |
| `frontend/src/services/supabasePickerApi.ts` | Supabase implementation of `IPickerApi` |
| `frontend/src/services/pickerApi.ts` | Legacy mock/Supabase repository interface |
| `frontend/src/repositories/pickerRepository.ts` | Legacy wrapper over `supabasePickerApi` and `OfflineFirstPickerApi` |
| `frontend/src/storage/schema.ts` | SQLite outbox DDL |
| `frontend/src/storage/store.ts` | SQLite outbox interface |
| `frontend/src/storage/drivers/expoStore.ts` | `expo-sqlite` outbox driver |
| `frontend/src/storage/drivers/fileStore.ts` | Node file store for outbox tests |
| `frontend/src/sync/events.ts` | Legacy offline sync event types |
| `frontend/src/sync/logger.ts` | Legacy offline sync logger |
| `frontend/src/sync/offlineApi.ts` | Legacy offline-first wrapper |
| `frontend/src/sync/orderCache.ts` | Legacy SQLite order cache |
| `frontend/src/sync/runtime.ts` | Legacy sync runtime |
| `frontend/src/sync/setup.ts` | Legacy Supabase probe + SQLite sync setup |
| `frontend/src/sync/status.ts` | Legacy sync status store |
| `frontend/src/sync/syncEngine.ts` | Legacy outbox drain engine |
| `frontend/src/components/SyncBadge.tsx` | Legacy offline outbox conflict/queue UI |
| `frontend/src/components/ExceptionForm.tsx` | Legacy exception form (no REST endpoint) |
| `frontend/src/screens/ExceptionScreen.tsx` | Legacy exception & photo evidence screen (no REST endpoint) |
| `frontend/src/app/pick/[orderId]/exception.tsx` | Legacy exception route |
| `frontend/src/screens/LocationScanScreen.tsx` | Legacy location scan screen (no REST endpoint) |
| `frontend/src/app/pick/[orderId]/location.tsx` | Legacy location route |
| `frontend/src/screens/QuantityScreen.tsx` | Legacy quantity alias screen |
| `frontend/src/app/pick/[orderId]/quantity.tsx` | Legacy quantity route |
| `frontend/src/scanner/ScannerInput.tsx` & `frontend/src/scanner/parser.ts` | Unused legacy scanner input component |

---

### 3.2 Files to CREATE

| Path | Responsibility |
| :--- | :--- |
| `frontend/src/api/http.ts` | Core HTTP client using `EXPO_PUBLIC_API_BASE_URL`, JWT storage (`expo-secure-store` on native + `AsyncStorage` fallback on web), envelope unwrapping (`{ success, message, data }`), HTTP 400 scan soft-failure pass-through, `VALIDATION_ERROR` `fieldErrors` formatting, and `401 UNAUTHORIZED` auto-logout listener. |
| `frontend/src/api/authApi.ts` | Implements `loginWithPassword({ identifier, password })`, `requestOtp({ identifier })`, and `loginWithOtp({ identifier, otp })` against `/api/auth/login` and `/api/auth/otp/request`. |
| `frontend/src/api/pickerAppApi.ts` | Implements all 9 endpoints in `picker-app-api.md` (§2.1–§2.9):<br>1. `getAssignedOrders()` → `GET /api/picker-app/orders/assigned`<br>2. `scanOrderItem(orderId, barcode)` → `POST /api/picker-app/orders/{id}/scan`<br>3. `assignPacker(orderId, packerId)` → `POST /api/picker-app/orders/{id}/assign-packer`<br>4. `getOrderItems(orderId)` → `GET /api/picker-app/orders/{id}/items`<br>5. `getStats()` → `GET /api/picker-app/stats`<br>6. `getAvailablePackers()` → `GET /api/picker-app/available-packers`<br>7. `getProfile()` → `GET /api/picker-app/profile`<br>8. `updateProfile(patch)` → `PUT /api/picker-app/profile`<br>9. `changePassword({ currentPassword, newPassword })` → `POST /api/picker-app/change-password` |
| `frontend/src/api/packerAppApi.ts` | Implements all 10 endpoints in `packer-app-api.md` (§2.1–§2.10):<br>1. `getAssignedOrders()` → `GET /api/packer-app/orders/assigned`<br>2. `getOrderDetail(orderId)` → `GET /api/packer-app/orders/{id}`<br>3. `scanOrderItem(orderId, barcode)` → `POST /api/packer-app/orders/{id}/scan`<br>4. `assignRider(orderId, { riderId, notes })` → `POST /api/packer-app/orders/{id}/assign-rider`<br>5. `getOrderRawItems(orderId)` → `GET /api/packer-app/orders/{id}/items`<br>6. `getStats()` → `GET /api/packer-app/stats`<br>7. `getAvailableRiders()` → `GET /api/packer-app/riders/available`<br>8. `getProfile()` → `GET /api/packer-app/profile`<br>9. `updateProfile(patch)` → `PUT /api/packer-app/profile`<br>10. `changePassword({ currentPassword, newPassword })` → `POST /api/packer-app/change-password` |

---

### 3.3 Files to MODIFY (Detailed Changes per File)

#### A. Configuration & Dependencies
1. **`frontend/package.json`**:
   - Remove `@supabase/supabase-js`, `react-native-url-polyfill`, and `expo-sqlite` from `dependencies`.
   - Remove `"expo-sqlite"` from `frontend/app.json` plugins array.
   - Remove WASM resolver lines for `expo-sqlite` in `frontend/metro.config.js`.
2. **`frontend/.env.example` & `frontend/.env`**:
   - Replace `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` with:
     ```env
     EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
     ```
3. **`frontend/eas.json`**:
   - Remove hardcoded `EXPO_PUBLIC_DEV_PICKER_PASSWORD` and `EXPO_PUBLIC_DEV_PACKER_PASSWORD` from `build.preview.env`; add `EXPO_PUBLIC_API_BASE_URL`.

#### B. Types & Domain Helpers
4. **`frontend/src/types/index.ts`**:
   - Replace Supabase/mock types with exact DTOs from `picker-app-api.md` and `packer-app-api.md`:
     - `UserRole = "PICKER" | "PACKER"` (mapped from `"ROLE_PICKER"` / `"ROLE_PACKER"`).
     - `FulfillmentOrderStatus = "CONFIRMED" | "PICKING" | "PACKING" | "PACKED" | "RIDER_ASSIGNED"`.
     - `FulfillmentOrderItemDto`: `{ itemId, productId, variantId, sku, productName, variantLabel, orderedQty, pickedQty, packedQty, fullyScanned, zone?, aisle?, rack?, bin?, shelf?, locationCode? }`.
     - `FulfillmentOrderDto`: `{ orderId, orderNumber, orderStatus, orderDate, grandTotal, paymentMethod, warehouseId, pickerId, packerId, packerAssignedAt, totalItems, totalItemsScanned, items: FulfillmentOrderItemDto[] }`.
     - `PickerScanResponseDto` & `PackerScanResponseDto`.
     - `PickerStatsDto`: `{ assignedOrdersCount, completedOrdersCount, totalItemsPickedToday }`.
     - `PackerStatsDto`: `{ assignedOrders, completedOrders, todayOrdersPacked, todayItemsScanned }`.
     - `PackerStaffDto`: `{ id, name, phone, email, status, loginEnabled, rating, photoFilePath, warehouseId }`.
     - `RiderCandidateDto`: `{ id, name, phone, vehicleType, status, loginEnabled, rating, warehouseId }`.
     - `FulfillmentStaffProfileDto`: `{ staffId, name, phone, email, status, rating, idCardType, idCardNumber, address, photoFilePath }`.
     - `RawSalesOrderItemDto`: `{ id, salesOrderId, productId, variantId, batchId, sku, productName, variantLabel, hsn, orderedQty, reservedQty, pickedQty, packedQty, shippedQty, unitPrice, discountAmount, taxPercentage, netUnitPrice, taxAmount, lineTotal, bundleId, activeFlag, crtBy, updtBy, crtDt, updtDt }`.
5. **`frontend/src/domain/order.ts`**:
   - Update helper functions (`nextPendingLine`, `isOrderFullyPicked`, `isOrderFullyPacked`, `formatLocationParts`) to operate on `FulfillmentOrderDto` and `FulfillmentOrderItemDto` (`pickedQty < orderedQty`, `fullyScanned`).
6. **`frontend/src/utils/warehouse.ts`**:
   - Update `getWarehouseDisplay(warehouseId?: number | string | null)` to handle numeric `warehouseId` (e.g. `warehouseId: 3` → `"Warehouse #3"`).
   - Update `getOrderProgress` and `getBatchCount` to work with `FulfillmentOrderDto` (`items`, `orderedQty`, `pickedQty`, `packedQty`, `zone`, `locationCode`).
7. **`frontend/src/api/client.ts`**:
   - Re-export a unified facade over `authApi`, `pickerAppApi`, `packerAppApi`, and in-memory session caches (active orders cache + session-completed orders cache) so screens have a single clean import surface.

#### C. Authentication, Navigation & Connectivity Context
8. **`frontend/src/navigation/AppProvider.tsx`**:
   - Replace `supabase.auth.*` with `authApi` + `pickerAppApi.getProfile()` / `packerAppApi.getProfile()`.
   - Expose:
     - `user`: `{ role: "PICKER" | "PACKER", profile: FulfillmentStaffProfileDto }`
     - `loginWithPassword(identifier, password, rememberMe)`
     - `requestOtp(identifier)`
     - `verifyOtp(identifier, otp)`
     - `refreshProfile()`
     - `updateProfile(patch)`
     - `changePassword(currentPassword, newPassword)`
     - `logout()`
   - Register the `401 UNAUTHORIZED` handler on `http.ts` so expired JWTs automatically clear session state and route to `/login`.
9. **`frontend/src/sync/SyncContext.tsx` & `frontend/src/sync/connectivity.ts`**:
   - Simplify `SyncContext` to a lightweight online/reachability status provider (using `@react-native-community/netinfo` + last API response state) so `BrandHeader` continues to display `Live` / `Offline` / `Server Err` without SQLite or Supabase probes.
10. **`frontend/src/app/_layout.tsx` & `frontend/src/app/(tabs)/_layout.tsx`**:
    - Remove deleted stack screens (`pick/[orderId]/location`, `pick/[orderId]/quantity`, `pick/[orderId]/exception`).
    - Keep role guards for `PICKER` (`/dashboard`, `/orders`, `/completed-orders`, `/order/[id]`, `/pick/[orderId]/sku`, `/pick/[orderId]/complete`) and `PACKER` (`/packer-dashboard`, `/orders`, `/completed-orders`, `/pack/order/[id]`).

#### D. Auth Screens
11. **`frontend/src/screens/LoginScreen.tsx`**:
    - Change "Work Email" field to **"Mobile Number / Identifier"** (`identifier`) to match `picker-app-api.md` & `packer-app-api.md` (*"The login mobile number must match the picker/packer staff record"*).
    - Support **Password Login** (`POST /api/auth/login` with `loginMethod: "PASSWORD"`) and a **"Login with OTP"** button that calls `POST /api/auth/otp/request` and navigates to `/otp`.
12. **`frontend/src/screens/OtpScreen.tsx`**:
    - Wire `onVerify` to `POST /api/auth/login` with `{ identifier, otp, loginMethod: "OTP" }` and route to `/dashboard` (`PICKER`) or `/packer-dashboard` (`PACKER`).

#### E. Picker Screens (`picker-app-api.md`)
13. **`frontend/src/screens/DashboardScreen.tsx`**:
    - Fetch `pickerAppApi.getStats()` (`assignedOrdersCount`, `completedOrdersCount`, `totalItemsPickedToday`) and `pickerAppApi.getAssignedOrders()` in parallel.
    - Render KPI cards directly from `/api/picker-app/stats` and `/api/picker-app/orders/assigned`.
14. **`frontend/src/screens/OrdersScreen.tsx`**:
    - Fetch `pickerAppApi.getAssignedOrders()`.
    - Render `orderNumber`, `orderDate`, `paymentMethod` (`COD`/`PREPAID`), `grandTotal`, `totalItemsScanned / totalItems` lines progress, and line previews (`productName`, `variantLabel`, `locationCode`).
    - Search by `orderNumber`, `sku`, `productName`, `variantLabel`, `locationCode`, or `zone`.
    - Remove `beginPicking` call on "Start Picking" (orders are already in `PICKING` status); navigate directly to `/order/${order.orderId}`.
15. **`frontend/src/screens/OrderDetailScreen.tsx`**:
    - Load order from assigned list cache + fresh items via `GET /api/picker-app/orders/{id}/items`.
    - Display each line's `productName`, `variantLabel`, `sku`, `pickedQty / orderedQty`, `fullyScanned`, and full location breakdown (`locationCode`, `zone`, `aisle`, `rack`, `bin`, `shelf`).
    - Wire barcode scanning (`handleScanSubmit`) to `POST /api/picker-app/orders/{id}/scan` (`{ barcode }`):
      - On `200 OK` (`data.success === true`): beep success, update `items` directly from `data.items`, show `data.message` (`Item scanned successfully.` / `All items picked! Order is ready for packing.`).
      - On `400` soft-failure (`data.success === false`): trigger `alertWrongBarcode(barcode, targetLine.sku, data.message)` and clear/refocus input while staying on the same screen.
      - When `data.orderFullyPicked === true` (or all lines have `fullyScanned === true`), prompt the picker to **Assign Packer** (either inline modal or via `CompletionScreen`).
16. **`frontend/src/screens/SkuScanScreen.tsx`**:
    - Full-screen item scanner for `/pick/[orderId]/sku` using `POST /api/picker-app/orders/{id}/scan` (`{ barcode }`).
    - Displays `locationCode` (`zone` · `aisle` · `rack` · `bin` · `shelf`), `productName`, `variantLabel`, `sku`, and `pickedQty / orderedQty`.
    - Advances automatically to `/pick/${orderId}/complete` when `data.orderFullyPicked === true`.
17. **`frontend/src/screens/CompletionScreen.tsx`**:
    - Replace the old `picker_complete_order` screen with the **Assign Packer (`PICKING` → `PACKING`)** workflow required by `picker-app-api.md` (§2.3 & §2.6):
      - Fetch active packers in the warehouse via `GET /api/picker-app/available-packers` (`id`, `name`, `phone`, `rating`, `photoFilePath`).
      - Allow the picker to select a packer and submit `POST /api/picker-app/orders/{id}/assign-packer` (`{ packerId }`).
      - Record the completed order in the session completed list and return to `/orders` or `/dashboard`.

#### F. Packer Screens (`packer-app-api.md`)
18. **`frontend/src/screens/PackerDashboardScreen.tsx`**:
    - Fetch `packerAppApi.getStats()` (`assignedOrders`, `completedOrders`, `todayOrdersPacked`, `todayItemsScanned`) and `packerAppApi.getAssignedOrders()` (`PACKING` and `PACKED` orders).
    - Render KPI cards (`assignedOrders`, `completedOrders`, `todayOrdersPacked`, `todayItemsScanned`) and order cards showing `orderNumber`, `paymentMethod`, `grandTotal`, `totalItemsScanned / totalItems`, and unit packing progress.
19. **`frontend/src/screens/PackerOrderScreen.tsx`**:
    - Load order via `GET /api/packer-app/orders/{id}` and available riders via `GET /api/packer-app/riders/available`.
    - Load raw items (`GET /api/packer-app/orders/{id}/items` with `unitPrice`, `taxPercentage`, `taxAmount`, `lineTotal`, `hsn`, `batchId`) when opening the **Order Info** modal.
    - Wire barcode scanning (`scan`) to `POST /api/packer-app/orders/{id}/scan` (`{ barcode }`):
      - On `200 OK` (`data.success === true`): beep success, update `items` from `data.items` and `orderStatus` from `data.orderStatus`.
      - On `400` soft-failure (`data.success === false`): display `data.message` (e.g. `Item has not been picked yet. Cannot pack before picking.`, `Item already fully packed.`, `Cannot pack more than picked quantity...`) via `alertWrongBarcode`, clear input, and refocus.
      - When `data.orderFullyPacked === true` (`orderStatus === "PACKED"`), enable the **Assign Rider** modal (`GET /api/packer-app/riders/available` showing `name`, `phone`, `vehicleType`, `rating`) and submit `POST /api/packer-app/orders/{id}/assign-rider` (`{ riderId, notes }`).
20. **`frontend/src/screens/PackerCompletedScreen.tsx` & `frontend/src/screens/DispatchScreen.tsx`**:
    - Show `PACKED` orders from `GET /api/packer-app/orders/assigned` (ready for rider assignment) plus orders dispatched (`RIDER_ASSIGNED`) during the current session, with direct rider assignment via `POST /api/packer-app/orders/{id}/assign-rider`.

#### G. Profile & Password Management (`picker-app-api.md` §2.7–2.9 & `packer-app-api.md` §2.8–2.10)
21. **`frontend/src/screens/ProfileScreen.tsx`**:
    - Fetch and display `FulfillmentStaffProfileDto`: `staffId`, `name`, `phone`, `email`, `status`, `rating` (star badge), `idCardType`, `idCardNumber`, `address`, and `photoFilePath`.
    - Add **Edit Profile** modal/form calling `PUT /api/{picker|packer}-app/profile` with partial fields (`name`, `phone`, `email`, `address`, `idCardType`, `idCardNumber`, `photoFilePath`).
    - Add **Change Password** modal/form calling `POST /api/{picker|packer}-app/change-password` (`{ currentPassword, newPassword }`, enforcing 6–100 character validation on `newPassword` and surfacing `fieldErrors`).

#### H. Automated Tests
22. **`tests/workflow-hardening.test.mjs`**:
    - Rewrite test suite to verify:
      - Zero Supabase references (`@supabase/supabase-js`, `supabase.rpc`, `supabase.from`) across `frontend/src/`.
      - All 9 Picker endpoints (`/api/picker-app/*`) and 10 Packer endpoints (`/api/packer-app/*`) match the exact paths, HTTP methods, and payload keys in `picker-app-api.md` and `packer-app-api.md`.
      - HTTP 400 scan soft-failure envelope (`{ success: false, data: { success: false, message, barcode } }`) vs. hard `BUSINESS_ERROR` / `VALIDATION_ERROR` envelope handling.
      - Picker scan → `orderFullyPicked` → `assign-packer` flow and Packer scan → `orderFullyPacked` → `assign-rider` flow.

---

## 4. Verification & Quality Gates

1. **TypeScript Verification**: Run `npx tsc --noEmit` inside `frontend/` — must pass with 0 errors.
2. **Contract & Unit Tests**: Run `npm test` inside `frontend/` (`node --test ../tests/*.test.mjs`) — all tests must pass.
3. **Clean Repo Check**: Confirm zero remaining imports or occurrences of `supabase` in `frontend/src/` and `frontend/package.json`.

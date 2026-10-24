# Packer App API — App Integration Guide

Audience: mobile/app developer building the packer (warehouse packing) app.
Base URLs, auth, envelopes and error shapes are the same for every
packer-app endpoint.

- **Base:** `/api/packer-app`
- **Auth:** `Authorization: Bearer <JWT>` — role `ROLE_PACKER`. Token from
  `POST /api/auth/login` (`{ "identifier", "password", "loginMethod": "PASSWORD" }`)
  or the OTP flow (`POST /api/auth/otp/request` → login with
  `loginMethod: "OTP"`, `otp`).
- **Headers:** `Content-Type: application/json`, `Accept: application/json`
- **Identity:** endpoints resolve the packer staff record from the token —
  no packer id is ever sent by the client. The login mobile number must match
  the packer staff record.

## Order lifecycle (packer's slice)

```
PICKING --[picker assigns packer]--> PACKING --[all lines packed]--> PACKED --[packer assigns rider]--> RIDER_ASSIGNED
```

The packer receives orders in `PACKING`, scans them to `PACKED`, then
assigns a rider.

## Envelopes

Success (all endpoints):

```json
{ "success": true, "message": "Assigned orders fetched successfully", "data": [ ... ] }
```

Error:

```json
{
  "traceId": "ab12cd34",
  "error": "BUSINESS_ERROR",
  "message": "Order is not in packing status",
  "status": 400,
  "fieldErrors": null,
  "timestamp": "2026-10-13T12:00:00"
}
```

Validation errors use `"error": "VALIDATION_ERROR"` with
`fieldErrors: [{ "field": "riderId", "message": "Rider ID is required" }]`.

> **Exception — scan soft-failures:** `POST /orders/{id}/scan` returns
> **HTTP 400 with the success envelope** (`"success": false`, `data` =
> partial scan response) for barcode problems, *not* the error envelope.
> Business/ownership failures (below) still use the error envelope.

---

## 1. Objects

### 1.1 Order (`FulfillmentOrderDto`)

Returned by `GET /orders/assigned` (array) and `GET /orders/{id}` (single).

```json
{
  "orderId": 501,
  "orderNumber": "SO-2026-00412",
  "orderStatus": "PACKING",
  "orderDate": "2026-10-13T09:15:00",
  "grandTotal": 2499.00,
  "paymentMethod": "COD",
  "warehouseId": 3,
  "warehouseName": null,
  "customerName": null,
  "customerPhone": null,
  "shippingAddress": null,
  "fulfillmentStaffId": null,
  "fulfillmentStaffName": null,
  "fulfillmentStartedAt": null,
  "fulfillmentCompletedAt": null,
  "pickerId": null,
  "packerId": 21,
  "packerAssignedAt": "2026-10-13T10:10:00",
  "totalItems": 3,
  "totalItemsScanned": 1,
  "items": [ /* OrderItem[] — see 1.2 */ ]
}
```

| Field | Type | Notes |
|---|---|---|
| `orderId` | number | Use as `{id}` path param |
| `orderNumber` | string | Human-readable order ref |
| `orderStatus` | string | Work list: `"PACKING"` (in progress) or `"PACKED"` (ready for rider). `GET /orders/{id}` can return any status, including `"RIDER_ASSIGNED"` after you assign a rider |
| `orderDate` | string | ISO-8601 local datetime |
| `grandTotal` | number | Order total |
| `paymentMethod` | string | e.g. `COD`, `PREPAID` |
| `warehouseId` | number | Order's warehouse |
| `packerId` | number | Me — orders assigned to this packer |
| `packerAssignedAt` | string | ISO-8601 assignment time |
| `totalItems` | number | Number of order lines |
| `totalItemsScanned` | number | Lines **fully packed** (`packedQty >= orderedQty`) — lines, not units |
| `pickerId` | — | Always `null` in packer responses |
| `warehouseName`, `customerName`, `customerPhone`, `shippingAddress`, `fulfillment*` | — | Declared but **always `null`** today — do not render |

`GET /orders/assigned` returns orders with status `PACKING` **or** `PACKED`
(in-progress plus finished-but-unshipped). `GET /orders/{id}` returns the
order in **any** status (404 `NOT_FOUND` `Order not found` if the id doesn't
exist).

### 1.2 Order item (`FulfillmentOrderItemDto`)

Nested in every order (and in the scan response). Packer responses have
**no location fields** — packing happens at the pack station.

```json
{
  "itemId": 9001,
  "productId": 42,
  "variantId": 903,
  "sku": "TSH-M-NVY",
  "productName": "Classic Cotton T-Shirt",
  "variantLabel": "Size: M, Color: Navy",
  "orderedQty": 2,
  "pickedQty": 2,
  "packedQty": 1,
  "fullyScanned": false
}
```

| Field | Type | Notes |
|---|---|---|
| `itemId` | number | `sales_order_items.id` |
| `productId` / `variantId` | number | Catalog identity of the line |
| `sku` | string | Scan/verify against this |
| `productName` / `variantLabel` | string | Display |
| `orderedQty` | number | Qty ordered |
| `pickedQty` | number | Qty picked by the picker (must be > 0 before packing) |
| `packedQty` | number | Qty packed so far (+1 per successful scan) |
| `fullyScanned` | boolean | `packedQty >= orderedQty` |

### 1.3 Scan response (`data` of `POST /orders/{id}/scan`)

```json
{
  "success": true,
  "message": "Item packed successfully.",
  "barcode": "8901234567890",
  "scannedItemName": "Classic Cotton T-Shirt - Size: M, Color: Navy",
  "scannedQty": 1,
  "orderedQty": 2,
  "totalItemsScanned": 0,
  "totalItems": 3,
  "orderStatus": "PACKING",
  "orderFullyPacked": false,
  "scannedAt": "2026-10-13T11:20:05",
  "items": [ /* OrderItem[] with fresh quantities */ ]
}
```

| Field | Type | Notes |
|---|---|---|
| `success` | boolean | Duplicates the envelope `success` |
| `message` | string | Success: `Item packed successfully.` / `All items packed! Order is ready for rider assignment.` |
| `barcode` | string | Echo of the scanned value |
| `scannedItemName` | string | `productName - variantLabel` |
| `scannedQty` | number | Item's `packedQty` **after** this scan |
| `orderedQty` | number | Item's ordered qty |
| `totalItemsScanned` | number | Lines fully packed so far |
| `totalItems` | number | Total lines on the order |
| `orderStatus` | string | `"PACKING"`, or `"PACKED"` after the final scan |
| `orderFullyPacked` | boolean | `true` → order status became `PACKED`; enable "assign rider" |
| `scannedAt` | string | ISO-8601 scan timestamp |
| `items` | OrderItem[] | Re-render the packing list from this |

On a soft-failure: `success:false`, `message` = reason, `barcode` echoed,
all other fields `null`/absent.

### 1.4 Packer stats (`GET /stats`)

```json
{
  "assignedOrders": 3,
  "completedOrders": 5,
  "todayOrdersPacked": 6,
  "todayItemsScanned": 41
}
```

| Field | Type | Notes |
|---|---|---|
| `assignedOrders` | number | My orders still in `PACKING` |
| `completedOrders` | number | My orders now `PACKED` (ready, awaiting a rider — assigning one moves the order to `RIDER_ASSIGNED` and out of this count) |
| `todayOrdersPacked` | number | Distinct orders I scanned at least once **today** |
| `todayItemsScanned` | number | My scan events today (one per successful scan) |

### 1.5 Rider candidate (`data` of `GET /riders/available`)

```json
{
  "id": 31, "name": "Suresh Yadav", "phone": "9812345678",
  "vehicleType": "BIKE", "status": "active", "loginEnabled": true,
  "rating": 4.6, "warehouseId": 3
}
```

Only active riders with login enabled in the packer's warehouse are
returned. App needs `id`, `name`, `phone`, `vehicleType`, `rating`.

### 1.6 Profile (`FulfillmentStaffProfileDto`)

```json
{
  "staffId": 21, "name": "Ravi Kumar", "phone": "9876543210",
  "email": "ravi@example.com", "status": "active", "rating": 4.5,
  "idCardType": "AADHAAR", "idCardNumber": "XXXX-1234",
  "address": "Warehouse 3", "photoFilePath": "staff/ravi.jpg"
}
```

### 1.7 Raw order item (`GET /orders/{id}/items`)

Unlike every other endpoint, this one returns the **raw sales-order item
entity** (more fields, includes pricing/audit). Prefer the embedded
`items` array (§1.2) for packing UI; use this when you need quantities
and pricing.

```json
{
  "id": 9001,
  "salesOrderId": 501,
  "productId": 42,
  "variantId": 903,
  "batchId": null,
  "sku": "TSH-M-NVY",
  "productName": "Classic Cotton T-Shirt",
  "variantLabel": "Size: M, Color: Navy",
  "hsn": null,
  "orderedQty": 2,
  "reservedQty": 2,
  "pickedQty": 2,
  "packedQty": 1,
  "shippedQty": 0,
  "unitPrice": 479.00,
  "discountAmount": 0.00,
  "taxPercentage": 18.00,
  "netUnitPrice": 479.00,
  "taxAmount": 86.22,
  "lineTotal": 958.00,
  "bundleId": null,
  "activeFlag": true,
  "crtBy": 1,
  "updtBy": 12,
  "crtDt": "2026-10-13T09:15:00",
  "updtDt": "2026-10-13T10:02:11"
}
```

### 1.8 History entry (`FulfillmentHistoryDto`)

One row per successful pack scan, inside the page envelope of
`GET /orders/history` (§2.11):

```json
{
  "taskId": 9045, "orderId": 501, "orderNumber": "SO-2026-00412",
  "orderStatus": "PACKED", "itemId": 77, "productName": "Wireless Mouse",
  "variantLabel": "Black", "sku": "WM-BLK-01", "barcode": "8901234567890",
  "scannedQty": 2, "orderedQty": 3, "taskType": "PACK",
  "scannedAt": "2026-10-14T12:40:10"
}
```

| Field | Type | Notes |
|---|---|---|
| `taskId` | number | Fulfillment-task (scan event) id |
| `orderId` / `orderNumber` / `orderStatus` | number / string / enum | Order the scan belongs to |
| `itemId` | number | Sales-order line id |
| `productName` / `variantLabel` / `sku` | string | Item identity (from the order line) |
| `barcode` | string | Barcode scanned |
| `scannedQty` | number | **Cumulative** packed quantity of that line after this scan (`2` in `2/3`) — not a per-scan delta |
| `orderedQty` | number | Ordered quantity of the line |
| `taskType` | enum | `PACK` (always, on this endpoint) |
| `scannedAt` | ISO date-time | When the scan happened |

---

## 2. Endpoints

| # | Method | Path | Payload | Response `data` |
|---|---|---|---|---|
| 2.1 | GET | `/api/packer-app/orders/assigned` | — | `Order[]` |
| 2.2 | GET | `/api/packer-app/orders/{id}` | — | `Order` |
| 2.3 | POST | `/api/packer-app/orders/{id}/scan` | `{ "barcode" }` | `ScanResponse` |
| 2.4 | POST | `/api/packer-app/orders/{id}/assign-rider` | `{ "riderId", "notes"? }` | `"Rider assigned"` |
| 2.5 | GET | `/api/packer-app/orders/{id}/items` | — | `RawItem[]` |
| 2.6 | GET | `/api/packer-app/stats` | — | `Stats` |
| 2.7 | GET | `/api/packer-app/riders/available` | — | `Rider[]` |
| 2.8 | GET | `/api/packer-app/profile` | — | `Profile` |
| 2.9 | PUT | `/api/packer-app/profile` | `Profile` (partial) | `Profile` |
| 2.10 | POST | `/api/packer-app/change-password` | `{ currentPassword, newPassword }` | `"Password updated"` |
| 2.11 | GET | `/api/packer-app/orders/history` | — | page of `HistoryEntry` |
| 2.12 | PUT | `/api/packer-app/profile/status` | — | `Profile` |
| 2.13 | GET | `/api/packer-app/orders/history/count` | — | `number` |

### 2.1 Get assigned orders

```
GET /api/packer-app/orders/assigned
```

No payload. Orders assigned to the logged-in packer with status `PACKING`
or `PACKED`.

```json
{
  "success": true,
  "message": "Assigned orders fetched successfully",
  "data": [ { "orderId": 501, "orderNumber": "SO-2026-00412", "orderStatus": "PACKING", "...": "..." } ]
}
```

### 2.2 Get order detail

```
GET /api/packer-app/orders/{id}
```

Single `Order` (§1.1), message `Order fetched successfully`.
404 `NOT_FOUND` `Order not found` for an unknown id. (No ownership check —
drive the work list from 2.1.)

### 2.3 Scan an item (pack one unit)

```
POST /api/packer-app/orders/{id}/scan
```

Request:

```json
{ "barcode": "8901234567890" }
```

- `barcode` is **required** (`@NotBlank` → 400 `VALIDATION_ERROR`).
- Each successful scan increments the matched line's `packedQty` by **1**
  (one unit per scan) and writes a fulfillment-task + timeline event.
- When every line reaches `packedQty >= orderedQty`, the order
  **auto-transitions to `PACKED`** and `data.orderFullyPacked` is `true`.
- **200** → `success: true`, message `Item packed successfully.` or
  `All items packed! Order is ready for rider assignment.`
- **400 (success envelope, `success: false`)** → barcode/quantity problem,
  see §3.
- **400/404 (error envelope)** → business/ownership/order problems, see §3.

Cannot pack before picking: the line must have `pickedQty > 0`.

### 2.4 Assign rider (PACKED → RIDER_ASSIGNED)

```
POST /api/packer-app/orders/{id}/assign-rider
```

Request:

```json
{ "riderId": 31, "notes": "Handle with care" }
```

| Field | Rules |
|---|---|
| `riderId` | **Required** (`@NotNull` → 400 `VALIDATION_ERROR` `Rider ID is required`). Pick from `GET /riders/available`. |
| `notes` | Optional string. Accepted but **currently not stored** by the service. |

Response `data`:

```json
"Rider assigned"
```

(message `Rider assigned successfully`.) Preconditions — 400
`BUSINESS_ERROR`: order status must be `PACKED`, order assigned to you,
every line `packedQty >= orderedQty`, no active rider assignment yet, and
the rider exists, is available, and belongs to the order's warehouse
(exact messages in §3).

### 2.5 Get order items (raw)

```
GET /api/packer-app/orders/{id}/items
```

Returns `RawItem[]` (§1.7), message `Order items fetched successfully`.
404 `NOT_FOUND` `Order not found` for unknown/inactive orders.

### 2.6 Get stats

```
GET /api/packer-app/stats
```

Returns the stats object (§1.4), message `Stats fetched successfully`.

### 2.7 Get available riders

```
GET /api/packer-app/riders/available
```

Returns `Rider[]` (§1.5), message `Available riders fetched successfully`.

### 2.8 Get profile

```
GET /api/packer-app/profile
```

Returns `Profile` (§1.6), message `Profile fetched successfully`.
400 `BUSINESS_ERROR` `Packer staff not found for this user` if no packer
staff record matches the login mobile.

### 2.9 Update profile

```
PUT /api/packer-app/profile
```

Request — **partial update**, send only the fields to change:

```json
{ "name": "Ravi Kumar", "phone": "9876543210", "address": "Warehouse 3" }
```

Updatable: `name`, `phone`, `email`, `address`, `idCardType`,
`idCardNumber`, `photoFilePath` (a `null`/absent field is left unchanged;
`staffId`, `status`, `rating` are read-only). Returns the full updated
profile, message `Profile updated successfully`.

### 2.10 Change password

```
POST /api/packer-app/change-password
```

> There is **no** `PUT /profile/password` — this is the only password
> endpoint.

Request:

```json
{ "currentPassword": "old-pass-1", "newPassword": "new-pass-1" }
```

| Field | Rules |
|---|---|
| `currentPassword` | Required — a blank value → 400 `VALIDATION_ERROR` `Current password is required`. Must match the stored password; the match check is skipped only when the account is OTP-only. |
| `newPassword` | Required — `New password is required`; 6–100 chars → `New password must be 6-100 characters` (both 400 `VALIDATION_ERROR`). |

Response `data`: `"Password updated"` (message
`Password updated successfully`). Errors: `Current password is incorrect`
(400 `BUSINESS_ERROR`; also `Login record not found` if the account has no
active login row).

### 2.11 Get packing history

```
GET /api/packer-app/orders/history?page=0&size=20[&orderId=501]
```

Paged list of everything the logged-in packer has scanned, newest first.
Staff scope comes from the token — no packer id is sent.

| Query param | Default | Notes |
|---|---|---|
| `page` | `0` | Zero-based page index (negatives clamped to `0`) |
| `size` | `20` | Page size, capped at `100` |
| `orderId` | — | Optional: only scans for one order |

Response `data` is the standard page envelope with `content` (array of
`HistoryEntry`, §1.8) plus `totalElements`, `totalPages`, `last`, `number`,
`size`, … Message `Pack history fetched successfully`.

```json
{
  "success": true,
  "message": "Pack history fetched successfully",
  "data": {
    "content": [ { "taskId": 9045, "orderNumber": "SO-2026-00412", "...": "..." } ],
    "totalElements": 41, "totalPages": 3, "last": false, "number": 0, "size": 20
  }
}
```

> Rows with `taskType: null` (scans recorded before the `taskType` column
> existed and whose order's packer changed afterwards) are excluded.

### 2.12 Toggle status (active / inactive)

```
PUT /api/packer-app/profile/status
```

No payload. Toggles the logged-in packer's staff status between `active` and
`inactive`. This flips **only the staff record** — the account's login stays
enabled, so `GET /available-packers` still returns this packer; the picker
app renders them **disabled** as `Off Duty`, and they disappear from that
list only when an admin disables the login. Returns the full updated
`Profile` (§1.6), message
`Status updated to active` / `Status updated to inactive`.

### 2.13 Get packing history order count

```
GET /api/packer-app/orders/history/count
```

Distinct number of **orders** the logged-in packer has scan history for (NOT
the scan-row count). This is the value the dashboard History tab badge shows —
the history list groups scan rows by order, so `totalElements` from §2.11 can
be larger than the number of cards rendered. Response `data` is a plain
integer, message `Pack history order count fetched successfully`.

```json
{ "success": true, "message": "Pack history order count fetched successfully", "data": 2 }
```

---

## 3. Errors to handle

**Scan soft-failures** — HTTP 400, success envelope with `success: false`,
`data.message`:

| `data.message` | Meaning |
|---|---|
| `Barcode not found. Please register this barcode first.` | Unknown barcode |
| `This barcode is not a product barcode.` | Barcode points at a non-variant entity |
| `Product variant not found for this barcode.` | Dangling barcode reference |
| `This barcode does not belong to this order.` | Right product, wrong order |
| `Item has not been picked yet. Cannot pack before picking.` | `pickedQty == 0` |
| `Item already fully packed.` | `packedQty >= orderedQty` — line complete |
| `Cannot pack more than picked quantity. Picked: {n}, Packed: {m}` | Packing ahead of picking |

**Hard failures** — error envelope:

| Status | `error` | `message` |
|---|---|---|
| 400 | `BUSINESS_ERROR` | `Order is not in packing status` |
| 400 | `BUSINESS_ERROR` | `This order is not assigned to you` |
| 400 | `BUSINESS_ERROR` | `Order must be fully packed before assigning a rider` |
| 400 | `BUSINESS_ERROR` | `Not all items have been fully packed` |
| 400 | `BUSINESS_ERROR` | `This order already has an active rider assignment` |
| 400 | `BUSINESS_ERROR` | `Rider not found with id: {id}` |
| 400 | `BUSINESS_ERROR` | `Rider is not available (status: {status})` |
| 400 | `BUSINESS_ERROR` | `Rider does not belong to the order's warehouse` |
| 400 | `BUSINESS_ERROR` | `Current password is incorrect` |
| 400 | `BUSINESS_ERROR` | `Login record not found` (change-password; account has no active login row) |
| 400 | `VALIDATION_ERROR` | `Barcode is required`, `Rider ID is required`, `Current password is required`, `New password is required`, `New password must be 6-100 characters` (see `fieldErrors`) |
| 404 | `NOT_FOUND` | `Order not found` |
| 401 | `UNAUTHORIZED` | missing/expired token |
| 400 | `BUSINESS_ERROR` | `Packer staff not found for this user` (token's mobile has no packer record) |

> A blank/whitespace `barcode` never reaches the scan logic — it is rejected
> by validation (`Barcode is required`, `VALIDATION_ERROR`) before any
> soft-failure can occur.

---

## 4. Recommended app flow

1. **Login** → `POST /api/auth/login`, store `token`; verify role
   `ROLE_PACKER`.
2. **Dashboard** → `GET /stats` for counters, `GET /orders/assigned` for
   the queue (`PACKING` = in progress, `PACKED` = ready for rider).
3. **Open an order** → use the embedded `items` (or `GET /orders/{id}` for
   refresh); show `pickedQty`/`packedQty`/`orderedQty` per line.
4. **Pack loop** → `POST /orders/{id}/scan` per unit:
   - `success: true` → update quantities from `data.items`, beep OK;
   - `success: false` → show `data.message`, stay on the same screen;
   - envelope error → show `message`, on `401` re-login.
5. When `data.orderFullyPacked === true` (status `PACKED`) → **Assign
   rider**: `GET /riders/available` → user picks →
   `POST /orders/{id}/assign-rider` with `{ "riderId" }`. The order leaves
   the active queue (`PACKED` → `RIDER_ASSIGNED`).
6. Repeat from step 2.

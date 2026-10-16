# Picker App API — App Integration Guide

Audience: mobile/app developer building the picker (warehouse picking) app.
Base URLs, auth, envelopes and error shapes are the same for every
picker-app endpoint.

- **Base:** `/api/picker-app`
- **Auth:** `Authorization: Bearer <JWT>` — role `ROLE_PICKER`. Token from
  `POST /api/auth/login` (`{ "identifier", "password", "loginMethod": "PASSWORD" }`)
  or the OTP flow (`POST /api/auth/otp/request` → login with
  `loginMethod: "OTP"`, `otp`).
- **Headers:** `Content-Type: application/json`, `Accept: application/json`
- **Identity:** endpoints resolve the picker staff record from the token —
  no picker id is ever sent by the client. The login mobile number must match
  the picker staff record.

## Order lifecycle (picker's slice)

```
CONFIRMED --[admin assigns picker]--> PICKING --[picker assigns packer]--> PACKING
```

The picker only ever sees orders in `PICKING` (work list) and pushes them to
`PACKING` after every line is fully picked and a packer is chosen.

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
  "message": "Order is not in picking status",
  "status": 400,
  "fieldErrors": null,
  "timestamp": "2026-10-13T12:00:00"
}
```

Validation errors use `"error": "VALIDATION_ERROR"` with
`fieldErrors: [{ "field": "newPassword", "message": "size must be between 6 and 100" }]`.

> **Exception — scan soft-failures:** `POST /orders/{id}/scan` returns
> **HTTP 400 with the success envelope** (`"success": false`, `data` =
> partial scan response) for barcode problems, *not* the error envelope.
> Business/ownership failures (below) still use the error envelope.

---

## 1. Objects

### 1.1 Order (`FulfillmentOrderDto`)

Returned by `GET /orders/assigned` (as an array).

```json
{
  "orderId": 501,
  "orderNumber": "SO-2026-00412",
  "orderStatus": "PICKING",
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
  "pickerId": 12,
  "packerId": null,
  "packerAssignedAt": null,
  "totalItems": 3,
  "totalItemsScanned": 1,
  "items": [ /* OrderItem[] — see 1.2 */ ]
}
```

| Field | Type | Notes |
|---|---|---|
| `orderId` | number | Use as `{id}` path param |
| `orderNumber` | string | Human-readable order ref |
| `orderStatus` | string | `"PICKING"` for this list |
| `orderDate` | string | ISO-8601 local datetime |
| `grandTotal` | number | Order total |
| `paymentMethod` | string | e.g. `COD`, `PREPAID` |
| `warehouseId` | number | Order's warehouse |
| `pickerId` / `packerId` | number \| null | `packerId` is `null` until assigned |
| `packerAssignedAt` | string \| null | ISO-8601 once a packer is assigned |
| `totalItems` | number | Number of order lines |
| `totalItemsScanned` | number | Lines **fully picked** (`pickedQty >= orderedQty`) — lines, not units |
| `warehouseName`, `customerName`, `customerPhone`, `shippingAddress`, `fulfillment*` | — | Declared but **always `null`** today — do not render |

### 1.2 Order item (`FulfillmentOrderItemDto`)

Nested in every order, and the response item list of scan/items endpoints.
Picker responses include **pick-location fields**.

```json
{
  "itemId": 9001,
  "productId": 42,
  "variantId": 903,
  "sku": "TSH-M-NVY",
  "productName": "Classic Cotton T-Shirt",
  "variantLabel": "Size: M, Color: Navy",
  "orderedQty": 2,
  "pickedQty": 1,
  "packedQty": 0,
  "fullyScanned": false,
  "zone": "A",
  "aisle": "03",
  "rack": "R2",
  "bin": "B7",
  "shelf": "S1",
  "locationCode": "A-03-R2-B7-S1"
}
```

| Field | Type | Notes |
|---|---|---|
| `itemId` | number | `sales_order_items.id` |
| `productId` / `variantId` | number | Catalog identity of the line |
| `sku` | string | Scan/verify against this |
| `productName` / `variantLabel` | string | Display |
| `orderedQty` | number | Qty ordered |
| `pickedQty` | number | Qty picked so far (+1 per successful scan) |
| `packedQty` | number | Always `0` in picker responses (packer fills it) |
| `fullyScanned` | boolean | `pickedQty >= orderedQty` |
| `zone`, `aisle`, `rack`, `bin`, `shelf`, `locationCode` | string \| null | Pick location from warehouse inventory; `null` if no inventory row/location |

### 1.3 Scan response (`data` of `POST /orders/{id}/scan`)

```json
{
  "success": true,
  "message": "Item scanned successfully.",
  "barcode": "8901234567890",
  "scannedItemName": "Classic Cotton T-Shirt - Size: M, Color: Navy",
  "scannedQty": 1,
  "orderedQty": 2,
  "totalItemsPicked": 0,
  "totalItems": 3,
  "orderStatus": "PICKING",
  "orderFullyPicked": false,
  "scannedAt": "2026-10-13T10:02:11",
  "items": [ /* OrderItem[] with fresh quantities + locations */ ]
}
```

| Field | Type | Notes |
|---|---|---|
| `success` | boolean | Duplicates the envelope `success` |
| `message` | string | Success: `Item scanned successfully.` / `All items picked! Order is ready for packing.` |
| `barcode` | string | Echo of the scanned value (`null` on empty-barcode error) |
| `scannedItemName` | string | `productName - variantLabel` |
| `scannedQty` | number | Item's `pickedQty` **after** this scan |
| `orderedQty` | number | Item's ordered qty |
| `totalItemsPicked` | number | Lines fully picked so far |
| `totalItems` | number | Total lines on the order |
| `orderStatus` | string | Always `"PICKING"` here |
| `orderFullyPicked` | boolean | `true` → prompt picker to assign a packer |
| `scannedAt` | string | ISO-8601 scan timestamp |
| `items` | OrderItem[] | Re-render the pick list from this |

On a soft-failure: `success:false`, `message` = reason, `barcode` echoed,
all other fields `null`/absent.

### 1.4 Picker stats (`GET /stats`)

```json
{ "assignedOrdersCount": 4, "completedOrdersCount": 7, "totalItemsPickedToday": 53 }
```

| Field | Type | Notes |
|---|---|---|
| `assignedOrdersCount` | number | Orders assigned to me in `PICKING` **or** `PACKING` |
| `completedOrdersCount` | number | Distinct orders I scanned at least once **today** |
| `totalItemsPickedToday` | number | My scan events today (one per successful scan) |

### 1.5 Packer candidate (`data` of `GET /available-packers`)

```json
{
  "id": 21, "name": "Ravi Kumar", "phone": "9876543210",
  "email": "ravi@example.com", "status": "active", "loginEnabled": true,
  "currentLatitude": null, "currentLongitude": null, "rating": 4.5,
  "idCardType": "AADHAAR", "idCardNumber": "XXXX-1234",
  "idCardFilePath": null, "photoFilePath": "staff/ravi.jpg",
  "address": "Warehouse 3", "remarks": null, "warehouseId": 3,
  "activeFlag": true, "crtBy": 1, "lstUpdtBy": 1,
  "crtDt": "2026-08-01T11:00:00", "lstUpdtDt": "2026-10-01T09:00:00"
}
```

Only active packers with login enabled in the picker's warehouse are
returned. App needs only `id`, `name`, `phone`, `rating`, `photoFilePath`.

### 1.6 Profile (`FulfillmentStaffProfileDto`)

```json
{
  "staffId": 12, "name": "Amit Verma", "phone": "9876501234",
  "email": "amit@example.com", "status": "active", "rating": 4.8,
  "idCardType": "AADHAAR", "idCardNumber": "XXXX-5678",
  "address": "Delhi", "photoFilePath": "staff/amit.jpg",
  "warehouseId": 3, "warehouseName": "Warehouse 3"
}
```

The profile response must include the authenticated picker's actual `warehouseId` and `warehouseName`. Return explicit `null` values when unassigned; do not encode warehouse identity in `address` or infer it from the address.

---

## 2. Endpoints

| # | Method | Path | Payload | Response `data` |
|---|---|---|---|---|
| 2.1 | GET | `/api/picker-app/orders/assigned` | — | `Order[]` |
| 2.2 | GET | `/api/picker-app/orders/completed` | - | `Order[]` |
| 2.3 | POST | `/api/picker-app/orders/{id}/scan` | `{ "barcode" }` | `ScanResponse` |
| 2.4 | POST | `/api/picker-app/orders/{id}/assign-packer` | `{ "packerId" }` | `"Packer assigned"` |
| 2.5 | GET | `/api/picker-app/orders/{id}/items` | — | `OrderItem[]` |
| 2.6 | GET | `/api/picker-app/stats` | — | `Stats` |
| 2.7 | GET | `/api/picker-app/available-packers` | — | `PackerStaff[]` |
| 2.8 | GET | `/api/picker-app/profile` | — | `Profile` |
| 2.9 | PUT | `/api/picker-app/profile` | `Profile` (partial) | `Profile` |
| 2.10 | POST | `/api/picker-app/change-password` | `{ currentPassword, newPassword }` | `"Password updated"` |

### 2.1 Get assigned orders

```
GET /api/picker-app/orders/assigned
```

No payload. Orders assigned to the logged-in picker with status `PICKING`.

```json
{
  "success": true,
  "message": "Assigned orders fetched successfully",
  "data": [ { "orderId": 501, "orderNumber": "SO-2026-00412", "orderStatus": "PICKING", "...": "..." } ]
}
```

### 2.2 Get completed picking orders

```http
GET /api/picker-app/orders/completed
```

No payload. Returns orders assigned to the authenticated picker that have moved beyond `PICKING` (`PACKING`, `PACKED`, or `RIDER_ASSIGNED`). This list is server-authoritative and remains available after app restarts or login on another device. Only picker-role sessions may call this endpoint.

### 2.3 Scan an item (pick one unit)

```
POST /api/picker-app/orders/{id}/scan
```

Request:

```json
{ "barcode": "8901234567890" }
```

- `barcode` is **required** (`@NotBlank` → 400 `VALIDATION_ERROR`).
- Each successful scan increments the matched line's `pickedQty` by **1**
  (one unit per scan) and writes a fulfillment-task + timeline event.
- **200** → `success: true`, message `Item scanned successfully.` or
  `All items picked! Order is ready for packing.`
- **400 (success envelope, `success: false`)** → barcode problem, see §3.
- **400/404 (error envelope)** → business/ownership/order problems, see §3.

When `data.orderFullyPicked` is `true`, move the app to the
"assign packer" step (2.3).

### 2.3 Assign packer (PICKING → PACKING)

```
POST /api/picker-app/orders/{id}/assign-packer
```

Request:

```json
{ "packerId": 21 }
```

`packerId` is required (missing → 400 `BUSINESS_ERROR` `packerId is required`).
Pick it from `GET /available-packers`.

Response `data`:

```json
"Packer assigned"
```

(message `Packer assigned successfully`.) Preconditions — all enforced with
400 `BUSINESS_ERROR`: order in `PICKING`, order assigned to you, packer
exists & active, packer in the order's warehouse, **all lines fully picked**.

### 2.4 Get order items

```
GET /api/picker-app/orders/{id}/items
```

Returns `OrderItem[]` (§1.2) with pick locations. Message
`Order items fetched successfully`. 404 `NOT_FOUND` if the order doesn't exist.

### 2.5 Get stats

```
GET /api/picker-app/stats
```

Returns the stats object (§1.4), message `Stats fetched successfully`.

### 2.6 Get available packers

```
GET /api/picker-app/available-packers
```

Returns `PackerStaff[]` (§1.5), message
`Available packers fetched successfully`.

### 2.7 Get profile

```
GET /api/picker-app/profile
```

Returns `Profile` (§1.6), message `Profile fetched successfully`.
400 `BUSINESS_ERROR` `Staff not found` if no picker staff record matches
the login mobile.

### 2.8 Update profile

```
PUT /api/picker-app/profile
```

Request — **partial update**, send only the fields to change:

```json
{ "name": "Amit Verma", "phone": "9876501234", "address": "New Delhi" }
```

Updatable: `name`, `phone`, `email`, `address`, `idCardType`,
`idCardNumber`, `photoFilePath` (a `null`/absent field is left unchanged;
`staffId`, `status`, `rating` are read-only). Returns the full updated
profile, message `Profile updated successfully`.

### 2.9 Change password

```
POST /api/picker-app/change-password
```

Request:

```json
{ "currentPassword": "old-pass-1", "newPassword": "new-pass-1" }
```

| Field | Rules |
|---|---|
| `currentPassword` | Required (`@NotBlank`); must match the stored password. Skipped only when the account is OTP-only. |
| `newPassword` | Required, 6–100 chars. |

Response `data`: `"Password updated"` (message
`Password updated successfully`). Errors: `Current password is required`,
`Current password is incorrect` (400 `BUSINESS_ERROR`).

---

## 3. Errors to handle

**Scan soft-failures** — HTTP 400, success envelope with `success: false`,
`data.message`:

| `data.message` | Meaning |
|---|---|
| `Empty barcode. Please scan again.` | Blank/whitespace barcode |
| `Barcode not found. Please register this barcode first.` | Unknown barcode |
| `This barcode is not a product barcode.` | Barcode points at a non-variant entity |
| `Product variant not found for this barcode.` | Dangling barcode reference |
| `This barcode does not belong to this order.` | Right product, wrong order |
| `Item already fully scanned.` | `pickedQty >= orderedQty` — line complete |

**Hard failures** — error envelope:

| Status | `error` | `message` |
|---|---|---|
| 400 | `BUSINESS_ERROR` | `Order is not in picking status` |
| 400 | `BUSINESS_ERROR` | `This order is not assigned to you` |
| 400 | `BUSINESS_ERROR` | `packerId is required` |
| 400 | `BUSINESS_ERROR` | `Packer not found with id: {id}` |
| 400 | `BUSINESS_ERROR` | `Packer does not belong to the order's warehouse` |
| 400 | `BUSINESS_ERROR` | `Not all items have been picked yet` |
| 400 | `BUSINESS_ERROR` | `Current password is required` / `Current password is incorrect` |
| 400 | `VALIDATION_ERROR` | blank `barcode`, short `newPassword` (see `fieldErrors`) |
| 400/404 | `NOT_FOUND` | `Order not found` |
| 401 | `UNAUTHORIZED` | missing/expired token |
| 400 | `BUSINESS_ERROR` | `Picker staff not found for this user` (token's mobile has no picker record) |

---

## 4. Recommended app flow

1. **Login** → `POST /api/auth/login`, store `token`; verify role
   `ROLE_PICKER`.
2. **Dashboard** → `GET /stats` for counters, `GET /orders/assigned` for the
   work list.
3. **Open an order** → `GET /orders/{id}/items` (or use the embedded
   `items` from the list) and show `locationCode`/`zone`/`aisle`… per line.
4. **Pick loop** → `POST /orders/{id}/scan` per unit:
   - `success: true` → update quantities from `data.items`, beep OK;
   - `success: false` → show `data.message`, stay on the same screen;
   - envelope error → show `message`, on `401` re-login.
5. When `data.orderFullyPicked === true` → **Assign packer**:
   `GET /available-packers` → user picks → `POST /orders/{id}/assign-packer`.
   Order leaves the picker's list (`PICKING` → `PACKING`).
6. Repeat from step 2. Use `Accept-Language`-independent strings from the
   server only as fallback — localize the known messages client-side.

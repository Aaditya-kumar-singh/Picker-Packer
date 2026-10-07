# Picker Flow Update Report

Date: 2026-10-07
Scope: YBM Picker workflow only
Reference: supplied WMS picker screenshots and current React Native/Expo implementation

## 1. Exact target Picker flow

The Picker UI must follow the screenshot sequence without adding workflow steps:

```
LOGIN
  ↓
PICKER DASHBOARD
  ↓
ASSIGNED ORDERS
  ↓
SELECT ORDER
  ↓
ORDER DETAILS
  ↓
START PICKING
  ↓
SCAN LOCATION
  ↓
SCAN SKU / PRODUCT
  ↓
QUANTITY
  ↓
More items?
  ├─ YES → LOCATION → SKU → QUANTITY → repeat
  └─ NO  → COMPLETE PICKING
             ↓
        READY_FOR_PACKING
```

The three verification stages remain separate screens:

1. Location scan
2. SKU/product scan
3. Quantity confirmation

The exception screen is an alternate branch only:

```
LOCATION → exception → resolve → continue
SKU      → exception → resolve → continue
QUANTITY → short/problem → exception → resolve → continue
```

## 2. REMOVE

### Dashboard
- Duplicate picker profile block.
- Duplicate connectivity presentation.
- ACTIVE PICK RUN hero as a separate large workflow block.
- Quick Actions section.
- View Orders CTA duplication.

### Assigned Orders
- Unassigned filter.
- Claim Order UI.
- Fake SCAN ORDER TOTE action.
- Any action that creates a new workflow step not present in the screenshots.

### Order Details
- Picker-side claim/assignment workflow from the visible Picker flow.
- Keep the screen focused on order details and START PICKING.

### Completion
- WMS simulation controls from the normal Picker UI.
- Packer selection/assignment.
- Any extra handoff screen.

## 3. MODIFY

### Dashboard
Show the compact productivity information required by the design:
- Assigned
- Completed
- Items Picked Today

If an order is currently in progress, show a compact resume entry, not a new workflow stage.

### Assigned Orders
Each assigned order card should expose:
- Order ID
- Location
- Status
- Item count
- Picked/required progress
- SLA

Search may match:
- Order ID
- SKU
- Product name
- Location

### Order Details
Show:
- Order ID
- Status
- Pick lines
- Location
- Product barcode
- Required/picked quantity
- START PICKING for an assigned order

### Location Scan
Keep as a separate screen with:
- Expected location barcode
- Type/manual input
- Camera scan
- Copy barcode
- Server validation
- Wrong-location rejection

### SKU Scan
Keep as a separate screen with:
- Expected product barcode
- Type/manual input
- Camera scan
- Copy barcode
- Server validation
- Wrong-SKU rejection

### Quantity
Keep as a separate screen with:
- Required quantity
- Picked quantity
- Quantity input
- Confirm Quantity
- Over-pick rejection
- Short pick routed to Exception

### Completion
Keep an explicit COMPLETE PICKING action. After successful completion, show READY_FOR_PACKING and return to the normal Picker navigation.

## 4. KEEP

- Location validation
- Product barcode validation
- Quantity validation
- Over-pick rejection
- Short-pick exceptions
- Idempotency
- Warehouse isolation
- Picker role enforcement
- Scan/audit events
- Offline queue/replay
- SKU/name/specs/barcode/location data
- Camera scanner
- Manual/type barcode entry
- Copy barcode
- Exception evidence
- Separate Location → SKU → Quantity screens

## 5. Explicitly forbidden additions

Do not add:
- Select Packer
- Assign Packer
- picker_assign_packer RPC
- Packer selection modal
- Recent Scans as a workflow step
- Combined Location + SKU + Quantity screen
- Scan Order Tote workflow
- Any additional confirmation/handoff step

## 6. Final acceptance flow

```
LOGIN
  ↓
PICKER DASHBOARD
  ↓
ASSIGNED ORDERS
  ↓
SELECT ORDER
  ↓
ORDER DETAILS
  ↓
START PICKING
  ↓
SCAN LOCATION
  ↓
SCAN SKU
  ↓
QUANTITY
  ↓
NEXT PRODUCT
  ↓
SCAN LOCATION
  ↓
SCAN SKU
  ↓
QUANTITY
  ↓
...
  ↓
COMPLETE PICKING
  ↓
READY_FOR_PACKING
```

The database/backend state machine remains authoritative. The UI must never skip or merge the server-validated Location → SKU → Quantity sequence.

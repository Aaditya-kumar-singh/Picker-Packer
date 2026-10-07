# Picker Flow Update Report

Date: 2026-10-07
Scope: YBM Picker workflow only
Reference: supplied WMS picker screenshots plus current React Native/Expo implementation

## 1. Target picker flow

The target experience is a compact warehouse picking workflow:
1. Picker opens the assigned work queue.
2. Picker selects an assigned order.
3. Order screen shows order ID, location, progress and product lines.
4. Barcode area supports expected barcode, type/paste, camera scan and copy.
5. Successful scan updates the active line immediately.
6. Product lines show required/picked quantity and completion state.
7. Recent scans are visible for operator confidence/audit.
8. Once all lines are resolved, the picker hands the order to a packer.
9. Packer selection is a picker-side handoff step.
10. Order moves to READY_FOR_PACKING.

The backend should continue enforcing the strict state machine:
Location validation -> Product barcode validation -> Quantity -> Next line -> Completion.

## 2. REMOVE from current Picker UI

### A. Dashboard active-pick hero
Remove the large ACTIVE PICK RUN / IN PROGRESS / RESUME PICKING card as a separate block. The assigned order list should be the work queue.

### B. Duplicate picker profile block
Remove the Dashboard avatar/name/warehouse block because the persistent BrandHeader already provides identity and workspace context.

### C. Duplicate sync presentation
Remove the duplicate combination of SyncBadge, OfflineBanner, second online/offline banner and last-sync text. Keep one compact connectivity indicator and show the offline banner only for a real offline/server-unreachable state.

### D. Quick Actions
Remove the separate Quick Actions section and View Orders button. Orders should be immediately visible and actionable.

### E. PENDING / CLAIM UI
Remove Unassigned/Claim UI from the Picker queue. The current Supabase picker query returns orders assigned to the current picker, so this UI does not match the production data flow.

### F. Fake SCAN ORDER TOTE button
Remove the bottom SCAN ORDER TOTE dock until tote scanning has a real backend workflow.

### G. WMS simulation controls
Keep test-only code if needed, but remove WMS simulation controls from normal Picker UX.

### H. Large generic completion screen
Replace the generic completion page with a compact All Items Picked -> Assign Packer handoff.

## 3. MODIFY

### A. Dashboard metrics
Current: Assigned, Completed, Queued Sync, In Progress.
Target: Assigned, Completed, Items Picked Today.
The existing PickerMetrics.totalPickedQty can supply Items Picked Today.

### B. Assigned order cards
Show Order ID, Location, Status, item count, picked/required count, progress bar, barcode input and Scan action.

### C. Search
The current placeholder says Search Order ID, Tote, or SKU, but the implementation only searches externalId. Either change the text or implement Order ID + SKU + product name + location search. Preferred: implement all four.

### D. Order detail / picking workspace
Keep the strict backend sequence but consolidate the operator experience into one compact Pick Order workspace where possible. The operator should see order ID, status, location, progress, expected barcode, type/scan/copy controls, current product, quantity, item list, recent scans and exception action.

### E. Product line cards
Make Product name and Required/Picked primary. Keep SKU, specs, barcode and location secondary. Make the active line prominent and completed lines compact.

### F. Quantity
Move quantity into the active-line workspace: Required / Picked / Remaining, quantity input and Confirm Quantity. Short picks continue to the existing exception workflow.

### G. Recent scans
Add a compact Recent Scans section with time, barcode, product and result.

### H. Success/error feedback
Use a compact inline status panel. Success should show Item scanned successfully plus product and quantity. Failure should show Wrong barcode plus the expected barcode.

## 4. ADD

### A. Picker-side Assign Packer
After all items are picked, show ALL ITEMS PICKED and ASSIGN PACKER. Open a modal/list containing packer name, employee/phone identifier, ACTIVE status and warehouse. Allow selection and assignment.

### B. Packer list API
Add a warehouse-scoped active-packer query. Never expose packers from another warehouse.

### C. Assign-packer RPC
Add a protected picker_assign_packer(order_id, packer_id, idempotency_key) mutation. Validate picker role, same warehouse, active packer, picker ownership, fully picked order, correct state and idempotency. Then move the order to READY_FOR_PACKING.

### D. Items picked today
Expose totalPickedQty as the dashboard metric.

### E. Product barcode data
Already implemented: expected barcode, type, scan, copy and match feedback. Continue using this shared component.

## 5. KEEP

Keep location validation, product barcode validation, quantity validation, over-pick rejection, short-pick exceptions, idempotency, warehouse isolation, picker role enforcement, scan/audit events, offline queue/replay, SKU/name/type/specs/barcode/location data, camera scanner, exception photo evidence and offline functionality.

## 6. Current picker gaps

1. Dashboard does not present Items Picked Today as a first-class metric.
2. Dashboard duplicates identity and connectivity UI.
3. Orders has filters that do not match the actual Supabase picker query.
4. Orders search only searches Order ID despite claiming SKU/Tote support.
5. Scan Order Tote is non-functional.
6. Picker-side Assign Packer is missing.
7. Completion ends at READY_FOR_PACKING without selecting a specific packer.
8. Quantity is a separate screen instead of an inline active-line operation.
9. Recent scans are missing from the main picking workspace.
10. Barcode verification is shared, but the whole picking operation is still spread across multiple screens.
11. The Supabase adapter still carries older claim/begin interface complexity that can be simplified during picker consolidation.
12. Dashboard active progress uses a fixed 33% width instead of calculated progress.

## 7. Recommended implementation order

### P1: Picker queue
1. Redesign Dashboard around Assigned / Completed / Items Picked Today.
2. Remove duplicate profile, sync and Quick Actions UI.
3. Make assigned order cards compact.
4. Remove unreachable Unassigned/Claim UI.
5. Implement real SKU/product/location search.

### P2: Unified picking workspace
1. Keep location validation.
2. Keep product barcode validation.
3. Keep type/scan/copy barcode component.
4. Add inline quantity.
5. Add Recent Scans.
6. Add compact success/error status.
7. Calculate progress dynamically.

### P3: Completion handoff
1. Replace generic completion action with All Items Picked state.
2. Add Select Packer modal.
3. Add active same-warehouse packer list.
4. Add picker_assign_packer RPC.
5. Move order to READY_FOR_PACKING only after assignment.
6. Show assigned packer confirmation.

### P4: Cleanup
1. Remove obsolete picker routes/components after migration.
2. Remove unused claim/begin UI.
3. Remove DEV WMS controls from production-visible flow.
4. Re-run TypeScript and workflow tests.
5. Test complete Picker -> Packer handoff.

## 8. Target final Picker flow

Login
  -> Picker Dashboard
  -> Assigned Orders
  -> Open Order
  -> Pick Workspace
     - Location barcode: Type / Scan / Copy
     - Product barcode: Type / Scan / Copy
     - Quantity
     - Recent Scans
     - Exception if required
  -> All Items Picked
  -> Select Packer
  -> Packer Assigned
  -> READY_FOR_PACKING
  -> Packer continues the workflow

The database state machine remains strict even though the UI becomes more compact.
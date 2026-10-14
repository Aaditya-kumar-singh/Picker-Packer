# YBM Picker & Packer Mobile App

Cross-platform React Native + Expo warehouse execution system (Android, iOS & Web) for **Picker** and **Packer** operations, backed by Supabase PostgreSQL RPCs, Row-Level Security (RLS), and a durable SQLite offline outbox.

## Core Architecture

- **Role-Separated Navigation (`src/app/_layout.tsx` & `src/app/(tabs)/_layout.tsx`)**:
  - **Picker** (`PICKER`): Dashboard, Assigned Orders, Completed Orders, Profile, Picking Order Detail (with inline Quick-Scan & Zone Batches modals), Item Barcode Scan (`SkuScanScreen`), Exception & Photo Evidence (`ExceptionScreen`), and Order Completion (`CompletionScreen`).
  - **Packer** (`PACKER`): Packer Dashboard, Assigned Packing Orders, Completed Packing Orders, Profile, Packing Order Verification (`PackerOrderScreen`), and Courier Dispatch (`DispatchScreen`).
- **Unit-by-Unit Barcode Enforcement**:
  - Every physical item barcode scan validates the SKU and records `1` unit via server RPC (`picker_pick_item` / `packer_confirm_item`).
  - Wrong or mismatched barcode scans immediately trigger haptic feedback (`beepError`), display a cross-platform alert (`alertWrongBarcode`), and automatically clear and re-focus the barcode input field.
- **Offline-First SQLite Outbox (`src/sync/` & `src/storage/`)**:
  - `OfflineFirstPickerApi` caches active order snapshots in SQLite (`expo-sqlite`) and queues offline mutations (`ORDER_STARTED`, `LOCATION_SCANNED`, `SKU_SCANNED`, `QTY_CONFIRMED`, `EXCEPTION_RAISED`, `ORDER_COMPLETED`) with idempotency keys for automatic background replay via `SyncEngine`.

## Quick Start

```powershell
cd "C:\Users\WHITE-SNAKE\Desktop\picker And Packer\frontend"
npm install
npx expo start
```

## Verification & Quality Gates

```powershell
cd "C:\Users\WHITE-SNAKE\Desktop\picker And Packer\frontend"
npx tsc --noEmit
npm test
```

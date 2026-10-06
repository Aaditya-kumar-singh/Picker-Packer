# YBM Picker + Packer Mobile App

React Native / Expo prototype for warehouse Picker and Packer operations.

## Scope

Only:

- Picker
- Packer

The prototype demonstrates the complete handoff:

Picker -> READY_FOR_PACKING -> Packer -> PACKED

## Run

```powershell
cd "C:\Users\WHITE-SNAKE\Desktop\picker And Packer\ybm-picker-packer"
npm install
npx expo start
```

## Prototype login

The login screen provides:

- Continue as Picker
- Continue as Packer

No real authentication is implemented yet.

## Picker test

1. Login as Picker.
2. Open an assigned order.
3. Start Picking.
4. Enter the expected location, for example A-02-001.
5. Enter the expected SKU, for example 1000000021.
6. Confirm quantity.
7. Continue through all items.
8. Complete picking.
9. The order changes to READY_FOR_PACKING.

## Packer test

1. Sign out.
2. Login as Packer.
3. The READY_FOR_PACKING order appears in the queue.
4. Start Packing.
5. Scan each SKU.
6. Confirm quantity.
7. Complete packing.
8. The order changes to PACKED.

## Production work still required

- Real backend authentication
- Real WMS API
- Camera barcode scanning
- Hardware scanner integration
- Offline SQLite queue
- Sync/idempotency
- Exception persistence
- Package persistence
- Push notifications
- Audit API
- Production security

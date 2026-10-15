# YBM Picker & Packer Mobile App

Cross-platform React Native + Expo warehouse execution system (Android, iOS & Web) for **Picker** and **Packer** operations, backed by official REST APIs (`/api/picker-app/*`, `/api/packer-app/*`, and `/api/auth/*`).

## Architecture & Features

- **Role-Separated Workflows**:
  - **Picker (`ROLE_PICKER`)**:
    - Dashboard with live stats (`assignedOrdersCount`, `completedOrdersCount`, `totalItemsPickedToday`).
    - Assigned order work queue in `PICKING` status.
    - Pick list with full warehouse location breakdown (`locationCode`, `zone`, `aisle`, `rack`, `bin`, `shelf`).
    - Unit-by-unit barcode scanning (`POST /api/picker-app/orders/{id}/scan`) with instant haptic/audio feedback.
    - Soft-failure error handling (HTTP 400 with `{ success: false }`) for mismatched/unrecognized barcodes.
    - **Order Completion**: Picker assigns an active packer (`POST /api/picker-app/orders/{id}/assign-packer`) querying `GET /api/picker-app/available-packers`, transitioning order to `PACKING`.
  - **Packer (`ROLE_PACKER`)**:
    - Packer Dashboard with real-time packing metrics.
    - Verification scanning (`POST /api/packer-app/orders/{id}/scan`) per physical unit.
    - Automatic transition to `PACKED` once all units are verified.
    - **Dispatch Flow**: Assign active delivery riders (`POST /api/packer-app/orders/{id}/assign-rider`) from `GET /api/packer-app/riders/available`, transitioning order to `RIDER_ASSIGNED` / `DISPATCHED`.
- **Authentication**:
  - JWT Bearer token authentication via `POST /api/auth/login` (Password or OTP login).
  - Secure token persistence (`expo-secure-store` on native, `AsyncStorage` on web).
  - Auto-logout on `401 UNAUTHORIZED`.
- **Profile Management**:
  - Staff profile viewing (`GET /profile`), editing (`PUT /profile`), and password change (`POST /change-password`).

## Environment Variables

Create `.env` in the `frontend` directory:

```env
EXPO_PUBLIC_API_BASE_URL=https://test.yourbuildmart.com/api/
```

## Running Locally

### 1. Start Reference Backend (Optional for local testing)
```bash
cd backend
npm start
```
*Listens on `http://localhost:8080` with mock seed data and full API contract support.*

### 2. Start Frontend App
```bash
cd frontend
npm install
npx expo start
```

## Verification & Quality Gates

```bash
cd frontend
npx tsc --noEmit
npm test
```

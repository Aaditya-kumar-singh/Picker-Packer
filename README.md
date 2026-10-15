# YBM Picker & Packer

A full-stack warehouse execution application suite for **YourBuildMart (YBM)**.

## Project Structure

- `frontend/`: React Native (Expo) mobile & web application for warehouse pickers and packers.
- `backend/`: Optional standalone reference backend. It is not present in the current working tree, so backend startup and local backend integration tests are unavailable until it is restored or replaced with a maintained test server.
- `tests/`: Frontend source/contract checks and an optional backend integration test (`tests/workflow-hardening.test.mjs`). The integration test is skipped when `backend/server.js` is absent; it must be run against a real test API before release.
- `picker-app-api.md`: Official REST API contract for the Picker App (`/api/picker-app/*`).
- `packer-app-api.md`: Official REST API contract for the Packer App (`/api/packer-app/*`).

## Quick Start

### 1. Run Mobile/Web App
```bash
cd frontend
npm install
npx expo start
```

### 3. Run Quality Gates & Tests
```bash
cd frontend
npx tsc --noEmit
npm test
```

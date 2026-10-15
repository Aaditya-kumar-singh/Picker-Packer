# YBM Picker & Packer

A full-stack warehouse execution application suite for **YourBuildMart (YBM)**.

## Project Structure

- `frontend/`: React Native (Expo) mobile & web application for warehouse pickers and packers.
- `backend/`: Standalone reference Node.js REST server implementing all contracts from `picker-app-api.md` and `packer-app-api.md`.
- `tests/`: Automated contract, security, and integration test suite (`tests/workflow-hardening.test.mjs`).
- `picker-app-api.md`: Official REST API contract for the Picker App (`/api/picker-app/*`).
- `packer-app-api.md`: Official REST API contract for the Packer App (`/api/packer-app/*`).

## Quick Start

### 1. Run Backend Server
```bash
cd backend
npm start
```
Starts reference REST backend on `http://localhost:8080`.

### 2. Run Mobile/Web App
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

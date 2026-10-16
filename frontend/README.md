# YBM Picker & Packer

React Native / Expo warehouse picking and packing app.

## Start

```powershell
# Run these commands from the repository root
cd frontend
npm ci
npm start
```

`npm start` clears the Metro/Expo bundler cache before starting. Use it after pulling updates or when comparing a clean clone. For web, run `npm run start:web` from `frontend`.

## Reproducible UI checks

The UI source of truth is the tracked code on the `master` branch. To compare the same UI, stop all running Expo/Metro servers first, then restart with `npm start`. Compare the same route, role (PICKER or PACKER), device size and platform. Role, saved login state and backend data can change visible content, and web/Android layouts may differ intentionally.

## Backend

HTTP requests are centralized in `src/api/http.ts`. Native/release builds do not have a default API URL: set `EXPO_PUBLIC_API_BASE_URL` explicitly. The test backend is `https://test.yourbuildmart.com/api/` and requires `EXPO_PUBLIC_API_ENV=test`. Copy the values from `.env.example` for local test-backend development.

The GitHub Actions workflow builds a signed **TEST-BACKEND APK** in Codespaces. Its APK filename and GitHub prerelease notes identify it as test-only. It must not be used for production warehouse operations. A production build must explicitly set `EXPO_PUBLIC_API_ENV=production` and the real production API URL; release builds fail closed if the environment is missing or if the production environment points at a known test host.

## Android release

GitHub Actions builds the signed APK inside Codespaces with Expo prebuild and Gradle, then publishes a GitHub prerelease. EAS Build and Expo access tokens are not used. See root `RELEASE_SETUP.md` for secret setup.

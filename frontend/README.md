# YBM Picker & Packer

React Native / Expo warehouse picking and packing app.

## Start

```powershell
npm ci
npx expo start
```

## Backend

HTTP requests are centralized in `src/api/http.ts`. Native/release builds do not have a default API URL: set `EXPO_PUBLIC_API_BASE_URL` explicitly. The test backend is `https://test.yourbuildmart.com/api/` and requires `EXPO_PUBLIC_API_ENV=test`. Copy the values from `.env.example` for local test-backend development.

The GitHub Actions workflow builds a signed **TEST-BACKEND APK** in Codespaces. Its APK filename and GitHub prerelease notes identify it as test-only. It must not be used for production warehouse operations. A production build must explicitly set `EXPO_PUBLIC_API_ENV=production` and the real production API URL; release builds fail closed if the environment is missing or if the production environment points at a known test host.

## Android release

GitHub Actions builds the signed APK inside Codespaces with Expo prebuild and Gradle, then publishes a GitHub prerelease. EAS Build and Expo access tokens are not used. See root `RELEASE_SETUP.md` for secret setup.


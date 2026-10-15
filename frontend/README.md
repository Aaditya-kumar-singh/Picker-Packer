# YBM Picker & Packer

React Native / Expo warehouse picking and packing app.

## Start

```powershell
npm ci
npx expo start
```

## Backend

HTTP requests are centralized in `src/api/http.ts`. The default API URL is `https://test.yourbuildmart.com/api/`. Local `.env` may set `EXPO_PUBLIC_API_BASE_URL`. The configured host is a **test backend** and must not be used for production warehouse operations.

## Android release

GitHub Actions builds the signed APK inside Codespaces with Expo prebuild and Gradle, then publishes a GitHub prerelease. EAS Build and Expo access tokens are not used. See root `RELEASE_SETUP.md` for secret setup.


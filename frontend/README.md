# YBM Picker & Packer

React Native / Expo warehouse picking and packing app for YourBuildMart.

## Start locally

```powershell
npm ci
npx expo start
```

## REST API backend

All authentication, picker, and packer HTTP requests use the shared client in `src/api/http.ts`. The app's default API base URL is:

`https://test.yourbuildmart.com/api/`

Local `.env` can override it:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://test.yourbuildmart.com/api/
```

All calls built with relative paths are sent to that base URL. The shared client adds the stored bearer token, unwraps the documented response envelopes, and clears the session on HTTP 401. Photo file paths returned by the API are also resolved against the same backend origin.

The configured host is a **test backend**. Test builds and releases made from this configuration will access test-environment data. Before distributing a production app, change the URL to the verified production API host and rebuild; do not use this test hostname for real production work.

## Quality checks

```powershell
npx tsc --noEmit
npm test
npx expo config --type public --json
```

See the repository root README for automated GitHub Actions APK build/release setup and required signing secrets.

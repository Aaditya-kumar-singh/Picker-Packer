# YBM Picker & Packer

A React Native / Expo warehouse picking and packing application.

## Backend

All app API calls are centralized in `frontend/src/api/http.ts`. The default and release API base URL is:

`https://test.yourbuildmart.com/api/`

Override it for local development in `frontend/.env`:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://test.yourbuildmart.com/api/
```

Authentication, picker, and packer operations share the same HTTP client, which attaches the stored bearer token when applicable, parses API responses, and handles expired sessions. The base URL is embedded in the app bundle, so rebuild the app after changing it.

## Local validation

```powershell
cd frontend
npm ci
npx tsc --noEmit
npm test
npx expo config --type public --json
```

## Automated APK build and GitHub Release

GitHub Actions validates changes on pushes and pull requests to `master`. A push to `master` starts the Android release workflow after validation, builds a signed APK, calculates its SHA-256 checksum, and attaches the APK to a GitHub prerelease.

Before the first release, configure these repository **Actions secrets**:

- `ANDROID_KEYSTORE_BASE64`: persistent Android release keystore encoded as one base64 string.
- `ANDROID_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_KEY_ALIAS`: key alias.
- `ANDROID_KEY_PASSWORD`: private key password.

In PowerShell, encode your existing keystore without line breaks:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\release.keystore"))
```

Store the output only in the GitHub secret `ANDROID_KEYSTORE_BASE64`, never in source control. Use the same keystore for future releases so devices can install an update over an earlier APK. GitHub Actions uses its `GITHUB_TOKEN` with `contents: write` permission to publish the release.

Run a manual build from **GitHub → Actions → Picker-Packer Android APK Release → Run workflow**.

## Release note

The automated APK is configured for the test backend above. Confirm that the server is reachable and supports every endpoint documented in `picker-app-api.md` and `packer-app-api.md`, including authentication, before distributing to staff. This backend is a test environment, not a production host.

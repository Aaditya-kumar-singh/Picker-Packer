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

GitHub Actions validates pushes and pull requests targeting `master`. A push to `master` runs the Android release workflow after validation. It triggers a signed Android APK build through the existing EAS **preview** profile, downloads the completed APK, calculates its SHA-256 checksum, and attaches the file to a GitHub prerelease.

The EAS preview profile is configured to build an APK and set the backend URL to `https://test.yourbuildmart.com/api/`. EAS manages the Android signing credential already configured for this project, so do not create a second keystore or put signing keys in Git.

### One required GitHub Actions secret

Add an Expo access token as a repository Actions secret named `EXPO_TOKEN`:

1. Create an access token from the Expo account settings for the account owning this EAS project.
2. Open **GitHub → Aaditya-kumar-singh/Picker-Packer → Settings → Secrets and variables → Actions**.
3. Choose **New repository secret**, name it `EXPO_TOKEN`, and paste the token value.

Never commit the token to source control or put it in `.env.example`. The workflow fails early with a clear message if it is missing.

The GitHub workflow is `.github/workflows/android-release.yml`. It runs on pushes to `master`, and can also be started manually from **GitHub → Actions → Picker-Packer Android APK Release → Run workflow**.

Each successful run publishes a GitHub prerelease with a downloadable APK and SHA-256 checksum. See the [Actions runs](https://github.com/Aaditya-kumar-singh/Picker-Packer/actions) and [Releases](https://github.com/Aaditya-kumar-singh/Picker-Packer/releases) pages.

## Important

The automated APK is configured for the **test backend** above. Confirm that the server is reachable and supports every endpoint documented in `picker-app-api.md` and `packer-app-api.md`, including authentication, before distributing to staff. Do not use this test hostname for real production operations.

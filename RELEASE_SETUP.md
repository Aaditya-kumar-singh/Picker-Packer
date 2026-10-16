# Picker-Packer Codespaces Android Release Setup

Replicates Jeevya's native Gradle build and release flow while keeping Expo SDK/prebuild. **EAS Build is not used.**

## Pipeline

```text
GitHub Actions validation
  -> create GitHub Codespace
  -> Node 24 + Java 17 + Android SDK 36
  -> npm ci
  -> expo prebuild --platform android
  -> Gradle :app:assembleRelease
  -> verify APK signature + SHA-256
  -> GitHub prerelease + APK
  -> stop Codespace
```

## 1. Actions authentication

Create an active GitHub personal access token (classic) with repository and Codespaces access (typically `repo` and `codespace` scopes). Add it to Picker-Packer repository Actions secrets as `CODESPACES_TOKEN`. No Expo token is needed.

## 2. Signing setup (one time)

Create a Codespace from **Code → Codespaces → Create codespace on master**, wait for dev-container setup, then run:

```bash
cd /workspaces/Picker-Packer/frontend
npm ci
npm run setup:codespace-signing
```

This generates or imports a JKS keystore and stores `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` as user Codespaces secrets scoped to the repo. Securely back up the keystore outside Codespaces. Recreate/rebuild the Codespace after adding secrets so environment variables refresh. Never commit signing material.

**Installed APK compatibility:** reuse the signing key from the installed APK or Android will refuse to update it. Otherwise uninstall the older APK first.

## 3. Release

Once the Actions token and all signing secrets are configured, pushes to `master` validate and trigger an APK build. Manual trigger: **Actions → Picker-Packer Android APK Release → Run workflow**.

## 4. Build without publishing

Inside an already configured Codespace run `npm run android:codespace` from `/workspaces/Picker-Packer/frontend`. The APK and metadata are written to `frontend/dist/releases/`.

Codespaces usage may consume your GitHub Codespaces quota. The generated native `frontend/android/` directory is removed at the end of the build so signing details are not retained in the workspace.

Release builds target test API `https://test.yourbuildmart.com/api/`.

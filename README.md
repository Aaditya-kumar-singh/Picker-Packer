# YBM Picker & Packer

A React Native / Expo warehouse picking and packing application for YourBuildMart.

## API

App API calls use `frontend/src/api/http.ts`. Default/release API base URL: `https://test.yourbuildmart.com/api/`. Change `EXPO_PUBLIC_API_BASE_URL` in `frontend/.env` for local development.

## Local checks

```powershell
cd frontend
npm ci
npx tsc --noEmit
npm test
npx expo config --type public --json
```

## Android APK release

The release workflow follows [Jeevya's Codespaces build pattern](https://github.com/Aaditya-kumar-singh/jeevya). GitHub Actions validates the app, creates a Codespace, and runs Expo prebuild plus Android Gradle to compile and sign an APK. It verifies the signature, publishes a GitHub prerelease with an APK and SHA-256 checksum, then stops the Codespace.

**EAS Build is removed from the release path.** Expo SDK and Expo prebuild remain in use; no Expo token is needed.

### Required secret

Add an active GitHub personal access token (classic) with repository and Codespaces access (typically `repo` and `codespace` scopes) as the repository Actions secret `CODESPACES_TOKEN`. Location: **Settings → Secrets and variables → Actions**. Never commit the token.

### Android signing setup

Create a Codespace from **Code → Codespaces → Create codespace on master** and run:

```bash
cd /workspaces/Picker-Packer/frontend
npm ci
npm run setup:codespace-signing
```

The setup script can create a keystore or import an existing one, then stores the four signing values as Codespaces secrets. Back up the keystore outside Codespaces. To update an already installed app, import the same signing key previously used; Android rejects updates signed with another key.

After the four Codespaces signing secrets and `CODESPACES_TOKEN` are configured, push to `master`. Releases: [Actions](https://github.com/Aaditya-kumar-singh/Picker-Packer/actions) · [GitHub Releases](https://github.com/Aaditya-kumar-singh/Picker-Packer/releases).

Released APKs use the **test backend** `https://test.yourbuildmart.com/api/`. Verify API availability before distributing to warehouse staff.


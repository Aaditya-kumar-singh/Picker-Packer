#!/usr/bin/env bash
set -euo pipefail

if [[ "${CODESPACES:-false}" != "true" ]]; then
  echo "Run this inside the YBM Picker-Packer GitHub Codespace."
  exit 1
fi

command -v keytool >/dev/null || { echo "keytool is missing. Rebuild the Codespace first."; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI is missing. Rebuild the Codespace first."; exit 1; }

REPO="Aaditya-kumar-singh/Picker-Packer"
KEY_DIR="$HOME/.ybm"
KEYSTORE="$KEY_DIR/ybm-release.keystore"

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

echo "This creates or imports the permanent YBM Picker-Packer Android release key."
echo "IMPORTANT: if you already have an EAS keystore used by installed YBM Picker-Packer builds,"
echo "use that keystore instead of generating a new one, otherwise existing APKs"
echo "will not accept updates signed with a different key."
echo

read -r -p "Keystore path (leave empty to create a new one): " IMPORT_PATH

if [[ -n "$IMPORT_PATH" ]]; then
  if [[ ! -f "$IMPORT_PATH" ]]; then
    echo "Keystore not found: $IMPORT_PATH"
    exit 1
  fi
  cp "$IMPORT_PATH" "$KEYSTORE"
  chmod 600 "$KEYSTORE"
  read -r -p "Key alias: " KEY_ALIAS
  read -r -s -p "Keystore password: " STORE_PASSWORD
  echo
  read -r -s -p "Key password: " KEY_PASSWORD
  echo
else
  read -r -p "Key alias [ybm-release]: " KEY_ALIAS
  KEY_ALIAS="${KEY_ALIAS:-ybm-release}"
  read -r -s -p "New keystore password: " STORE_PASSWORD
  echo
  read -r -s -p "Confirm keystore password: " STORE_PASSWORD_CONFIRM
  echo
  [[ "$STORE_PASSWORD" == "$STORE_PASSWORD_CONFIRM" ]] || { echo "Passwords do not match."; exit 1; }

  read -r -s -p "Key password [press Enter to use keystore password]: " KEY_PASSWORD
  echo
  KEY_PASSWORD="${KEY_PASSWORD:-$STORE_PASSWORD}"

  keytool -genkeypair -v     -storetype JKS     -keystore "$KEYSTORE"     -alias "$KEY_ALIAS"     -keyalg RSA     -keysize 2048     -validity 10000     -storepass "$STORE_PASSWORD"     -keypass "$KEY_PASSWORD"     -dname "CN=com.aaditya001.ybmpickerpacker,OU=YBM Picker-Packer,O=Aaditya Kumar,L=India,ST=India,C=IN"
fi

KEYSTORE_B64="$KEY_DIR/ybm-release.keystore.b64"
base64 -w 0 "$KEYSTORE" > "$KEYSTORE_B64"
chmod 600 "$KEYSTORE_B64"

echo
echo "Saving four secrets to your GitHub Codespaces user secrets for $REPO..."

gh secret set ANDROID_KEYSTORE_BASE64   --user --app codespaces --repos "$REPO" < "$KEYSTORE_B64"

printf '%s' "$STORE_PASSWORD" | gh secret set ANDROID_KEYSTORE_PASSWORD   --user --app codespaces --repos "$REPO"

printf '%s' "$KEY_ALIAS" | gh secret set ANDROID_KEY_ALIAS   --user --app codespaces --repos "$REPO"

printf '%s' "$KEY_PASSWORD" | gh secret set ANDROID_KEY_PASSWORD   --user --app codespaces --repos "$REPO"

echo
echo "Verifying that all four Codespaces signing secrets are present..."
EXPECTED_SECRETS=(
  ANDROID_KEYSTORE_BASE64
  ANDROID_KEYSTORE_PASSWORD
  ANDROID_KEY_ALIAS
  ANDROID_KEY_PASSWORD
)
AVAILABLE="$(gh secret list --user --app codespaces --repo "$REPO" --json name --jq '.[].name')"
for SECRET_NAME in "${EXPECTED_SECRETS[@]}"; do
  if ! grep -Fxq "$SECRET_NAME" <<< "$AVAILABLE"; then
    echo "ERROR: Codespaces secret was not found: $SECRET_NAME"
    echo "Make sure this repository is selected under the secret's Repository access."
    exit 1
  fi
done

echo "Codespaces signing secrets configured and verified."
echo "Keystore backup: $KEYSTORE"
echo "Base64 backup:   $KEYSTORE_B64"
echo
echo "Keep both backup files outside Git and in a secure password manager/storage."
echo "Do not commit the keystore or passwords."

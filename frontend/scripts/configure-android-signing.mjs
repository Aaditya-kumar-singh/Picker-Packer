import fs from 'node:fs';
import path from 'node:path';

const required = [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing Codespaces secret: ${name}`);
  }
}

const root = process.cwd();
const androidDir = path.join(root, 'android');
const appDir = path.join(androidDir, 'app');
const keystoreDir = path.join(appDir, 'keystores');
const keystorePath = path.join(keystoreDir, 'ybm-release.keystore');
const gradleProperties = path.join(androidDir, 'gradle.properties');
const buildGradle = path.join(appDir, 'build.gradle');

if (!fs.existsSync(buildGradle)) {
  throw new Error('android/app/build.gradle does not exist. Run Expo prebuild first.');
}

fs.mkdirSync(keystoreDir, { recursive: true, mode: 0o700 });
fs.writeFileSync(
  keystorePath,
  Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64'),
  { mode: 0o600 },
);

let properties = fs.readFileSync(gradleProperties, 'utf8');
const managedKeys = [
  'YBM_UPLOAD_STORE_FILE',
  'YBM_UPLOAD_KEY_ALIAS',
  'YBM_UPLOAD_STORE_PASSWORD',
  'YBM_UPLOAD_KEY_PASSWORD',
];

properties = properties
  .split(/\r?\n/)
  .filter((line) => !managedKeys.some((key) => line.startsWith(`${key}=`)))
  .join('\n')
  .trimEnd();

properties += `

# Injected at build time from GitHub Codespaces secrets. Never commit these values.
YBM_UPLOAD_STORE_FILE=keystores/ybm-release.keystore
YBM_UPLOAD_KEY_ALIAS=${process.env.ANDROID_KEY_ALIAS}
YBM_UPLOAD_STORE_PASSWORD=${process.env.ANDROID_KEYSTORE_PASSWORD}
YBM_UPLOAD_KEY_PASSWORD=${process.env.ANDROID_KEY_PASSWORD}
`;

fs.writeFileSync(gradleProperties, properties + '\n');

let gradle = fs.readFileSync(buildGradle, 'utf8');

if (!gradle.includes('signingConfigs {')) {
  throw new Error('Could not find signingConfigs block in generated Gradle file.');
}

const releaseSigning = `        release {
            storeFile file(YBM_UPLOAD_STORE_FILE)
            storePassword YBM_UPLOAD_STORE_PASSWORD
            keyAlias YBM_UPLOAD_KEY_ALIAS
            keyPassword YBM_UPLOAD_KEY_PASSWORD
        }`;

gradle = gradle.replace(
  /    signingConfigs \{\n        debug \{[\s\S]*?        \}\n    \}/,
  `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
${releaseSigning}
    }`,
);

gradle = gradle.replace(
  /versionCode \d+/,
  `versionCode ${process.env.YBM_VERSION_CODE || '2'}`,
);

gradle = gradle.replace(
  /signingConfig signingConfigs\.debug\n            def enableShrinkResources/,
  `signingConfig signingConfigs.release
            def enableShrinkResources`,
);

fs.writeFileSync(buildGradle, gradle);

console.log(`Android signing configured: ${keystorePath}`);
console.log(`Android versionCode: ${process.env.YBM_VERSION_CODE || '2'}`);

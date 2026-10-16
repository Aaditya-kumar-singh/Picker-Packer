import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function run(command, args, options = {}) {
  console.log(`\\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

function output(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  }).trim();
}

if (process.env.CODESPACES !== 'true') {
  throw new Error(
    'This command is designed for GitHub Codespaces. Open YBM Picker-Packer in a Codespace first.',
  );
}

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

if (!fs.existsSync(path.join(root, 'package-lock.json'))) {
  throw new Error('package-lock.json is missing.');
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const version = packageJson.version;
const commit = output('git', ['rev-parse', '--short=12', 'HEAD']);
const commitCount = Number(output('git', ['rev-list', '--count', 'HEAD']));
const versionCode = 100000 + commitCount;

console.log(`YBM Picker-Packer ${version}`);
console.log(`Commit: ${commit}`);
console.log(`Android versionCode: ${versionCode}`);

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://test.yourbuildmart.com/api/';

process.on('exit', () => {
  // The Codespace workspace persists after shutdown; remove generated files containing signing material.
  fs.rmSync(path.join(root, 'android'), { recursive: true, force: true });
});

run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], {
  env: {
    ...process.env,
    YBM_VERSION_CODE: String(versionCode),
  },
});

run('node', ['scripts/configure-android-signing.mjs'], {
  env: {
    ...process.env,
    YBM_VERSION_CODE: String(versionCode),
  },
});

run('./gradlew', [
  ':app:assembleRelease',
  '--no-daemon',
  '--max-workers=2',
  '--stacktrace',
  '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64',
], {
  cwd: path.join(root, 'android'),
  env: {
    ...process.env,
    YBM_VERSION_CODE: String(versionCode),
  },
});

const apkSource = path.join(
  root,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
);

if (!fs.existsSync(apkSource)) {
  throw new Error(`Release APK was not produced: ${apkSource}`);
}

const outputDir = path.join(root, 'dist', 'releases');
fs.mkdirSync(outputDir, { recursive: true });

const assetName = `YBM-Picker-Packer-${version}-${commit}-android.apk`
const assetPath = path.join(outputDir, assetName);
fs.copyFileSync(apkSource, assetPath);

const apksigner = output(
  'bash',
  ['-lc', 'command -v apksigner || find "$ANDROID_HOME/build-tools" -name apksigner -type f | sort -V | tail -1'],
);

if (!apksigner) {
  throw new Error('apksigner was not found in the Android SDK.');
}

run(apksigner, ['verify', '--verbose', assetPath]);

const sha256 = output('sha256sum', [assetPath]).trim().split(/\s+/)[0];
const metadata = {
  version,
  versionCode,
  commit,
  assetName,
  sha256,
};

const metadataPath = path.join(outputDir, `${assetName}.json`);

fs.writeFileSync(
  metadataPath,
  JSON.stringify(metadata, null, 2) + '\n',
);

console.log('\\nRelease APK ready:');
console.log(assetPath);
console.log(`Metadata: ${metadataPath}`);
console.log(`SHA-256: ${sha256}`);

export { assetPath, metadata, metadataPath };


import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
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
    'npm run ship is intentionally limited to GitHub Codespaces.',
  );
}

if (output('git', ['branch', '--show-current']) !== 'master') {
  throw new Error('Release builds must be made from master.');
}

if (output('git', ['status', '--porcelain'])) {
  throw new Error(
    'Working tree is not clean. Commit your changes before running npm run ship.',
  );
}

console.log('Pushing the exact source commit that will be released...');
run('git', ['push', 'origin', 'master']);

const buildScript = path.join(root, 'scripts', 'build-android-codespace.mjs');
run('node', [buildScript]);

const releasesDir = path.join(root, 'dist', 'releases');
const currentCommit = output('git', ['rev-parse', '--short=12', 'HEAD']);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const assetName = `YBM-Picker-Packer-TEST-BACKEND-${packageJson.version}-${currentCommit}-android.apk`
const metadataPath = path.join(releasesDir, `${assetName}.json`);

if (!fs.existsSync(metadataPath)) {
  throw new Error(`Build metadata was not found: ${metadataPath}`);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

if (metadata.apiEnvironment !== 'test' || metadata.apiBaseUrl !== 'https://test.yourbuildmart.com/api/') {
  throw new Error('Refusing to publish APK: expected explicit TEST-backend build metadata.');
}

if (metadata.commit !== currentCommit) {
  throw new Error(
    `Build metadata commit mismatch: expected ${currentCommit}, got ${metadata.commit}.`,
  );
}

if (metadata.assetName !== assetName) {
  throw new Error(
    `Build metadata asset mismatch: expected ${assetName}, got ${metadata.assetName}.`,
  );
}

const apkPath = path.join(releasesDir, metadata.assetName);

if (!fs.existsSync(apkPath)) {
  throw new Error(`Release APK was not found: ${apkPath}`);
}

const now = new Date();
const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const tag = `android-test-v${metadata.version}-${timestamp}`;

const notes = [
  'Automated Codespace Android TEST-BACKEND release.',
  'WARNING: This APK connects to https://test.yourbuildmart.com/api/ and must not be used for production warehouse operations.',
  '',
  `Version: ${metadata.version}`,
  `Android versionCode: ${metadata.versionCode}`,
  `Commit: ${metadata.commit}`,
  `SHA-256: ${metadata.sha256}`,
  '',
  'Build environment: GitHub Codespaces',
  'Build system: Expo prebuild + Gradle',
  'Signing: YBM Picker-Packer local release keystore stored as Codespaces secrets',
].join('\n');

console.log(`\nPublishing GitHub release: ${tag}`);

const ghEnv = {
  ...process.env,
  ...(process.env.GH_TOKEN
    ? {}
    : process.env.GITHUB_TOKEN
      ? { GH_TOKEN: process.env.GITHUB_TOKEN }
      : {}),
};

run(
  'gh',
  [
    'release',
    'create',
    tag,
    apkPath,
    '--repo',
    'Aaditya-kumar-singh/Picker-Packer',
    '--title',
    `YBM Picker-Packer TEST BACKEND ${metadata.version} Android ${metadata.commit}`,
    '--prerelease',
    '--latest=false',
    '--target',
    'master',
    '--notes',
    notes,
  ],
  { env: ghEnv },
);

console.log('\nRelease published successfully.');
console.log(`https://github.com/Aaditya-kumar-singh/Picker-Packer/releases/tag/${tag}`);

if (process.env.CODESPACE_NAME && process.env.YBM_AUTOMATED_RELEASE !== 'true') {
  console.log('\nScheduling this Codespace to stop in 5 seconds...');

  const stopper = spawn(
    'bash',
    [
      '-lc',
      'sleep 5; gh codespace stop -c "$CODESPACE_NAME" || true',
    ],
    {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      env: ghEnv,
    },
  );

  stopper.unref();
}

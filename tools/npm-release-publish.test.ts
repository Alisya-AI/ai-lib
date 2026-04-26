import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-npm-publish-'));
}

test('npm-release-publish supports dry-run verification with fixture version', async () => {
  const dir = await tempDir();
  const packageFile = path.join(dir, 'package.json');
  const publishedVersionFile = path.join(dir, 'published-version.json');
  const reportFile = path.join(dir, 'report.json');

  await fs.writeFile(packageFile, JSON.stringify({ name: '@alisya.ai/ailib', version: '9.9.9' }), 'utf8');
  await fs.writeFile(publishedVersionFile, JSON.stringify('9.9.9'), 'utf8');

  const result = spawnSync(
    'bun',
    [
      'tools/npm-release-publish.ts',
      '--dry-run',
      `--package-file=${packageFile}`,
      `--published-version-json-file=${publishedVersionFile}`,
      `--report-file=${reportFile}`
    ],
    { cwd: packageRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm publish verification passed/);

  const report = JSON.parse(await fs.readFile(reportFile, 'utf8')) as Record<string, unknown>;
  assert.equal(report.packageName, '@alisya.ai/ailib');
  assert.equal(report.version, '9.9.9');
  assert.equal(report.dryRun, true);
});

test('npm-release-publish fails dry-run when resolved version mismatches package version', async () => {
  const dir = await tempDir();
  const packageFile = path.join(dir, 'package.json');
  const publishedVersionFile = path.join(dir, 'published-version.json');

  await fs.writeFile(packageFile, JSON.stringify({ name: '@alisya.ai/ailib', version: '1.2.3' }), 'utf8');
  await fs.writeFile(publishedVersionFile, JSON.stringify('1.2.4'), 'utf8');

  const result = spawnSync(
    'bun',
    [
      'tools/npm-release-publish.ts',
      '--dry-run',
      `--package-file=${packageFile}`,
      `--published-version-json-file=${publishedVersionFile}`,
      `--report-file=${path.join(dir, 'report.json')}`
    ],
    { cwd: packageRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Published version mismatch/);
});

test('npm-release-publish retries when npm view returns stale version', { timeout: 15_000 }, async () => {
  const dir = await tempDir();
  const packageFile = path.join(dir, 'package.json');
  const reportFile = path.join(dir, 'report.json');
  const fakeBin = path.join(dir, 'bin');
  const stateFile = path.join(dir, 'npm-view-count.txt');
  const fakeNpm = path.join(fakeBin, 'npm');
  const fakeNpx = path.join(fakeBin, 'npx');

  await fs.mkdir(fakeBin, { recursive: true });
  await fs.writeFile(packageFile, JSON.stringify({ name: '@alisya.ai/ailib', version: '2.0.0' }), 'utf8');
  await fs.writeFile(stateFile, '0', 'utf8');
  await fs.writeFile(
    fakeNpm,
    `#!/usr/bin/env bash
set -euo pipefail
STATE_FILE="${stateFile}"
COMMAND="$1"
if [ "$COMMAND" = "whoami" ]; then
  echo "ci-user"
  exit 0
fi
if [ "$COMMAND" = "publish" ]; then
  exit 0
fi
if [ "$COMMAND" = "view" ]; then
  COUNT="$(cat "$STATE_FILE")"
  NEXT_COUNT=$((COUNT + 1))
  echo "$NEXT_COUNT" > "$STATE_FILE"
  if [ "$NEXT_COUNT" -lt 3 ]; then
    echo "\\"1.9.9\\""
  else
    echo "\\"2.0.0\\""
  fi
  exit 0
fi
if [ "$COMMAND" = "init" ]; then
  exit 0
fi
if [ "$COMMAND" = "install" ]; then
  exit 0
fi
echo "unsupported npm command: $*" >&2
exit 1
`,
    'utf8'
  );
  await fs.writeFile(
    fakeNpx,
    `#!/usr/bin/env bash
set -euo pipefail
echo "ailib commands:"
`,
    'utf8'
  );
  await fs.chmod(fakeNpm, 0o755);
  await fs.chmod(fakeNpx, 0o755);

  const result = spawnSync(
    'bun',
    ['tools/npm-release-publish.ts', `--package-file=${packageFile}`, `--report-file=${reportFile}`],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        AILIB_NPM_VIEW_MAX_ATTEMPTS: '5',
        AILIB_NPM_VIEW_DELAY_MS: '10',
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm view retry 1\/5/);
  assert.match(result.stdout, /npm view retry 2\/5/);
  assert.match(result.stdout, /npm publish verification passed/);

  const report = JSON.parse(await fs.readFile(reportFile, 'utf8')) as Record<string, unknown>;
  const checks = report.checks as Record<string, unknown>;
  assert.equal(checks.npmAuthVerified, true);
  assert.equal(checks.publishCommandExecuted, true);
  assert.equal(checks.npmVersionResolved, true);
  assert.equal(checks.installVerificationPassed, true);
});

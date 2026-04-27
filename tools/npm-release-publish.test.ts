import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { resolvePublishedVersionWithRetry } from './npm-release-publish-retry.ts';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-npm-publish-'));
}

async function spawnBun(
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  }
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn('bun', args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
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

test('resolvePublishedVersionWithRetry retries stale versions quickly', async () => {
  let attempt = 0;
  const sleepCalls: number[] = [];
  const logs: string[] = [];

  const resolved = await resolvePublishedVersionWithRetry({
    packageName: '@alisya.ai/ailib',
    expectedVersion: '2.0.0',
    maxAttempts: 5,
    delayMs: 3000,
    fetchVersion: async () => {
      attempt += 1;
      return attempt < 3 ? '1.9.9' : '2.0.0';
    },
    isRetryableError: () => false,
    sleep: async (ms: number) => {
      sleepCalls.push(ms);
    },
    writeLog: (line: string) => {
      logs.push(line);
    }
  });

  assert.equal(resolved, '2.0.0');
  assert.equal(attempt, 3);
  assert.deepEqual(sleepCalls, [3000, 3000]);
  assert.match(logs.join(''), /npm view retry 1\/5/);
  assert.match(logs.join(''), /npm view retry 2\/5/);
});

test('resolvePublishedVersionWithRetry retries retryable errors', async () => {
  let attempt = 0;
  const sleepCalls: number[] = [];

  const resolved = await resolvePublishedVersionWithRetry({
    packageName: '@alisya.ai/ailib',
    expectedVersion: '2.0.0',
    maxAttempts: 3,
    delayMs: 50,
    fetchVersion: async () => {
      attempt += 1;
      if (attempt < 3) throw new Error('npm error code E404');
      return '2.0.0';
    },
    isRetryableError: (error: unknown) => error instanceof Error && error.message.includes('E404'),
    sleep: async (ms: number) => {
      sleepCalls.push(ms);
    },
    writeLog: () => {}
  });

  assert.equal(resolved, '2.0.0');
  assert.equal(attempt, 3);
  assert.deepEqual(sleepCalls, [50, 50]);
});

test('resolvePublishedVersionWithRetry throws mismatch after max attempts', async () => {
  await assert.rejects(
    resolvePublishedVersionWithRetry({
      packageName: '@alisya.ai/ailib',
      expectedVersion: '2.0.0',
      maxAttempts: 2,
      delayMs: 0,
      fetchVersion: async () => '1.9.9',
      isRetryableError: () => false,
      sleep: async () => {},
      writeLog: () => {}
    }),
    /Unable to resolve published version/
  );
});

test('resolvePublishedVersionWithRetry throws non-retryable errors immediately', async () => {
  await assert.rejects(
    resolvePublishedVersionWithRetry({
      packageName: '@alisya.ai/ailib',
      expectedVersion: '2.0.0',
      maxAttempts: 3,
      delayMs: 0,
      fetchVersion: async () => {
        throw new Error('permission denied');
      },
      isRetryableError: () => false,
      sleep: async () => {}
    }),
    /permission denied/
  );
});

test('resolvePublishedVersionWithRetry uses default logger when writeLog is omitted', async () => {
  let attempt = 0;
  const sleepCalls: number[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const logged: string[] = [];

  process.stdout.write = ((chunk: string | Uint8Array) => {
    logged.push(chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    const resolved = await resolvePublishedVersionWithRetry({
      packageName: '@alisya.ai/ailib',
      expectedVersion: '2.0.0',
      maxAttempts: 3,
      delayMs: 25,
      fetchVersion: async () => {
        attempt += 1;
        return attempt < 2 ? '1.9.9' : '2.0.0';
      },
      isRetryableError: () => false,
      sleep: async (ms: number) => {
        sleepCalls.push(ms);
      }
    });

    assert.equal(resolved, '2.0.0');
    assert.deepEqual(sleepCalls, [25]);
    assert.match(logged.join(''), /npm view retry 1\/3/);
  } finally {
    process.stdout.write = originalWrite;
  }
});

test('npm-release-publish verifies non-dry-run path', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const packageFile = path.join(dir, 'package.json');
  const reportFile = path.join(dir, 'report.json');
  const fakeBin = path.join(dir, 'bin');
  const fakeNpm = path.join(fakeBin, 'npm');
  await fs.mkdir(fakeBin, { recursive: true });
  await fs.writeFile(packageFile, JSON.stringify({ name: '@alisya.ai/ailib', version: '2.0.0' }), 'utf8');
  await fs.writeFile(
    fakeNpm,
    `#!/usr/bin/env bash
set -euo pipefail
COMMAND="$1"
if [ "$COMMAND" = "whoami" ]; then
  echo "ci-user"
  exit 0
fi
if [ "$COMMAND" = "publish" ]; then
  exit 0
fi
if [ "$COMMAND" = "view" ]; then
  if [ "$3" = "version" ]; then
    echo "\\"2.0.0\\""
    exit 0
  fi
fi
echo "unsupported npm command: $*" >&2
exit 1
`,
    'utf8'
  );
  await fs.chmod(fakeNpm, 0o755);

  const result = await spawnBun(
    ['tools/npm-release-publish.ts', `--package-file=${packageFile}`, `--report-file=${reportFile}`],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        AILIB_NPM_VIEW_MAX_ATTEMPTS: '2',
        AILIB_NPM_VIEW_DELAY_MS: '0',
        AILIB_NPM_SKIP_TARBALL_VERIFY: '1',
        AILIB_NPM_SKIP_INSTALL_VERIFY: '1',
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm publish verification passed/);

  const report = JSON.parse(await fs.readFile(reportFile, 'utf8')) as Record<string, unknown>;
  const checks = report.checks as Record<string, unknown>;
  assert.equal(checks.npmAuthVerified, true);
  assert.equal(checks.publishCommandExecuted, true);
  assert.equal(checks.npmVersionResolved, true);
  assert.equal(checks.publishedTarballReachable, true);
  assert.equal(checks.installVerificationPassed, true);
});

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

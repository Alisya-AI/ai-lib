import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-npm-preflight-'));
}

test('npm-release-preflight succeeds for first-time publish fixture payloads', async () => {
  const dir = await tempDir();
  const packageFile = path.join(dir, 'package.json');
  const versionsFile = path.join(dir, 'versions.json');
  const packFile = path.join(dir, 'pack.json');
  const reportFile = path.join(dir, 'report.json');

  await fs.writeFile(packageFile, JSON.stringify({ name: '@alisya.ai/ailib', version: '9.9.9' }), 'utf8');
  await fs.writeFile(versionsFile, JSON.stringify([]), 'utf8');
  await fs.writeFile(
    packFile,
    JSON.stringify([
      {
        filename: 'alisya.ai-ailib-9.9.9.tgz',
        files: [
          { path: 'bin/ailib.js' },
          { path: 'dist/runtime/cli.js' },
          { path: 'docs/homebrew-publishing.md' },
          { path: 'skills/task-driven-gh-flow.md' },
          { path: 'registry.json' }
        ]
      }
    ]),
    'utf8'
  );

  const result = spawnSync(
    'bun',
    [
      'tools/npm-release-preflight.ts',
      `--package-file=${packageFile}`,
      `--versions-json-file=${versionsFile}`,
      `--pack-json-file=${packFile}`,
      `--report-file=${reportFile}`
    ],
    { cwd: packageRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm release preflight passed/);

  const report = JSON.parse(await fs.readFile(reportFile, 'utf8')) as Record<string, unknown>;
  assert.equal(report.packageName, '@alisya.ai/ailib');
  assert.equal(report.version, '9.9.9');
  assert.equal(report.tarball, 'alisya.ai-ailib-9.9.9.tgz');
});

test('npm-release-preflight fails when target version is already published', async () => {
  const dir = await tempDir();
  const packageFile = path.join(dir, 'package.json');
  const versionsFile = path.join(dir, 'versions.json');
  const packFile = path.join(dir, 'pack.json');

  await fs.writeFile(packageFile, JSON.stringify({ name: '@alisya.ai/ailib', version: '1.0.0' }), 'utf8');
  await fs.writeFile(versionsFile, JSON.stringify(['0.9.0', '1.0.0']), 'utf8');
  await fs.writeFile(
    packFile,
    JSON.stringify([
      {
        filename: 'alisya.ai-ailib-1.0.0.tgz',
        files: [
          { path: 'bin/ailib.js' },
          { path: 'dist/runtime/cli.js' },
          { path: 'docs/homebrew-publishing.md' },
          { path: 'skills/task-driven-gh-flow.md' },
          { path: 'registry.json' }
        ]
      }
    ]),
    'utf8'
  );

  const result = spawnSync(
    'bun',
    [
      'tools/npm-release-preflight.ts',
      `--package-file=${packageFile}`,
      `--versions-json-file=${versionsFile}`,
      `--pack-json-file=${packFile}`,
      `--report-file=${path.join(dir, 'report.json')}`
    ],
    { cwd: packageRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /already published/);
});

test('npm-release-preflight fails when npm pack payload includes TypeScript files', async () => {
  const dir = await tempDir();
  const packageFile = path.join(dir, 'package.json');
  const versionsFile = path.join(dir, 'versions.json');
  const packFile = path.join(dir, 'pack.json');

  await fs.writeFile(packageFile, JSON.stringify({ name: '@alisya.ai/ailib', version: '2.0.0' }), 'utf8');
  await fs.writeFile(versionsFile, JSON.stringify([]), 'utf8');
  await fs.writeFile(
    packFile,
    JSON.stringify([
      {
        filename: 'alisya.ai-ailib-2.0.0.tgz',
        files: [
          { path: 'bin/ailib.js' },
          { path: 'dist/runtime/cli.js' },
          { path: 'docs/homebrew-publishing.md' },
          { path: 'skills/task-driven-gh-flow.md' },
          { path: 'registry.json' },
          { path: 'tools/npm-release-publish.ts' }
        ]
      }
    ]),
    'utf8'
  );

  const result = spawnSync(
    'bun',
    [
      'tools/npm-release-preflight.ts',
      `--package-file=${packageFile}`,
      `--versions-json-file=${versionsFile}`,
      `--pack-json-file=${packFile}`,
      `--report-file=${path.join(dir, 'report.json')}`
    ],
    { cwd: packageRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not include TypeScript sources/);
});

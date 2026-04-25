import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-release-record-'));
}

test('generate-npm-release-record creates markdown with evidence and release notes', async () => {
  const dir = await tempDir();
  const packageFile = path.join(dir, 'package.json');
  const preflightFile = path.join(dir, 'npm-preflight-report.json');
  const publishFile = path.join(dir, 'npm-publish-report.json');
  const outputFile = path.join(dir, 'npm-release-record.md');

  await fs.writeFile(packageFile, JSON.stringify({ name: '@alisya.ai/ailib', version: '1.2.3' }), 'utf8');
  await fs.writeFile(
    preflightFile,
    JSON.stringify({
      packageName: '@alisya.ai/ailib',
      version: '1.2.3',
      tarball: 'alisya.ai-ailib-1.2.3.tgz',
      checkedAt: '2026-01-01T00:00:00.000Z'
    }),
    'utf8'
  );
  await fs.writeFile(
    publishFile,
    JSON.stringify({
      packageName: '@alisya.ai/ailib',
      version: '1.2.3',
      checkedAt: '2026-01-01T01:00:00.000Z'
    }),
    'utf8'
  );

  const result = spawnSync(
    'bun',
    [
      'tools/generate-npm-release-record.ts',
      `--package-file=${packageFile}`,
      `--preflight-report-file=${preflightFile}`,
      `--publish-report-file=${publishFile}`,
      `--output-file=${outputFile}`,
      '--release-notes-url=https://github.com/Alisya-AI/ai-lib/releases/tag/v1.2.3'
    ],
    { cwd: packageRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm release record written/);

  const markdown = await fs.readFile(outputFile, 'utf8');
  assert.match(markdown, /@alisya\.ai\/ailib@1\.2\.3/);
  assert.match(markdown, /alisya.ai-ailib-1\.2\.3\.tgz/);
  assert.match(markdown, /https:\/\/github\.com\/Alisya-AI\/ai-lib\/releases\/tag\/v1\.2\.3/);
});

test('generate-npm-release-record fails when release-notes-url is missing', async () => {
  const dir = await tempDir();
  const packageFile = path.join(dir, 'package.json');
  const preflightFile = path.join(dir, 'npm-preflight-report.json');
  const publishFile = path.join(dir, 'npm-publish-report.json');
  const outputFile = path.join(dir, 'npm-release-record.md');

  await fs.writeFile(packageFile, JSON.stringify({ name: '@alisya.ai/ailib', version: '1.2.3' }), 'utf8');
  await fs.writeFile(
    preflightFile,
    JSON.stringify({ packageName: '@alisya.ai/ailib', version: '1.2.3', tarball: 'alisya.ai-ailib-1.2.3.tgz' }),
    'utf8'
  );
  await fs.writeFile(publishFile, JSON.stringify({ packageName: '@alisya.ai/ailib', version: '1.2.3' }), 'utf8');

  const result = spawnSync(
    'bun',
    [
      'tools/generate-npm-release-record.ts',
      `--package-file=${packageFile}`,
      `--preflight-report-file=${preflightFile}`,
      `--publish-report-file=${publishFile}`,
      `--output-file=${outputFile}`
    ],
    { cwd: packageRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required option: --release-notes-url/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('check-coverage-threshold passes for sufficient line coverage', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-coverage-pass-'));
  const lcovPath = path.join(tmpDir, 'lcov.info');
  await fs.writeFile(
    lcovPath,
    ['DA:1,1', 'DA:2,1', 'DA:3,0', 'FNF:3', 'FNH:2', 'BRF:3', 'BRH:2', ''].join('\n'),
    'utf8'
  );

  const result = spawnSync(
    'bun',
    [
      'tools/check-coverage-threshold.ts',
      '--file',
      lcovPath,
      '--min-lines',
      '60',
      '--min-functions',
      '60',
      '--min-branches',
      '60'
    ],
    {
      cwd: packageRoot,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Coverage threshold check passed/);
});

test('check-coverage-threshold fails when below threshold', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-coverage-fail-'));
  const lcovPath = path.join(tmpDir, 'lcov.info');
  await fs.writeFile(
    lcovPath,
    ['DA:1,1', 'DA:2,0', 'DA:3,0', 'FNF:2', 'FNH:1', 'BRF:2', 'BRH:0', ''].join('\n'),
    'utf8'
  );

  const result = spawnSync(
    'bun',
    [
      'tools/check-coverage-threshold.ts',
      '--file',
      lcovPath,
      '--min-lines',
      '90',
      '--min-functions',
      '50',
      '--min-branches',
      '50'
    ],
    {
      cwd: packageRoot,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /below threshold/);
});

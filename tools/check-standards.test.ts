import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('check-standards succeeds for required project standards files', () => {
  const result = spawnSync('bun', ['tools/check-standards.ts'], {
    cwd: packageRoot,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /standards checks passed/);
});

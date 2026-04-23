import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('generate-module-catalog check mode succeeds', () => {
  const result = spawnSync('bun', ['tools/generate-module-catalog.ts', '--check'], {
    cwd: packageRoot,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /module-catalog\.md is up to date/);
});

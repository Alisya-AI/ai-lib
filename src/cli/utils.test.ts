import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  exists,
  readJson,
  resolveCanonicalSlotAlias,
  rmIfExists,
  sanitizeForFilename,
  splitCsv,
  toPosix,
  uniqueList
} from './utils.ts';
import type { Registry } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-utils-'));
}

test('string utilities normalize values as expected', () => {
  assert.equal(sanitizeForFilename('apps/api:v1'), 'apps__api_v1');
  assert.equal(toPosix(`apps${path.sep}api`), 'apps/api');
  assert.deepEqual(splitCsv(' a, b ,,c '), ['a', 'b', 'c']);
  assert.deepEqual(splitCsv(['x', 'y']), ['x', 'y']);
  assert.deepEqual(splitCsv(true), []);
  assert.deepEqual(uniqueList(['a', 'b', 'a']), ['a', 'b']);
});

test('file utilities support existence checks, reads, and safe removals', async () => {
  const root = await tempDir();
  const jsonFile = path.join(root, 'data.json');
  const nestedDir = path.join(root, 'nested');
  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(jsonFile, '{"ok":true}', 'utf8');
  await fs.writeFile(path.join(nestedDir, 'file.txt'), 'hello', 'utf8');

  assert.equal(await exists(jsonFile), true);
  assert.deepEqual(await readJson<{ ok: boolean }>(jsonFile), { ok: true });
  await rmIfExists(nestedDir);
  assert.equal(await exists(nestedDir), false);
  await rmIfExists(path.join(root, 'missing'));
});

test('resolveCanonicalSlotAlias resolves aliases and warns once', () => {
  const registry: Registry = {
    version: 'test',
    slots: ['runtime'],
    slot_aliases: { platform: 'runtime' },
    slot_alias_meta: { platform: { replacement: 'runtime', remove_in: '2.0.0' } },
    languages: { typescript: { modules: {} } },
    targets: { cursor: { output: '.cursor/rules' } }
  };

  const warnedSlotAliases = new Set<string>();
  const warnings: string[] = [];
  const writeWarning = (line: string) => {
    warnings.push(line);
  };

  assert.equal(resolveCanonicalSlotAlias({ registry, slot: 'platform', warnedSlotAliases, writeWarning }), 'runtime');
  assert.equal(resolveCanonicalSlotAlias({ registry, slot: 'platform', warnedSlotAliases, writeWarning }), 'runtime');
  assert.equal(resolveCanonicalSlotAlias({ registry, slot: 'runtime', warnedSlotAliases, writeWarning }), 'runtime');
  assert.equal(resolveCanonicalSlotAlias({ registry, slot: undefined, warnedSlotAliases, writeWarning }), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /slot alias 'platform' is deprecated/);
});

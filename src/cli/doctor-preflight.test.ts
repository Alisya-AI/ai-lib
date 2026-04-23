import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runDoctorPreflight } from './doctor-preflight.ts';
import type { CliFlags } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-doctor-preflight-'));
}

test('runDoctorPreflight returns local override error when invalid', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(rootDir, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  await fs.writeFile(
    path.join(packageRoot, 'registry.json'),
    `${JSON.stringify({ version: 'test', slots: ['linter'], languages: { typescript: { modules: {} } }, targets: {} })}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(rootDir, 'ailib.config.json'),
    `${JSON.stringify({ language: 'typescript', modules: [], targets: [] })}\n`,
    'utf8'
  );
  await fs.writeFile(path.join(rootDir, 'ailib.local.json'), '{"version":"1","workspace_overrides":[]}\n', 'utf8');

  const result = await runDoctorPreflight({
    cwd: rootDir,
    packageRoot,
    flags: { _: [] } as CliFlags,
    configFile: 'ailib.config.json',
    localOverrideFile: 'ailib.local.json',
    canonicalSlot: (_registry, slot) => slot || null
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.localOverrideError, /Invalid ailib.local.json/);
  }
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditWorkspaceRequiredFiles } from './doctor-audit.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-doctor-audit-'));
}

test('auditWorkspaceRequiredFiles reports pointer and frontmatter issues', async () => {
  const workspaceDir = await tempDir();
  const requiredFiles = ['.ailib/behavior.md', '.ailib/modules/eslint.md'];
  await fs.mkdir(path.join(workspaceDir, '.ailib/modules'), { recursive: true });
  await fs.writeFile(path.join(workspaceDir, '.ailib/behavior.md'), 'no frontmatter', 'utf8');
  await fs.writeFile(
    path.join(workspaceDir, '.ailib/modules/eslint.md'),
    '---\nid: eslint\nversion: v1\nupdated: now\nlanguage: typescript\n---\nmodule',
    'utf8'
  );

  const errors = await auditWorkspaceRequiredFiles({
    workspaceDir,
    workspaceLabel: '.',
    requiredFiles
  });

  const joined = errors.join('\n');
  assert.match(joined, /Missing frontmatter: \.ailib\/behavior\.md/);
  assert.match(joined, /Frontmatter missing 'slot': \.ailib\/modules\/eslint\.md/);
  assert.doesNotMatch(joined, /Missing pointer file/);
});

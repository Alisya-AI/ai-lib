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

test('auditWorkspaceRequiredFiles reports missing pointer files', async () => {
  const workspaceDir = await tempDir();
  const errors = await auditWorkspaceRequiredFiles({
    workspaceDir,
    workspaceLabel: '.',
    requiredFiles: ['.ailib/behavior.md']
  });
  assert.match(errors.join('\n'), /Missing pointer file: \.ailib\/behavior\.md/);
});

test('auditWorkspaceRequiredFiles validates skill frontmatter keys', async () => {
  const workspaceDir = await tempDir();
  const requiredFiles = ['.ailib/skills/task-driven-gh-flow.md'];
  await fs.mkdir(path.join(workspaceDir, '.ailib/skills'), { recursive: true });
  await fs.writeFile(
    path.join(workspaceDir, '.ailib/skills/task-driven-gh-flow.md'),
    '---\nname: task-driven-gh-flow\n---\ncontent',
    'utf8'
  );

  const errors = await auditWorkspaceRequiredFiles({
    workspaceDir,
    workspaceLabel: '.',
    requiredFiles
  });

  assert.match(errors.join('\n'), /Skill frontmatter missing 'description': \.ailib\/skills\/task-driven-gh-flow\.md/);
});

test('auditWorkspaceRequiredFiles validates missing skill name key', async () => {
  const workspaceDir = await tempDir();
  const requiredFiles = ['.ailib/skills/task-driven-gh-flow.md'];
  await fs.mkdir(path.join(workspaceDir, '.ailib/skills'), { recursive: true });
  await fs.writeFile(
    path.join(workspaceDir, '.ailib/skills/task-driven-gh-flow.md'),
    '---\ndescription: Track GH tasks\n---\ncontent',
    'utf8'
  );

  const errors = await auditWorkspaceRequiredFiles({
    workspaceDir,
    workspaceLabel: '.',
    requiredFiles
  });

  assert.match(errors.join('\n'), /Skill frontmatter missing 'name': \.ailib\/skills\/task-driven-gh-flow\.md/);
});

test('auditWorkspaceRequiredFiles validates non-skill frontmatter language/core presence', async () => {
  const workspaceDir = await tempDir();
  const requiredFiles = ['.ailib/behavior.md'];
  await fs.mkdir(path.join(workspaceDir, '.ailib'), { recursive: true });
  await fs.writeFile(
    path.join(workspaceDir, '.ailib/behavior.md'),
    '---\nid: behavior\nversion: v1\nupdated: now\n---\ncontent',
    'utf8'
  );

  const errors = await auditWorkspaceRequiredFiles({
    workspaceDir,
    workspaceLabel: '.',
    requiredFiles
  });

  assert.match(errors.join('\n'), /Frontmatter missing 'language' or 'core': \.ailib\/behavior\.md/);
});

test('auditWorkspaceRequiredFiles accepts valid skill frontmatter', async () => {
  const workspaceDir = await tempDir();
  const requiredFiles = ['.ailib/skills/task-driven-gh-flow.md'];
  await fs.mkdir(path.join(workspaceDir, '.ailib/skills'), { recursive: true });
  await fs.writeFile(
    path.join(workspaceDir, '.ailib/skills/task-driven-gh-flow.md'),
    '---\nname: task-driven-gh-flow\ndescription: Track GH tasks\n---\ncontent',
    'utf8'
  );

  const errors = await auditWorkspaceRequiredFiles({
    workspaceDir,
    workspaceLabel: '.',
    requiredFiles
  });

  assert.deepEqual(errors, []);
});

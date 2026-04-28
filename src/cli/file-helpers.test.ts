import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { copySourceFile, parseFrontmatter, writeManagedFile } from './file-helpers.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-file-helpers-'));
}

test('parseFrontmatter parses key-value and list fields', () => {
  const parsed = parseFrontmatter(
    ['---', 'id: eslint', 'tags: [lint, style]', '# comment', 'language: typescript', '---', '# body'].join('\n')
  );
  assert.deepEqual(parsed, { id: 'eslint', tags: ['lint', 'style'], language: 'typescript' });
});

test('parseFrontmatter returns null when block missing', () => {
  assert.equal(parseFrontmatter('# no frontmatter\n'), null);
});

test('writeManagedFile supports overwrite, skip, merge, and abort modes', async () => {
  const root = await tempDir();
  const target = path.join(root, 'rules.md');
  const backup = path.join(root, '.ailib', 'backups', 'rules.md.bak');

  await writeManagedFile({ workspaceDir: root, outPath: target, rendered: 'first', onConflict: 'overwrite' });
  assert.equal(await fs.readFile(target, 'utf8'), 'first\n');
  await assert.rejects(fs.readFile(backup, 'utf8'));

  await writeManagedFile({ workspaceDir: root, outPath: target, rendered: 'second', onConflict: 'skip' });
  assert.equal(await fs.readFile(target, 'utf8'), 'first\n');

  await writeManagedFile({ workspaceDir: root, outPath: target, rendered: 'merged-content', onConflict: 'merge' });
  const merged = await fs.readFile(target, 'utf8');
  assert.match(merged, /<!-- ailib:start -->/);
  assert.match(merged, /merged-content/);
  assert.equal(await fs.readFile(backup, 'utf8'), 'first\n');

  await assert.rejects(
    writeManagedFile({ workspaceDir: root, outPath: target, rendered: 'ignored', onConflict: 'abort' }),
    /Conflict detected/
  );
});

test('writeManagedFile does not create backup for first-run nested paths', async () => {
  const root = await tempDir();
  const target = path.join(root, 'nested', 'configs', 'rules.md');
  const backup = path.join(root, '.ailib', 'backups', 'nested', 'configs', 'rules.md.bak');

  await writeManagedFile({ workspaceDir: root, outPath: target, rendered: 'first-run', onConflict: 'overwrite' });
  assert.equal(await fs.readFile(target, 'utf8'), 'first-run\n');
  await assert.rejects(fs.readFile(backup, 'utf8'));
});

test('writeManagedFile preserves existing backup on first write', async () => {
  const root = await tempDir();
  const target = path.join(root, 'rules.md');
  const backup = path.join(root, '.ailib', 'backups', 'rules.md.bak');
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.writeFile(backup, 'existing-backup\n', 'utf8');

  await writeManagedFile({ workspaceDir: root, outPath: target, rendered: 'first-run', onConflict: 'overwrite' });
  assert.equal(await fs.readFile(target, 'utf8'), 'first-run\n');
  assert.equal(await fs.readFile(backup, 'utf8'), 'existing-backup\n');
});

test('writeManagedFile writes backup under .ailib/backups for existing nested files', async () => {
  const root = await tempDir();
  const target = path.join(root, 'nested', 'configs', 'rules.md');
  const backup = path.join(root, '.ailib', 'backups', 'nested', 'configs', 'rules.md.bak');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'existing\n', 'utf8');

  await writeManagedFile({ workspaceDir: root, outPath: target, rendered: 'updated', onConflict: 'overwrite' });
  assert.equal(await fs.readFile(target, 'utf8'), 'updated\n');
  assert.equal(await fs.readFile(backup, 'utf8'), 'existing\n');
});

test('copySourceFile copies from package source and validates existence', async () => {
  const root = await tempDir();
  const packageRoot = path.join(root, 'pkg');
  const targetRoot = path.join(root, 'out');
  await fs.mkdir(path.join(packageRoot, 'core'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'core', 'behavior.md'), '# behavior\n', 'utf8');

  const target = path.join(targetRoot, 'behavior.md');
  await copySourceFile({ packageRoot, sourceRel: 'core/behavior.md', target });
  assert.equal(await fs.readFile(target, 'utf8'), '# behavior\n');

  await assert.rejects(
    copySourceFile({ packageRoot, sourceRel: 'core/missing.md', target: path.join(targetRoot, 'missing.md') }),
    /Missing module source: core\/missing\.md/
  );
});

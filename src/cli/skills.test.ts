import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { skillsCommand } from './skills.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-skills-command-'));
}

test('skillsCommand rejects unsupported subcommands', async () => {
  await assert.rejects(
    skillsCommand({ cwd: process.cwd(), flags: { _: ['unknown'] } }),
    /Usage: ailib skills init <skill-id>/
  );
});

test('skillsCommand scaffolds default skill path', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  await skillsCommand({
    cwd,
    flags: { _: ['init', 'task-driven-gh-flow'] }
  });

  const content = await fs.readFile(path.join(cwd, '.cursor/skills/task-driven-gh-flow/SKILL.md'), 'utf8');
  assert.match(content, /name: task-driven-gh-flow/);
  assert.match(content, /description: TODO: describe this skill/);
});

test('skillsCommand scaffolds using custom path and description', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  await skillsCommand({
    cwd,
    flags: {
      _: ['init', 'release-manager'],
      path: '.cursor/skills/custom-release',
      description: 'Release workflow automation'
    }
  });

  const content = await fs.readFile(path.join(cwd, '.cursor/skills/custom-release/SKILL.md'), 'utf8');
  assert.match(content, /name: release-manager/);
  assert.match(content, /description: Release workflow automation/);
});

test('skillsCommand rejects invalid skill id and existing files without force', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  await assert.rejects(skillsCommand({ cwd, flags: { _: ['init', 'BadId'] } }), /Invalid skill id: BadId/);

  await skillsCommand({ cwd, flags: { _: ['init', 'code-review'] } });
  await assert.rejects(
    skillsCommand({ cwd, flags: { _: ['init', 'code-review'] } }),
    /Skill file already exists: .*Re-run with --force to overwrite/
  );

  await skillsCommand({
    cwd,
    flags: { _: ['init', 'code-review'], force: true, description: 'Overwritten content' }
  });
  const content = await fs.readFile(path.join(cwd, '.cursor/skills/code-review/SKILL.md'), 'utf8');
  assert.match(content, /description: Overwritten content/);
});

test('skillsCommand supports --workspace targeting and blocks path escapes', async () => {
  const root = await tempDir();
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  const workspace = path.join(root, 'apps/web');
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(workspace, 'ailib.config.json'), '{"language":"typescript"}\n', 'utf8');

  await skillsCommand({
    cwd: root,
    flags: { _: ['init', 'triage'], workspace: 'apps/web' }
  });

  const scaffoldPath = path.join(workspace, '.cursor/skills/triage/SKILL.md');
  const content = await fs.readFile(scaffoldPath, 'utf8');
  assert.match(content, /name: triage/);

  await assert.rejects(
    skillsCommand({
      cwd: root,
      flags: { _: ['init', 'escape-test'], workspace: 'apps/web', path: '../outside' }
    }),
    /Skill path must be within workspace/
  );
});

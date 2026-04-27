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
    /Usage: ailib skills list.*ailib skills remove.*ailib skills validate/s
  );
});

test('skillsCommand copies built-in skill content when id matches', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  await skillsCommand({
    cwd,
    packageRoot,
    flags: { _: ['add', 'task-driven-gh-flow'] }
  });

  const content = await fs.readFile(path.join(cwd, '.cursor/skills/task-driven-gh-flow/SKILL.md'), 'utf8');
  assert.match(content, /name: task-driven-gh-flow/);
  assert.match(content, /description: Execute roadmap work through GitHub tasks with strict traceability/);
  assert.match(content, /## When to Use/);
  assert.match(content, /## Instructions/);
  assert.match(content, /## Non-Negotiable Rules/);
  assert.doesNotMatch(content, /## Purpose/);
  assert.doesNotMatch(content, /## Workflow/);
  assert.doesNotMatch(content, /TODO: describe this skill/);
});

test('skillsCommand supports description override for built-in skill content', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  await skillsCommand({
    cwd,
    packageRoot,
    flags: {
      _: ['add', 'task-driven-gh-flow'],
      description: 'My localized task-driven guidance'
    }
  });

  const content = await fs.readFile(path.join(cwd, '.cursor/skills/task-driven-gh-flow/SKILL.md'), 'utf8');
  assert.match(content, /description: My localized task-driven guidance/);
  assert.match(content, /## When to Use/);
  assert.match(content, /## Instructions/);
  assert.match(content, /## Non-Negotiable Rules/);
});

test('skillsCommand does not overwrite existing local skill file for built-in id', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const target = path.join(cwd, '.cursor/skills/task-driven-gh-flow/SKILL.md');

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'custom local skill content\n', 'utf8');

  await assert.rejects(
    skillsCommand({
      cwd,
      packageRoot,
      flags: { _: ['add', 'task-driven-gh-flow'], force: true }
    }),
    /Built-in seeding will not overwrite existing local skill files/
  );

  const content = await fs.readFile(target, 'utf8');
  assert.equal(content, 'custom local skill content\n');
});

test('skillsCommand scaffolds using custom path and description', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  await skillsCommand({
    cwd,
    flags: {
      _: ['add', 'release-manager'],
      path: '.cursor/skills/custom-release',
      description: 'Release workflow automation'
    }
  });

  const content = await fs.readFile(path.join(cwd, '.cursor/skills/custom-release/SKILL.md'), 'utf8');
  assert.match(content, /name: release-manager/);
  assert.match(content, /description: Release workflow automation/);
  assert.match(content, /## When to Use/);
  assert.match(content, /## Instructions/);
});

test('skillsCommand rejects invalid skill id and existing files without force', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  await assert.rejects(skillsCommand({ cwd, flags: { _: ['init', 'BadId'] } }), /Invalid skill id: BadId/);

  await skillsCommand({ cwd, flags: { _: ['add', 'code-review'] } });
  await assert.rejects(
    skillsCommand({ cwd, flags: { _: ['add', 'code-review'] } }),
    /Skill file already exists: .*Re-run with --force to overwrite/
  );

  await skillsCommand({
    cwd,
    flags: { _: ['add', 'code-review'], force: true, description: 'Overwritten content' }
  });
  const content = await fs.readFile(path.join(cwd, '.cursor/skills/code-review/SKILL.md'), 'utf8');
  assert.match(content, /description: Overwritten content/);
});

test('skillsCommand supports claude-code format profile', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  await skillsCommand({
    cwd,
    flags: {
      _: ['add', 'claude-planner'],
      path: '.claude/skills/claude-planner',
      format: 'claude-code'
    }
  });

  const content = await fs.readFile(path.join(cwd, '.claude/skills/claude-planner/SKILL.md'), 'utf8');
  assert.match(content, /## Purpose/);
  assert.match(content, /## Workflow/);
  assert.doesNotMatch(content, /## When to Use/);
});

test('skillsCommand rejects unsupported format profile', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  await assert.rejects(
    skillsCommand({
      cwd,
      flags: { _: ['add', 'invalid-format'], format: 'copilot' }
    }),
    /Invalid skills format: copilot/
  );
});

test('skillsCommand supports --workspace targeting and blocks path escapes', async () => {
  const root = await tempDir();
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  const workspace = path.join(root, 'apps/web');
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(workspace, 'ailib.config.json'), '{"language":"typescript"}\n', 'utf8');

  await skillsCommand({
    cwd: root,
    flags: { _: ['add', 'triage'], workspace: 'apps/web' }
  });

  const scaffoldPath = path.join(workspace, '.cursor/skills/triage/SKILL.md');
  const content = await fs.readFile(scaffoldPath, 'utf8');
  assert.match(content, /name: triage/);

  await assert.rejects(
    skillsCommand({
      cwd: root,
      flags: { _: ['add', 'escape-test'], workspace: 'apps/web', path: '../outside' }
    }),
    /Skill path must be within workspace/
  );
});

test('skillsCommand supports init alias and remove command', async () => {
  const cwd = await tempDir();
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  await skillsCommand({
    cwd,
    flags: { _: ['init', 'cleanup-me'], description: 'Temp skill' }
  });

  const skillPath = path.join(cwd, '.cursor/skills/cleanup-me/SKILL.md');
  assert.match(await fs.readFile(skillPath, 'utf8'), /description: Temp skill/);

  await skillsCommand({
    cwd,
    flags: { _: ['remove', 'cleanup-me'] }
  });

  await assert.rejects(fs.access(skillPath), /ENOENT/);
  await assert.rejects(
    skillsCommand({
      cwd,
      flags: { _: ['remove', 'cleanup-me'] }
    }),
    /Skill file does not exist:/
  );
});

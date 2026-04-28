import fs from 'node:fs/promises';
import path from 'node:path';
import { copySourceFile } from './file-helpers.ts';
import { convertSkillMarkdownFormat } from './skill-format.ts';
import { isUnderLocalCustomSkillsRoot, localCustomSkillPath } from './skill-paths.ts';
import { exists, rmIfExists } from './utils.ts';
import type { Registry, TargetDefinition, WorkspaceState } from './types.ts';

export async function ensureWorkspaceAssets({
  workspaceDir,
  packageRoot,
  state,
  rootDir,
  registry
}: {
  workspaceDir: string;
  packageRoot: string;
  state: WorkspaceState;
  rootDir: string;
  registry: Registry;
}) {
  const outRoot = path.join(workspaceDir, '.ailib');
  await fs.mkdir(path.join(outRoot, 'modules'), { recursive: true });
  await fs.mkdir(path.join(outRoot, 'skills'), { recursive: true });

  if (path.resolve(workspaceDir) === path.resolve(rootDir)) {
    await copySourceFile({ packageRoot, sourceRel: 'core/behavior.md', target: path.join(outRoot, 'behavior.md') });
    const architectureSourceRel = 'core/architecture.md';
    const architectureSource = path.join(packageRoot, architectureSourceRel);
    const architectureTarget = path.join(outRoot, 'architecture.md');
    if (await exists(architectureSource)) {
      await copySourceFile({ packageRoot, sourceRel: architectureSourceRel, target: architectureTarget });
    } else {
      await rmIfExists(architectureTarget);
    }
  }

  await copySourceFile({
    packageRoot,
    sourceRel: 'core/development-standards.md',
    target: path.join(outRoot, 'development-standards.md')
  });

  await copySourceFile({
    packageRoot,
    sourceRel: 'core/test-standards.md',
    target: path.join(outRoot, 'test-standards.md')
  });

  await copySourceFile({
    packageRoot,
    sourceRel: `languages/${state.effective.language}/core.md`,
    target: path.join(outRoot, 'standards.md')
  });

  const localModules = state.localModules;
  const localSet = new Set(localModules);
  for (const mod of localModules) {
    const sourceRel = `languages/${state.effective.language}/modules/${mod}.md`;
    const source = path.join(packageRoot, sourceRel);
    const target = path.join(outRoot, 'modules', `${mod}.md`);
    if (await exists(source)) {
      await copySourceFile({ packageRoot, sourceRel, target });
      continue;
    }

    const existing = path.join(outRoot, 'modules', `${mod}.md`);
    ensure(await exists(existing), `Missing module source: ${sourceRel}`);
  }

  const moduleDir = path.join(outRoot, 'modules');
  if (await exists(moduleDir)) {
    for (const entry of await fs.readdir(moduleDir)) {
      if (!entry.endsWith('.md')) continue;
      const id = entry.replace(/\.md$/u, '');
      if (!localSet.has(id)) await rmIfExists(path.join(moduleDir, entry));
    }
  }

  const localSkills = state.localSkills;
  const localSkillSet = new Set(localSkills);
  const selectedTargetIds = (state.effective.targets || []).filter((targetId) => Boolean(registry.targets[targetId]));
  const selectedTargetSet = new Set(selectedTargetIds);
  const registrySkills = registry.skills || {};
  for (const skillId of localSkills) {
    const skillDef = registrySkills[skillId];
    ensure(skillDef, `Missing skill definition: ${skillId}`);

    const source = await resolveSkillSourceContent({
      skillId,
      skillPath: skillDef.path,
      packageRoot,
      workspaceDir,
      rootDir,
      outRoot
    });
    await writeFileFromContent(path.join(outRoot, 'skills', `${skillId}.md`), source);
    for (const targetId of selectedTargetIds) {
      const targetDef = registry.targets[targetId];
      const targetFormat = resolveTargetSkillFormat({ targetId, targetDef });
      const rendered = convertSkillMarkdownFormat({ source, targetFormat });
      await writeFileFromContent(path.join(outRoot, 'skills', targetId, `${skillId}.md`), rendered);
    }
  }

  const skillDir = path.join(outRoot, 'skills');
  if (await exists(skillDir)) {
    for (const entry of await fs.readdir(skillDir)) {
      if (!entry.endsWith('.md')) continue;
      const id = entry.replace(/\.md$/u, '');
      if (!localSkillSet.has(id) && registrySkills[id]) await rmIfExists(path.join(skillDir, entry));
    }
  }
  for (const targetId of Object.keys(registry.targets || {})) {
    const targetDir = path.join(skillDir, targetId);
    if (!(await exists(targetDir))) continue;
    if (!selectedTargetSet.has(targetId)) {
      await rmIfExists(targetDir);
      continue;
    }

    for (const entry of await fs.readdir(targetDir)) {
      if (!entry.endsWith('.md')) continue;
      const id = entry.replace(/\.md$/u, '');
      if (!localSkillSet.has(id) && registrySkills[id]) await rmIfExists(path.join(targetDir, entry));
    }
    const remaining = await fs.readdir(targetDir);
    if (!remaining.length) await rmIfExists(targetDir);
  }
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function writeFileFromContent(target: string, content: string) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function resolveSkillSourceContent({
  skillId,
  skillPath,
  packageRoot,
  workspaceDir,
  rootDir,
  outRoot
}: {
  skillId: string;
  skillPath: string;
  packageRoot: string;
  workspaceDir: string;
  rootDir: string;
  outRoot: string;
}) {
  const workspaceLocalSource = path.join(workspaceDir, localCustomSkillPath(skillId));
  if (await exists(workspaceLocalSource)) return fs.readFile(workspaceLocalSource, 'utf8');

  const rootLocalSource = path.join(rootDir, localCustomSkillPath(skillId));
  if (await exists(rootLocalSource)) return fs.readFile(rootLocalSource, 'utf8');

  const packagedSource = path.join(packageRoot, skillPath);
  if (await exists(packagedSource)) return fs.readFile(packagedSource, 'utf8');

  const existing = path.join(outRoot, 'skills', `${skillId}.md`);
  if (await exists(existing)) return fs.readFile(existing, 'utf8');

  if (isUnderLocalCustomSkillsRoot(skillPath)) {
    throw new Error(
      `Missing local custom skill source: ${skillId} (checked ${localCustomSkillPath(skillId)} in workspace and root)`
    );
  }
  ensure(false, `Missing skill source: ${skillPath}`);
}

function resolveTargetSkillFormat({
  targetId,
  targetDef
}: {
  targetId: string;
  targetDef: TargetDefinition | undefined;
}): 'cursor' | 'claude-code' {
  const declared = targetDef?.skill_profile?.format;
  if (declared === 'cursor' || declared === 'claude-code') return declared;
  return targetId === 'cursor' ? 'cursor' : 'claude-code';
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { ensure } from './assertions.ts';
import { resolveContext, resolveDefaultWorkspaceForMutation } from './context-resolution.ts';
import { getStringFlag } from './flags.ts';
import { skillsCatalogCommand } from './introspection.ts';
import { renderSkillTemplate } from './skill-template.ts';
import { skillsValidateCommand } from './skills-validate.ts';
import type { CliFlags } from './types.ts';

const SKILL_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function skillsCommand({
  cwd,
  packageRoot,
  flags
}: {
  cwd: string;
  packageRoot?: string;
  flags: CliFlags;
}) {
  const sub = flags._[0];
  if (sub === 'list' || sub === 'explain') {
    ensure(packageRoot, 'Internal error: packageRoot is required for skills discovery commands');
    await skillsCatalogCommand({ packageRoot, flags });
    return;
  }
  if (sub === 'add' || sub === 'init') {
    await skillsAddCommand({ cwd, packageRoot, flags });
    return;
  }
  if (sub === 'remove') {
    await skillsRemoveCommand({ cwd, flags });
    return;
  }
  if (sub === 'validate') {
    await skillsValidateCommand({ cwd, flags });
    return;
  }
  throw new Error(
    'Usage: ailib skills list | ailib skills explain <skill-id> | ailib skills add <skill-id> [--workspace=<path>] [--path=<path>] [--description=<text>] [--force] | ailib skills remove <skill-id> [--workspace=<path>] [--path=<path>] | ailib skills validate [--workspace=<path>] [--path=<path>]'
  );
}

export async function skillsAddCommand({
  cwd,
  packageRoot,
  flags
}: {
  cwd: string;
  packageRoot?: string;
  flags: CliFlags;
}) {
  const skillId = flags._[1];
  ensure(
    skillId,
    'Usage: ailib skills add <skill-id> [--workspace=<path>] [--path=<path>] [--description=<text>] [--force]'
  );
  ensure(SKILL_ID_RE.test(skillId), `Invalid skill id: ${skillId}`);

  const context = await resolveContext(cwd);
  const workspaceFlag = getStringFlag(flags, 'workspace');
  const targetWorkspace = resolveDefaultWorkspaceForMutation(context, workspaceFlag);
  const pathFlag = getStringFlag(flags, 'path');
  const description = getStringFlag(flags, 'description');
  const force = flags.force === true;

  const target = resolveSkillFilePath({ targetWorkspace, skillId, pathFlag });
  assertPathUnderWorkspace({ targetWorkspace, target });

  const builtInSkillContent = await resolveBuiltInSkillContent({ packageRoot, skillId, description });

  await fs.mkdir(path.dirname(target), { recursive: true });

  let targetExists = false;
  try {
    await fs.access(target);
    targetExists = true;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }

  if (targetExists) {
    if (builtInSkillContent !== null) {
      throw new Error(
        `Skill file already exists: ${target}. Built-in seeding will not overwrite existing local skill files. Remove the file first or use a different --path.`
      );
    }

    if (!force) {
      throw new Error(`Skill file already exists: ${target}. Re-run with --force to overwrite.`);
    }
  }

  const scaffoldContent = builtInSkillContent ?? renderSkillTemplate({ skillId, description });
  await fs.writeFile(target, scaffoldContent, 'utf8');
  process.stdout.write(`skill scaffolded: ${skillId} -> ${target}\n`);
}

export async function skillsInitCommand({
  cwd,
  packageRoot,
  flags
}: {
  cwd: string;
  packageRoot?: string;
  flags: CliFlags;
}) {
  await skillsAddCommand({ cwd, packageRoot, flags });
}

export async function skillsRemoveCommand({ cwd, flags }: { cwd: string; flags: CliFlags }) {
  const skillId = flags._[1];
  ensure(skillId, 'Usage: ailib skills remove <skill-id> [--workspace=<path>] [--path=<path>]');
  ensure(SKILL_ID_RE.test(skillId), `Invalid skill id: ${skillId}`);

  const context = await resolveContext(cwd);
  const workspaceFlag = getStringFlag(flags, 'workspace');
  const targetWorkspace = resolveDefaultWorkspaceForMutation(context, workspaceFlag);
  const pathFlag = getStringFlag(flags, 'path');

  const target = resolveSkillFilePath({ targetWorkspace, skillId, pathFlag });
  assertPathUnderWorkspace({ targetWorkspace, target });

  try {
    await fs.rm(target);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Skill file does not exist: ${target}`);
    }
    throw error;
  }

  process.stdout.write(`skill removed: ${skillId} -> ${target}\n`);
}

export function resolveSkillFilePath({
  targetWorkspace,
  skillId,
  pathFlag
}: {
  targetWorkspace: string;
  skillId: string;
  pathFlag: string | undefined;
}) {
  if (!pathFlag) return path.join(targetWorkspace, '.cursor/skills', skillId, 'SKILL.md');

  const resolved = path.isAbsolute(pathFlag) ? path.resolve(pathFlag) : path.resolve(targetWorkspace, pathFlag);
  if (path.basename(resolved).toLowerCase() === 'skill.md') return resolved;
  return path.join(resolved, 'SKILL.md');
}

function assertPathUnderWorkspace({ targetWorkspace, target }: { targetWorkspace: string; target: string }) {
  const rel = path.relative(path.resolve(targetWorkspace), path.resolve(target));
  ensure(!rel.startsWith('..') && !path.isAbsolute(rel), `Skill path must be within workspace: ${targetWorkspace}`);
}

async function resolveBuiltInSkillContent({
  packageRoot,
  skillId,
  description
}: {
  packageRoot?: string;
  skillId: string;
  description: string | undefined;
}): Promise<string | null> {
  if (!packageRoot) return null;

  const builtInPath = path.join(packageRoot, 'skills', `${skillId}.md`);
  try {
    const source = await fs.readFile(builtInPath, 'utf8');
    if (!description) return source;
    return applyDescriptionOverride(source, description);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function applyDescriptionOverride(markdown: string, description: string): string {
  const lines = markdown.split('\n');
  if (lines[0] !== '---') return markdown;

  let frontmatterEnd = -1;
  let descriptionLine = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') {
      frontmatterEnd = i;
      break;
    }
    if (lines[i].startsWith('description:')) descriptionLine = i;
  }
  if (frontmatterEnd < 0) return markdown;

  if (descriptionLine >= 0) lines[descriptionLine] = `description: ${description}`;
  else lines.splice(frontmatterEnd, 0, `description: ${description}`);
  return lines.join('\n');
}

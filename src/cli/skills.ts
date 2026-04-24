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
  if (sub === 'init') {
    await skillsInitCommand({ cwd, flags });
    return;
  }
  if (sub === 'validate') {
    await skillsValidateCommand({ cwd, flags });
    return;
  }
  throw new Error(
    'Usage: ailib skills list | ailib skills explain <skill-id> | ailib skills init <skill-id> [--workspace=<path>] [--path=<path>] [--description=<text>] [--force] | ailib skills validate [--workspace=<path>] [--path=<path>]'
  );
}

export async function skillsInitCommand({ cwd, flags }: { cwd: string; flags: CliFlags }) {
  const skillId = flags._[1];
  ensure(
    skillId,
    'Usage: ailib skills init <skill-id> [--workspace=<path>] [--path=<path>] [--description=<text>] [--force]'
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

  await fs.mkdir(path.dirname(target), { recursive: true });

  if (!force) {
    try {
      await fs.access(target);
      throw new Error(`Skill file already exists: ${target}. Re-run with --force to overwrite.`);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }

  await fs.writeFile(target, renderSkillTemplate({ skillId, description }), 'utf8');
  process.stdout.write(`skill scaffolded: ${skillId} -> ${target}\n`);
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

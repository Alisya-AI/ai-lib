import path from 'node:path';
import { relativePathForPointers, workspaceLabelFor } from './context-resolution.ts';
import { writeManagedFile } from './file-helpers.ts';
import { sanitizeForFilename, toPosix } from './utils.ts';
import type { Registry, WorkspaceState } from './types.ts';

export async function generateWorkspaceRouters({
  workspaceDir,
  rootDir,
  state,
  onConflict,
  allStates,
  registry
}: {
  workspaceDir: string;
  rootDir: string;
  state: WorkspaceState;
  onConflict: string;
  allStates: Map<string, WorkspaceState>;
  registry: Registry;
}) {
  const targetSet = new Set<string>(state.effective.targets || []);
  const atRoot = path.resolve(workspaceDir) === path.resolve(rootDir);

  await writeStandardTargetRouters({ workspaceDir, rootDir, state, onConflict, atRoot, targetSet, registry });

  if (!atRoot || !targetSet.has('copilot')) return;
  await writeCopilotRouters({ rootDir, allStates, registry, onConflict });
}

async function writeStandardTargetRouters({
  workspaceDir,
  rootDir,
  state,
  onConflict,
  atRoot,
  targetSet,
  registry
}: {
  workspaceDir: string;
  rootDir: string;
  state: WorkspaceState;
  onConflict: string;
  atRoot: boolean;
  targetSet: Set<string>;
  registry: Registry;
}) {
  for (const targetId of targetSet) {
    const targetDef = registry.targets[targetId];
    if (!targetDef || targetDef.mode === 'copilot') continue;

    const label = targetDef.display || targetId;
    const frontmatter = targetDef.frontmatter
      ? atRoot
        ? targetDef.frontmatter.root
        : targetDef.frontmatter.workspace
      : '';
    const rendered = `${frontmatter || ''}${renderRouterDoc({ label, workspaceDir, rootDir, state, targetId })}`;
    await writeManagedFile({ outPath: path.join(workspaceDir, targetDef.output), rendered, onConflict });
    if (atRoot && targetDef.root_output) {
      await writeManagedFile({ outPath: path.join(workspaceDir, targetDef.root_output), rendered, onConflict });
    }
  }
}

async function writeCopilotRouters({
  rootDir,
  allStates,
  registry,
  onConflict
}: {
  rootDir: string;
  allStates: Map<string, WorkspaceState>;
  registry: Registry;
  onConflict: string;
}) {
  const scopedStates = [...allStates.entries()].filter(([, s]) => (s.effective.targets || []).includes('copilot'));
  const copilotLabel = registry.targets.copilot?.display || 'GitHub Copilot';
  const sections = scopedStates
    .map(([dir, state]) => {
      const label = workspaceLabelFor(rootDir, dir);
      return `## Workspace: ${label}\n\n${renderRouterDoc({ label: copilotLabel, workspaceDir: dir, rootDir, state, targetId: 'copilot' }).trim()}\n`;
    })
    .join('\n');

  await writeManagedFile({
    outPath: path.join(rootDir, registry.targets.copilot?.output || '.github/copilot-instructions.md'),
    rendered: `# ailib Router (${copilotLabel})\n\n${sections}`,
    onConflict
  });

  for (const [workspaceDir, state] of scopedStates) {
    await writeCopilotWorkspaceInstruction({
      rootDir,
      workspaceDir,
      state,
      copilotLabel,
      onConflict
    });
  }
}

async function writeCopilotWorkspaceInstruction({
  rootDir,
  workspaceDir,
  state,
  copilotLabel,
  onConflict
}: {
  rootDir: string;
  workspaceDir: string;
  state: WorkspaceState;
  copilotLabel: string;
  onConflict: string;
}) {
  const rel = workspaceLabelFor(rootDir, workspaceDir);
  const applyTo = rel === '.' ? '**' : `${toPosix(rel)}/**`;
  const fileName = rel === '.' ? 'root.instructions.md' : `${sanitizeForFilename(rel)}.instructions.md`;
  const content = `---\napplyTo: "${applyTo}"\n---\n\n${renderRouterDoc({ label: copilotLabel, workspaceDir, rootDir, state, targetId: 'copilot' })}`;
  await writeManagedFile({
    outPath: path.join(rootDir, '.github/instructions', fileName),
    rendered: content,
    onConflict
  });
}

export function renderRouterDoc({
  label,
  workspaceDir,
  rootDir,
  state,
  targetId = 'cursor'
}: {
  label: string;
  workspaceDir: string;
  rootDir: string;
  state: WorkspaceState;
  targetId?: string;
}) {
  const relToRoot = relativePathForPointers(workspaceDir, rootDir);
  const behaviorRef =
    path.resolve(workspaceDir) === path.resolve(rootDir)
      ? '@.ailib/behavior.md'
      : `@${toPosix(path.join(relToRoot, '.ailib/behavior.md'))}`;

  const inheritedModuleLines = state.inheritedModules.map((mod) => {
    const modPath = `@${toPosix(path.join(relToRoot, '.ailib/modules', `${mod}.md`))}`;
    return `- ${modPath}`;
  });

  const localModuleLines = state.localModules.map((mod) => `- @.ailib/modules/${mod}.md`);
  const moduleLines = [...inheritedModuleLines, ...localModuleLines];
  const inheritedSkillLines = state.inheritedSkills.map((skill) => {
    const skillPath = `@${toPosix(path.join(relToRoot, '.ailib/skills', targetId, `${skill}.md`))}`;
    return `- ${skillPath}`;
  });
  const localSkillLines = state.localSkills.map((skill) => `- @.ailib/skills/${targetId}/${skill}.md`);
  const skillLines = [...inheritedSkillLines, ...localSkillLines];
  const docsBlock =
    path.resolve(workspaceDir) === path.resolve(rootDir)
      ? '# PROJECT-SPECIFIC CONTEXT\nPrioritize project context in @./docs/.\n'
      : `# PROJECT-SPECIFIC CONTEXT\nPrioritize service-local business logic in @./docs/.\nFor cross-service context, consult @${toPosix(path.join(relToRoot, 'docs/'))}.\nIf guidance conflicts, service-local docs win for service-scoped work.\n`;

  const modulesText = moduleLines.length ? moduleLines.join('\n') : '- (none)';
  const skillsText = skillLines.length ? skillLines.join('\n') : '- (none)';
  return `# ailib Router (${label})\n\n# AILIB SYSTEM PROMPT\nAct as the AI Agent defined in ${behaviorRef}.\nAdhere to the coding standards in @.ailib/standards.md.\nApply development workflow rules in @.ailib/development-standards.md.\nApply test and coverage rules in @.ailib/test-standards.md.\n\n# MODULES & EXTENSIONS\n${modulesText}\n\n# SKILLS\n${skillsText}\n\n${docsBlock}`;
}

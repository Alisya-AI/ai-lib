import fs from 'node:fs/promises';
import path from 'node:path';
import { relativePathForPointers, workspaceLabelFor } from './context-resolution.ts';
import { writeManagedFile } from './file-helpers.ts';
import { sanitizeForFilename, toPosix } from './utils.ts';
import type { Registry, TargetOutputMode, WorkspaceState } from './types.ts';

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
  const targetOutputMode = state.effective.target_output_mode || 'native';
  await writeWorkspaceContextFiles({ workspaceDir, rootDir, state, targetSet });

  await writeStandardTargetRouters({
    workspaceDir,
    onConflict,
    atRoot,
    targetSet,
    targetOutputMode,
    registry
  });
  await writeCompatibilityRouters({
    workspaceDir,
    onConflict,
    targetSet,
    targetOutputMode,
    registry
  });

  if (!atRoot || !targetSet.has('copilot')) return;
  await writeCopilotRouters({ rootDir, allStates, registry, onConflict, targetOutputMode });
}

async function writeStandardTargetRouters({
  workspaceDir,
  onConflict,
  atRoot,
  targetSet,
  targetOutputMode,
  registry
}: {
  workspaceDir: string;
  onConflict: string;
  atRoot: boolean;
  targetSet: Set<string>;
  targetOutputMode: TargetOutputMode;
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
    const rendered = `${frontmatter || ''}${renderRouterDoc({
      label,
      targetId,
      routerRole: 'native',
      targetOutputMode,
      primaryTargetId: targetId,
      primaryOutputPath: targetDef.output
    })}`;
    await writeManagedFile({
      workspaceDir,
      outPath: path.join(workspaceDir, targetDef.output),
      rendered,
      onConflict
    });
    if (atRoot && targetDef.root_output) {
      await writeManagedFile({
        workspaceDir,
        outPath: path.join(workspaceDir, targetDef.root_output),
        rendered,
        onConflict
      });
    }
  }
}

async function writeCompatibilityRouters({
  workspaceDir,
  onConflict,
  targetSet,
  targetOutputMode,
  registry
}: {
  workspaceDir: string;
  onConflict: string;
  targetSet: Set<string>;
  targetOutputMode: TargetOutputMode;
  registry: Registry;
}) {
  if (targetOutputMode !== 'compat') return;

  if (targetSet.has('cursor') && !targetSet.has('openai')) {
    await writeManagedFile({
      workspaceDir,
      outPath: path.join(workspaceDir, 'AGENTS.md'),
      rendered: renderRouterDoc({
        label: 'OpenAI Codex (compat)',
        targetId: 'cursor',
        routerRole: 'compat',
        targetOutputMode,
        primaryTargetId: 'cursor',
        primaryOutputPath: registry.targets.cursor?.output || '.cursor/rules/ailib.mdc'
      }),
      onConflict
    });
  }

  if (targetSet.has('openai') && !targetSet.has('claude-code')) {
    await writeManagedFile({
      workspaceDir,
      outPath: path.join(workspaceDir, 'CLAUDE.md'),
      rendered: renderRouterDoc({
        label: 'Claude Code (compat)',
        targetId: 'openai',
        routerRole: 'compat',
        targetOutputMode,
        primaryTargetId: 'openai',
        primaryOutputPath: registry.targets.openai?.output || 'AGENTS.md'
      }),
      onConflict
    });
  }
}

async function writeCopilotRouters({
  rootDir,
  allStates,
  registry,
  onConflict,
  targetOutputMode
}: {
  rootDir: string;
  allStates: Map<string, WorkspaceState>;
  registry: Registry;
  onConflict: string;
  targetOutputMode: TargetOutputMode;
}) {
  const scopedStates = [...allStates.entries()].filter(([, s]) => (s.effective.targets || []).includes('copilot'));
  const copilotLabel = registry.targets.copilot?.display || 'GitHub Copilot';
  const sections = scopedStates
    .map(([dir]) => {
      const label = workspaceLabelFor(rootDir, dir);
      return `## Workspace: ${label}\n\n${renderWorkspaceContextPointers({ workspaceDir: dir, rootDir, targetId: 'copilot' })}\n`;
    })
    .join('\n');

  await writeManagedFile({
    workspaceDir: rootDir,
    outPath: path.join(rootDir, registry.targets.copilot?.output || '.github/copilot-instructions.md'),
    rendered: `${renderPrecedenceBlock({
      routerRole: 'native',
      targetOutputMode,
      primaryTargetId: 'copilot',
      primaryOutputPath: registry.targets.copilot?.output || '.github/copilot-instructions.md'
    })}\n# ailib Router (${copilotLabel})\n\n${sections}`,
    onConflict
  });

  for (const [workspaceDir] of scopedStates) {
    await writeCopilotWorkspaceInstruction({
      rootDir,
      workspaceDir,
      copilotLabel,
      onConflict,
      targetOutputMode
    });
  }
}

async function writeCopilotWorkspaceInstruction({
  rootDir,
  workspaceDir,
  copilotLabel,
  onConflict,
  targetOutputMode
}: {
  rootDir: string;
  workspaceDir: string;
  copilotLabel: string;
  onConflict: string;
  targetOutputMode: TargetOutputMode;
}) {
  const rel = workspaceLabelFor(rootDir, workspaceDir);
  const applyTo = rel === '.' ? '**' : `${toPosix(rel)}/**`;
  const fileName = rel === '.' ? 'root.instructions.md' : `${sanitizeForFilename(rel)}.instructions.md`;
  const content = `---\napplyTo: "${applyTo}"\n---\n\n${renderRouterDoc({
    label: copilotLabel,
    targetId: 'copilot',
    routerRole: 'native',
    targetOutputMode,
    primaryTargetId: 'copilot',
    primaryOutputPath: '.github/copilot-instructions.md'
  })}\n\n${renderWorkspaceContextPointers({ workspaceDir, rootDir, targetId: 'copilot' })}`;
  await writeManagedFile({
    workspaceDir: rootDir,
    outPath: path.join(rootDir, '.github/instructions', fileName),
    rendered: content,
    onConflict
  });
}

export function renderRouterDoc({
  label,
  targetId = 'cursor',
  routerRole = 'native',
  targetOutputMode = 'native',
  primaryTargetId = targetId,
  primaryOutputPath
}: {
  label: string;
  targetId?: string;
  routerRole?: 'native' | 'compat';
  targetOutputMode?: TargetOutputMode;
  primaryTargetId?: string;
  primaryOutputPath?: string;
}) {
  return `${renderPrecedenceBlock({
    routerRole,
    targetOutputMode,
    primaryTargetId,
    primaryOutputPath
  })}\n# ailib Router (${label})\n\nLoad the following context files:\n- @.ailib/context/common.md\n- @.ailib/context/modules.md\n- @.ailib/context/skills/${targetId}.md\n`;
}

async function writeWorkspaceContextFiles({
  workspaceDir,
  rootDir,
  state,
  targetSet
}: {
  workspaceDir: string;
  rootDir: string;
  state: WorkspaceState;
  targetSet: Set<string>;
}) {
  const contextDir = path.join(workspaceDir, '.ailib', 'context');
  const skillsDir = path.join(contextDir, 'skills');
  await fs.mkdir(skillsDir, { recursive: true });
  const hasArchitecture = await fileExists(path.join(rootDir, '.ailib', 'architecture.md'));

  await fs.writeFile(
    path.join(contextDir, 'common.md'),
    renderCommonContextDoc({ workspaceDir, rootDir, hasArchitecture }),
    'utf8'
  );
  await fs.writeFile(
    path.join(contextDir, 'modules.md'),
    renderModulesContextDoc({ workspaceDir, rootDir, state }),
    'utf8'
  );

  for (const targetId of targetSet) {
    await fs.writeFile(
      path.join(skillsDir, `${targetId}.md`),
      renderSkillsContextDoc({ workspaceDir, rootDir, state, targetId }),
      'utf8'
    );
  }
  const existingSkillContextFiles = await fs.readdir(skillsDir);
  for (const entry of existingSkillContextFiles) {
    if (!entry.endsWith('.md')) continue;
    const targetId = entry.replace(/\.md$/u, '');
    if (!targetSet.has(targetId)) {
      await fs.rm(path.join(skillsDir, entry), { force: true });
    }
  }
}

function renderCommonContextDoc({
  workspaceDir,
  rootDir,
  hasArchitecture
}: {
  workspaceDir: string;
  rootDir: string;
  hasArchitecture: boolean;
}) {
  const relToRoot = relativePathForPointers(workspaceDir, rootDir);
  const behaviorRef =
    path.resolve(workspaceDir) === path.resolve(rootDir)
      ? '@.ailib/behavior.md'
      : `@${toPosix(path.join(relToRoot, '.ailib/behavior.md'))}`;
  const architectureRef =
    path.resolve(workspaceDir) === path.resolve(rootDir)
      ? '@.ailib/architecture.md'
      : `@${toPosix(path.join(relToRoot, '.ailib/architecture.md'))}`;
  const docsBlock =
    path.resolve(workspaceDir) === path.resolve(rootDir)
      ? '# PROJECT-SPECIFIC CONTEXT\nPrioritize project context in @./docs/.\n'
      : `# PROJECT-SPECIFIC CONTEXT\nPrioritize service-local business logic in @./docs/.\nFor cross-service context, consult @${toPosix(path.join(relToRoot, 'docs/'))}.\nIf guidance conflicts, service-local docs win for service-scoped work.\n`;
  const architectureLine = hasArchitecture ? `Align architecture decisions with ${architectureRef}.\n` : '';
  return `# AILIB SYSTEM PROMPT\nAct as the AI Agent defined in ${behaviorRef}.\n${architectureLine}Adhere to the coding standards in @.ailib/standards.md.\nApply development workflow rules in @.ailib/development-standards.md.\nApply test and coverage rules in @.ailib/test-standards.md.\n\n${docsBlock}`;
}

function renderModulesContextDoc({
  workspaceDir,
  rootDir,
  state
}: {
  workspaceDir: string;
  rootDir: string;
  state: WorkspaceState;
}) {
  const relToRoot = relativePathForPointers(workspaceDir, rootDir);
  const inheritedModuleLines = state.inheritedModules.map((mod) => {
    const modPath = `@${toPosix(path.join(relToRoot, '.ailib/modules', `${mod}.md`))}`;
    return `- ${modPath}`;
  });
  const localModuleLines = state.localModules.map((mod) => `- @.ailib/modules/${mod}.md`);
  const moduleLines = [...inheritedModuleLines, ...localModuleLines];
  const modulesText = moduleLines.length ? moduleLines.join('\n') : '- (none)';
  return `# MODULES & EXTENSIONS\n${modulesText}\n`;
}

function renderSkillsContextDoc({
  workspaceDir,
  rootDir,
  state,
  targetId
}: {
  workspaceDir: string;
  rootDir: string;
  state: WorkspaceState;
  targetId: string;
}) {
  const relToRoot = relativePathForPointers(workspaceDir, rootDir);
  const inheritedSkillLines = state.inheritedSkills.map((skill) => {
    const skillPath = `@${toPosix(path.join(relToRoot, '.ailib/skills', targetId, `${skill}.md`))}`;
    return `- ${skillPath}`;
  });
  const localSkillLines = state.localSkills.map((skill) => `- @.ailib/skills/${targetId}/${skill}.md`);
  const skillLines = [...inheritedSkillLines, ...localSkillLines];
  const skillsText = skillLines.length ? skillLines.join('\n') : '- (none)';
  return `# SKILLS\n${skillsText}\n`;
}

function renderWorkspaceContextPointers({
  workspaceDir,
  rootDir,
  targetId
}: {
  workspaceDir: string;
  rootDir: string;
  targetId: string;
}) {
  const rel = workspaceLabelFor(rootDir, workspaceDir);
  if (rel === '.') {
    return `- @.ailib/context/common.md\n- @.ailib/context/modules.md\n- @.ailib/context/skills/${targetId}.md`;
  }
  const relPosix = toPosix(rel);
  return `- @${relPosix}/.ailib/context/common.md\n- @${relPosix}/.ailib/context/modules.md\n- @${relPosix}/.ailib/context/skills/${targetId}.md`;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function renderPrecedenceBlock({
  routerRole,
  targetOutputMode,
  primaryTargetId,
  primaryOutputPath
}: {
  routerRole: 'native' | 'compat';
  targetOutputMode: TargetOutputMode;
  primaryTargetId: string;
  primaryOutputPath?: string;
}) {
  const roleLabel = routerRole === 'native' ? 'native' : 'compatibility';
  const primaryPathLine = primaryOutputPath ? `- primary_output: ${primaryOutputPath}\n` : '';
  return `<!-- ailib:router-metadata\n- role: ${roleLabel}\n- target_output_mode: ${targetOutputMode}\n- primary_target: ${primaryTargetId}\n${primaryPathLine}-->`;
}

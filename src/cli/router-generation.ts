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

  for (const targetId of targetSet) {
    const targetDef = registry.targets[targetId];
    if (!targetDef || targetDef.mode === 'copilot') continue;

    const label = targetDef.display || targetId;
    const frontmatter = targetDef.frontmatter
      ? atRoot
        ? targetDef.frontmatter.root
        : targetDef.frontmatter.workspace
      : '';
    const rendered = `${frontmatter || ''}${renderRouterDoc({ label, workspaceDir, rootDir, state })}`;
    await writeManagedFile({ outPath: path.join(workspaceDir, targetDef.output), rendered, onConflict });

    if (atRoot && targetDef.root_output) {
      await writeManagedFile({ outPath: path.join(workspaceDir, targetDef.root_output), rendered, onConflict });
    }
  }

  if (atRoot && targetSet.has('copilot')) {
    const scopedStates = [...allStates.entries()].filter(([, s]) => (s.effective.targets || []).includes('copilot'));
    const sections = scopedStates
      .map(([dir, s]) => {
        const label = workspaceLabelFor(rootDir, dir);
        return `## Workspace: ${label}\n\n${renderRouterDoc({ label: registry.targets.copilot?.display || 'GitHub Copilot', workspaceDir: dir, rootDir, state: s }).trim()}\n`;
      })
      .join('\n');

    await writeManagedFile({
      outPath: path.join(rootDir, registry.targets.copilot?.output || '.github/copilot-instructions.md'),
      rendered: `# ailib Router (${registry.targets.copilot?.display || 'GitHub Copilot'})\n\n${sections}`,
      onConflict
    });

    for (const [dir, s] of scopedStates) {
      const rel = workspaceLabelFor(rootDir, dir);
      const applyTo = rel === '.' ? '**' : `${toPosix(rel)}/**`;
      const fileName = rel === '.' ? 'root.instructions.md' : `${sanitizeForFilename(rel)}.instructions.md`;
      const content = `---\napplyTo: "${applyTo}"\n---\n\n${renderRouterDoc({ label: registry.targets.copilot?.display || 'GitHub Copilot', workspaceDir: dir, rootDir, state: s })}`;
      await writeManagedFile({
        outPath: path.join(rootDir, '.github/instructions', fileName),
        rendered: content,
        onConflict
      });
    }
  }
}

export function renderRouterDoc({
  label,
  workspaceDir,
  rootDir,
  state
}: {
  label: string;
  workspaceDir: string;
  rootDir: string;
  state: WorkspaceState;
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
  const docsBlock =
    path.resolve(workspaceDir) === path.resolve(rootDir)
      ? '# PROJECT-SPECIFIC CONTEXT\nPrioritize project context in @./docs/.\n'
      : `# PROJECT-SPECIFIC CONTEXT\nPrioritize service-local business logic in @./docs/.\nFor cross-service context, consult @${toPosix(path.join(relToRoot, 'docs/'))}.\nIf guidance conflicts, service-local docs win for service-scoped work.\n`;

  const modulesText = moduleLines.length ? moduleLines.join('\n') : '- (none)';
  return `# ailib Router (${label})\n\n# AILIB SYSTEM PROMPT\nAct as the AI Agent defined in ${behaviorRef}.\nAdhere to the coding standards in @.ailib/standards.md.\nApply development workflow rules in @.ailib/development-standards.md.\nApply test and coverage rules in @.ailib/test-standards.md.\n\n# MODULES & EXTENSIONS\n${modulesText}\n\n${docsBlock}`;
}

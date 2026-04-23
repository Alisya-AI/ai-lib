import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveContext, workspaceLabelFor } from './context-resolution.ts';
import { parseFrontmatter } from './file-helpers.ts';
import { assertLocalOverridesValid } from './local-override-config.ts';
import { diffSlots } from './module-selection.ts';
import { buildWorkspaceState, getEffectiveWorkspaceConfig } from './workspace-state.ts';
import { exists, readJson } from './utils.ts';
import { listWorkspaceDirs } from './workspace-discovery.ts';
import type { CliFlags, Registry, WorkspaceConfig, WorkspaceState } from './types.ts';

export async function doctorCommand({
  cwd,
  packageRoot,
  flags,
  configFile,
  localOverrideFile,
  canonicalSlot
}: {
  cwd: string;
  packageRoot: string;
  flags: CliFlags;
  configFile: string;
  localOverrideFile: string;
  canonicalSlot: (registry: Registry, slot: string | undefined) => string | null;
}) {
  const context = await resolveContext(cwd);
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const rootConfig = await readJson<WorkspaceConfig>(path.join(context.rootDir, configFile));
  const workspaceDirs = await listWorkspaceDirs({
    rootDir: context.rootDir,
    rootConfig,
    workspaceOverride: getStringFlag(flags, 'workspace')
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    await assertLocalOverridesValid({
      rootDir: context.rootDir,
      rootConfig,
      registry,
      canonicalSlot: (slot) => canonicalSlot(registry, slot),
      localOverrideFile
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
  }
  if (errors.length) {
    process.stdout.write(`doctor failed:\n- ${errors.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }

  const rootEffective = await getEffectiveWorkspaceConfig({
    workspaceDir: context.rootDir,
    rootDir: context.rootDir,
    rootConfig,
    registry,
    canonicalSlot: (slot) => canonicalSlot(registry, slot),
    configFile,
    localOverrideFile
  });
  for (const workspaceDir of workspaceDirs) {
    const workspaceLabel = workspaceLabelFor(context.rootDir, workspaceDir);
    const configPath = path.join(workspaceDir, configFile);
    if (!(await exists(configPath))) {
      errors.push(`[${workspaceLabel}] Missing ${configFile}`);
      continue;
    }

    let state: WorkspaceState;
    try {
      state = await buildWorkspaceState({
        workspaceDir,
        rootDir: context.rootDir,
        rootConfig,
        registry,
        canonicalSlot: (slot) => canonicalSlot(registry, slot),
        configFile,
        localOverrideFile
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`[${workspaceLabel}] ${message}`);
      continue;
    }

    for (const rel of state.requiredFiles) {
      if (!(await exists(path.join(workspaceDir, rel)))) {
        errors.push(`[${workspaceLabel}] Missing pointer file: ${rel}`);
      }
    }

    for (const rel of state.requiredFiles) {
      const full = path.join(workspaceDir, rel);
      if (!(await exists(full))) continue;
      const text = await fs.readFile(full, 'utf8');
      const frontmatter = parseFrontmatter(text);
      if (!frontmatter) {
        errors.push(`[${workspaceLabel}] Missing frontmatter: ${rel}`);
        continue;
      }
      for (const key of ['id', 'version', 'updated']) {
        if (!(key in frontmatter)) {
          errors.push(`[${workspaceLabel}] Frontmatter missing '${key}': ${rel}`);
        }
      }
      if (!('language' in frontmatter) && !('core' in frontmatter)) {
        errors.push(`[${workspaceLabel}] Frontmatter missing 'language' or 'core': ${rel}`);
      }
      if (rel.includes('/modules/') && !('slot' in frontmatter)) {
        errors.push(`[${workspaceLabel}] Frontmatter missing 'slot': ${rel}`);
      }
    }

    if (path.resolve(workspaceDir) !== path.resolve(context.rootDir)) {
      const slotDiffs = diffSlots({
        rootModules: rootEffective.modules,
        workspaceModules: state.effective.modules,
        registry,
        language: state.effective.language,
        canonicalSlot: (slot) => canonicalSlot(registry, slot)
      });
      for (const msg of slotDiffs) warnings.push(`[${workspaceLabel}] ${msg}`);
    }
  }

  if (warnings.length) process.stdout.write(`doctor warnings:\n- ${warnings.join('\n- ')}\n`);

  if (errors.length) {
    process.stdout.write(`doctor failed:\n- ${errors.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write('doctor ok\n');
}

function getStringFlag(flags: CliFlags, key: string): string | undefined {
  const value = flags[key];
  if (typeof value === 'string') return value;
  return undefined;
}

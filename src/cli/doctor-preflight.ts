import path from 'node:path';
import { resolveContext } from './context-resolution.ts';
import { assertLocalOverridesValid } from './local-override-config.ts';
import { bindRegistryCanonicalSlot } from './slot-resolver.ts';
import { getEffectiveWorkspaceConfig } from './workspace-state.ts';
import { readJson } from './utils.ts';
import { listWorkspaceDirs } from './workspace-discovery.ts';
import { getStringFlag } from './flags.ts';
import type { CliFlags, Registry, WorkspaceConfig } from './types.ts';
import type { ResolvedContext } from './context-resolution.ts';
import type { EffectiveWorkspaceConfig } from './types.ts';

export async function runDoctorPreflight({
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
}): Promise<
  | {
      ok: true;
      context: ResolvedContext;
      registry: Registry;
      rootConfig: WorkspaceConfig;
      workspaceDirs: string[];
      rootEffective: EffectiveWorkspaceConfig;
    }
  | {
      ok: false;
      context: ResolvedContext;
      registry: Registry;
      rootConfig: WorkspaceConfig;
      workspaceDirs: string[];
      localOverrideError: string;
    }
> {
  const context = await resolveContext(cwd);
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const canonicalSlotForRegistry = bindRegistryCanonicalSlot(registry, canonicalSlot);
  const rootConfig = await readJson<WorkspaceConfig>(path.join(context.rootDir, configFile));
  const workspaceDirs = await listWorkspaceDirs({
    rootDir: context.rootDir,
    rootConfig,
    workspaceOverride: getStringFlag(flags, 'workspace')
  });

  try {
    await assertLocalOverridesValid({
      rootDir: context.rootDir,
      rootConfig,
      registry,
      canonicalSlot: canonicalSlotForRegistry,
      localOverrideFile
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      context,
      registry,
      rootConfig,
      workspaceDirs,
      localOverrideError: message
    };
  }

  const rootEffective = await getEffectiveWorkspaceConfig({
    workspaceDir: context.rootDir,
    rootDir: context.rootDir,
    rootConfig,
    registry,
    canonicalSlot: canonicalSlotForRegistry,
    configFile,
    localOverrideFile
  });

  return {
    ok: true,
    context,
    registry,
    rootConfig,
    workspaceDirs,
    rootEffective
  };
}

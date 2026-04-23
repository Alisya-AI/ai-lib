import path from 'node:path';
import { writeRootLock } from './lockfile.ts';
import { assertLocalOverridesValid } from './local-override-config.ts';
import { generateWorkspaceRouters } from './router-generation.ts';
import { bindRegistryCanonicalSlot } from './slot-resolver.ts';
import { ensureWorkspaceAssets } from './workspace-assets.ts';
import { buildWorkspaceState } from './workspace-state.ts';
import { exists, readJson } from './utils.ts';
import { listWorkspaceDirs } from './workspace-discovery.ts';
import type { Registry, WorkspaceConfig, WorkspaceState } from './types.ts';

export async function applyWorkspaceUpdate({
  packageRoot,
  rootDir,
  workspaceOverride,
  forceOnConflict,
  configFile,
  localOverrideFile,
  canonicalSlot
}: {
  packageRoot: string;
  rootDir: string;
  workspaceOverride?: string;
  forceOnConflict?: string;
  configFile: string;
  localOverrideFile: string;
  canonicalSlot: (registry: Registry, slot: string | undefined) => string | null;
}) {
  const rootConfigPath = path.join(rootDir, configFile);
  ensure(await exists(rootConfigPath), `Missing ${configFile} at root: ${rootDir}`);

  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const canonicalSlotForRegistry = bindRegistryCanonicalSlot(registry, canonicalSlot);
  const packageJson = await readJson<{ version: string }>(path.join(packageRoot, 'package.json'));
  const rootConfig = await readJson<WorkspaceConfig>(rootConfigPath);
  await assertLocalOverridesValid({
    rootDir,
    rootConfig,
    registry,
    canonicalSlot: canonicalSlotForRegistry,
    localOverrideFile
  });

  const workspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig, workspaceOverride });
  const allWorkspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig });

  const stateMap = new Map<string, WorkspaceState>();
  for (const workspaceDir of allWorkspaceDirs) {
    stateMap.set(
      workspaceDir,
      await buildWorkspaceState({
        workspaceDir,
        rootDir,
        rootConfig,
        registry,
        canonicalSlot: canonicalSlotForRegistry,
        configFile,
        localOverrideFile
      })
    );
  }

  for (const workspaceDir of workspaceDirs) {
    const state = stateMap.get(workspaceDir);
    await ensureWorkspaceAssets({ workspaceDir, packageRoot, state, rootDir });
  }

  for (const workspaceDir of workspaceDirs) {
    const state = stateMap.get(workspaceDir);
    const onConflict = forceOnConflict || state.effective.on_conflict || 'merge';
    await generateWorkspaceRouters({ workspaceDir, rootDir, state, onConflict, allStates: stateMap, registry });
  }

  await writeRootLock({
    rootDir,
    packageRoot,
    packageVersion: packageJson.version,
    registryRef: rootConfig.registry_ref || registry.version,
    allStates: stateMap
  });
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

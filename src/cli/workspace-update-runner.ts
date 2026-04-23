import { applyWorkspaceUpdate as applyWorkspaceUpdateCore } from './workspace-update.ts';
import type { Registry } from './types.ts';

export type CanonicalSlotResolver = (registry: Registry, slot: string | undefined) => string | null;
export type WorkspaceUpdateRunner = (args: {
  packageRoot: string;
  rootDir: string;
  workspaceOverride?: string;
  forceOnConflict?: string;
}) => Promise<void>;

export function createWorkspaceUpdateRunner({
  configFile,
  localOverrideFile,
  canonicalSlot,
  coreRunner = applyWorkspaceUpdateCore
}: {
  configFile: string;
  localOverrideFile: string;
  canonicalSlot: CanonicalSlotResolver;
  coreRunner?: typeof applyWorkspaceUpdateCore;
}): WorkspaceUpdateRunner {
  return async ({ packageRoot, rootDir, workspaceOverride, forceOnConflict }) => {
    await coreRunner({
      packageRoot,
      rootDir,
      workspaceOverride,
      forceOnConflict,
      configFile,
      localOverrideFile,
      canonicalSlot
    });
  };
}

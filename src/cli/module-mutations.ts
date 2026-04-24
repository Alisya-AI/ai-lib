import fs from 'node:fs/promises';
import path from 'node:path';
import { ensure } from './assertions.ts';
import { resolveContext, resolveDefaultWorkspaceForMutation, resolveWorkspacePath } from './context-resolution.ts';
import { getStringFlag } from './flags.ts';
import { validateModuleSelection } from './module-validation.ts';
import { bindRegistryCanonicalSlot } from './slot-resolver.ts';
import { getEffectiveWorkspaceConfig } from './workspace-state.ts';
import { exists, readJson, uniqueList } from './utils.ts';
import type { CliFlags, Registry, WorkspaceConfig } from './types.ts';

export async function updateCommand({
  cwd,
  packageRoot,
  flags,
  configFile: _configFile,
  localOverrideFile: _localOverrideFile,
  canonicalSlot: _canonicalSlot,
  applyWorkspaceUpdate
}: {
  cwd: string;
  packageRoot: string;
  flags: CliFlags;
  configFile: string;
  localOverrideFile: string;
  canonicalSlot: (registry: Registry, slot: string | undefined) => string | null;
  applyWorkspaceUpdate: (args: {
    packageRoot: string;
    rootDir: string;
    workspaceOverride?: string;
    forceOnConflict?: string;
  }) => Promise<void>;
}) {
  const context = await resolveContext(cwd);
  const workspaceFlag = getStringFlag(flags, 'workspace');
  const workspaceOverride = workspaceFlag ? resolveWorkspacePath(context.rootDir, workspaceFlag) : undefined;
  await applyWorkspaceUpdate({
    packageRoot,
    rootDir: context.rootDir,
    workspaceOverride,
    forceOnConflict: 'overwrite'
  });
  process.stdout.write('ailib updated\n');
}

export async function addCommand({
  cwd,
  packageRoot,
  flags,
  configFile,
  localOverrideFile,
  canonicalSlot,
  applyWorkspaceUpdate
}: {
  cwd: string;
  packageRoot: string;
  flags: CliFlags;
  configFile: string;
  localOverrideFile: string;
  canonicalSlot: (registry: Registry, slot: string | undefined) => string | null;
  applyWorkspaceUpdate: (args: {
    packageRoot: string;
    rootDir: string;
    workspaceOverride?: string;
    forceOnConflict?: string;
  }) => Promise<void>;
}) {
  const moduleId = flags._[0];
  ensure(moduleId, 'Usage: ailib add <module>');
  const context = await resolveContext(cwd);
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const canonicalSlotForRegistry = bindRegistryCanonicalSlot(registry, canonicalSlot);

  const targetWorkspace = resolveDefaultWorkspaceForMutation(context, getStringFlag(flags, 'workspace'));
  const configPath = path.join(targetWorkspace, configFile);
  ensure(await exists(configPath), `Missing ${configFile} in workspace: ${targetWorkspace}`);

  const config = await readJson<WorkspaceConfig>(configPath);
  const effective = await getEffectiveWorkspaceConfig({
    workspaceDir: targetWorkspace,
    rootDir: context.rootDir,
    rootConfig: await readJson<WorkspaceConfig>(path.join(context.rootDir, configFile)),
    registry,
    canonicalSlot: canonicalSlotForRegistry,
    configFile,
    localOverrideFile
  });
  validateModuleSelection({
    registry,
    language: effective.language,
    modules: uniqueList([...(config.modules || []), moduleId]),
    canonicalSlot: canonicalSlotForRegistry
  });

  config.modules = uniqueList([...(config.modules || []), moduleId]);
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const isRootMutation = path.resolve(targetWorkspace) === path.resolve(context.rootDir);
  await applyWorkspaceUpdate({
    packageRoot,
    rootDir: context.rootDir,
    workspaceOverride: isRootMutation ? undefined : targetWorkspace,
    forceOnConflict: 'overwrite'
  });

  process.stdout.write(`module added: ${moduleId}\n`);
}

export async function removeCommand({
  cwd,
  packageRoot,
  flags,
  configFile,
  applyWorkspaceUpdate
}: {
  cwd: string;
  packageRoot: string;
  flags: CliFlags;
  configFile: string;
  applyWorkspaceUpdate: (args: {
    packageRoot: string;
    rootDir: string;
    workspaceOverride?: string;
    forceOnConflict?: string;
  }) => Promise<void>;
}) {
  const moduleId = flags._[0];
  ensure(moduleId, 'Usage: ailib remove <module>');
  const context = await resolveContext(cwd);
  const targetWorkspace = resolveDefaultWorkspaceForMutation(context, getStringFlag(flags, 'workspace'));

  const configPath = path.join(targetWorkspace, configFile);
  ensure(await exists(configPath), `Missing ${configFile} in workspace: ${targetWorkspace}`);
  const config = await readJson<WorkspaceConfig>(configPath);
  config.modules = (config.modules || []).filter((m) => m !== moduleId);
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const isRootMutation = path.resolve(targetWorkspace) === path.resolve(context.rootDir);
  await applyWorkspaceUpdate({
    packageRoot,
    rootDir: context.rootDir,
    workspaceOverride: isRootMutation ? undefined : targetWorkspace,
    forceOnConflict: 'overwrite'
  });

  process.stdout.write(`module removed: ${moduleId}\n`);
}

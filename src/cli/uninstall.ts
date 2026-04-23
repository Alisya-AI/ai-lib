import path from 'node:path';
import { resolveContext, isRootWorkspaceConfig } from './context-resolution.ts';
import { listWorkspaceDirs } from './workspace-discovery.ts';
import { exists, readJson, rmIfExists } from './utils.ts';
import type { Registry, WorkspaceConfig } from './types.ts';

export async function uninstallCommand({
  cwd,
  packageRoot,
  flags,
  configFile,
  lockFile,
  applyWorkspaceUpdate
}: {
  cwd: string;
  packageRoot: string;
  flags: Record<string, unknown>;
  configFile: string;
  lockFile: string;
  applyWorkspaceUpdate: (args: { packageRoot: string; rootDir: string; forceOnConflict?: string }) => Promise<void>;
}) {
  const context = await resolveContext(cwd);
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));

  const rootConfigPath = path.join(context.rootDir, configFile);
  const rootConfig = (await exists(rootConfigPath)) ? await readJson<WorkspaceConfig>(rootConfigPath) : null;
  const atRoot = path.resolve(context.workspaceDir) === path.resolve(context.rootDir);
  const monorepo = Boolean(rootConfig?.workspaces);

  if (atRoot && monorepo && flags.all !== true) {
    await uninstallWorkspace(context.rootDir, rootConfig, registry, configFile);
    process.stdout.write('ailib uninstalled\n');
    return;
  }

  if (atRoot && monorepo && flags.all === true) {
    const workspaceDirs = await listWorkspaceDirs({ rootDir: context.rootDir, rootConfig });
    for (const workspaceDir of workspaceDirs) {
      const cfgPath = path.join(workspaceDir, configFile);
      const cfg = (await exists(cfgPath)) ? await readJson<WorkspaceConfig>(cfgPath) : rootConfig;
      await uninstallWorkspace(workspaceDir, cfg, registry, configFile);
    }
    await rmIfExists(path.join(context.rootDir, lockFile));
    process.stdout.write('ailib uninstalled\n');
    return;
  }

  const targetDir = context.workspaceDir;
  const cfgPath = path.join(targetDir, configFile);
  const cfg = (await exists(cfgPath)) ? await readJson<WorkspaceConfig>(cfgPath) : null;
  await uninstallWorkspace(targetDir, cfg, registry, configFile);

  if (path.resolve(targetDir) === path.resolve(context.rootDir)) {
    await rmIfExists(path.join(context.rootDir, lockFile));
  } else if (await exists(rootConfigPath)) {
    await applyWorkspaceUpdate({ packageRoot, rootDir: context.rootDir, forceOnConflict: 'overwrite' });
  }

  process.stdout.write('ailib uninstalled\n');
}

export async function uninstallWorkspace(
  workspaceDir: string,
  config: WorkspaceConfig | null,
  registry: Registry,
  configFile: string
) {
  await rmIfExists(path.join(workspaceDir, '.ailib'));
  await rmIfExists(path.join(workspaceDir, configFile));
  if (config?.targets) {
    for (const target of config.targets) {
      const targetDef = registry.targets[target];
      if (!targetDef) continue;
      await rmIfExists(path.join(workspaceDir, targetDef.output));
      if (targetDef.root_output && isRootWorkspaceConfig(config)) {
        await rmIfExists(path.join(workspaceDir, targetDef.root_output));
      }
      if (target === 'copilot' && isRootWorkspaceConfig(config)) {
        await rmIfExists(path.join(workspaceDir, '.github/instructions'));
      }
    }
  }
}

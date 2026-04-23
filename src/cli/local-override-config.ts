import path from 'node:path';
import { listWorkspaceDirs } from './workspace-discovery.ts';
import { isRecord, validateWorkspaceOverride } from './override-validation.ts';
import { exists, readJson, toPosix } from './utils.ts';
import type { LocalOverrideConfig, Registry, WorkspaceConfig } from './types.ts';

export async function loadLocalOverrideConfig({
  rootDir,
  rootConfig,
  registry,
  canonicalSlot,
  localOverrideFile
}: {
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
  canonicalSlot: (slot: string | undefined) => string | null;
  localOverrideFile: string;
}): Promise<LocalOverrideConfig | null> {
  const overridePath = path.join(rootDir, localOverrideFile);
  if (!(await exists(overridePath))) return null;

  const prefix = `Invalid ${localOverrideFile}`;
  let config: LocalOverrideConfig;
  try {
    config = await readJson<LocalOverrideConfig>(overridePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${prefix}: invalid JSON (${message})`);
  }

  const errors = await validateLocalOverrideConfig({ rootDir, rootConfig, registry, config, canonicalSlot });
  if (errors.length) throw new Error(`${prefix}:\n- ${errors.join('\n- ')}`);
  return config;
}

export async function validateLocalOverrideConfig({
  rootDir,
  rootConfig,
  registry,
  config,
  canonicalSlot
}: {
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
  config: LocalOverrideConfig;
  canonicalSlot: (slot: string | undefined) => string | null;
}): Promise<string[]> {
  const errors: string[] = [];
  if (!isRecord(config)) return ['expected object at root'];

  const allowedRootKeys = new Set(['version', 'default_override', 'workspace_overrides']);
  for (const key of Object.keys(config)) {
    if (!allowedRootKeys.has(key)) errors.push(`unexpected root key '${key}'`);
  }

  if (typeof config.version !== 'string' || !config.version.trim()) {
    errors.push(`missing required string 'version'`);
  }

  const workspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig });
  const workspaceKeys = new Set([
    '.',
    ...workspaceDirs
      .filter((workspaceDir) => path.resolve(workspaceDir) !== path.resolve(rootDir))
      .map((workspaceDir) => toPosix(path.relative(rootDir, workspaceDir)))
  ]);

  if (config.default_override !== undefined) {
    errors.push(
      ...validateWorkspaceOverride({
        override: config.default_override,
        label: 'default_override',
        registry,
        canonicalSlot
      })
    );
  }

  if (config.workspace_overrides !== undefined) {
    if (!isRecord(config.workspace_overrides)) {
      errors.push(`'workspace_overrides' must be an object`);
    } else {
      for (const [workspaceKey, override] of Object.entries(config.workspace_overrides)) {
        if (typeof workspaceKey !== 'string' || !workspaceKey.trim()) {
          errors.push(`workspace override key must be a non-empty string`);
          continue;
        }
        if (!workspaceKeys.has(workspaceKey)) {
          errors.push(`unknown workspace override key '${workspaceKey}'`);
        }
        errors.push(
          ...validateWorkspaceOverride({
            override,
            label: `workspace_overrides.${workspaceKey}`,
            registry,
            canonicalSlot
          })
        );
      }
    }
  }

  return errors;
}

export async function assertLocalOverridesValid({
  rootDir,
  rootConfig,
  registry,
  canonicalSlot,
  localOverrideFile
}: {
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
  canonicalSlot: (slot: string | undefined) => string | null;
  localOverrideFile: string;
}) {
  await loadLocalOverrideConfig({ rootDir, rootConfig, registry, canonicalSlot, localOverrideFile });
}

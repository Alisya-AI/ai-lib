import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import type { Registry, WorkspaceConfig } from './types.ts';

const CONFIG_FILE = 'ailib.config.json';

export async function resolveExtendsBase({
  workspaceDir,
  rootDir,
  rootConfig,
  registry
}: {
  workspaceDir: string;
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
}): Promise<WorkspaceConfig> {
  const raw = await readJson<WorkspaceConfig>(path.join(workspaceDir, CONFIG_FILE));
  if (path.resolve(workspaceDir) === path.resolve(rootDir)) {
    return normalizeRootConfig(rootConfig, registry);
  }

  if (raw.extends) {
    const seen = new Set([path.resolve(path.join(workspaceDir, CONFIG_FILE))]);
    const resolved = await resolveConfigByExtends(path.resolve(workspaceDir), raw.extends, seen);
    return normalizeRootConfig(resolved, registry);
  }

  return normalizeRootConfig(rootConfig, registry);
}

async function resolveConfigByExtends(
  workspaceDir: string,
  extendsValue: string,
  seen: Set<string>
): Promise<WorkspaceConfig> {
  const targetPath = extendsValue.endsWith('.json')
    ? path.resolve(workspaceDir, extendsValue)
    : path.join(path.resolve(workspaceDir, extendsValue), CONFIG_FILE);
  const absTarget = path.resolve(targetPath);
  ensure(await exists(absTarget), `Invalid extends path: ${extendsValue}`);
  if (seen.has(absTarget)) throw new Error('Circular extends detected');
  seen.add(absTarget);

  const raw = await readJson<WorkspaceConfig>(absTarget);
  if (!raw.extends) return raw;
  return resolveConfigByExtends(path.dirname(absTarget), raw.extends, seen);
}

export function normalizeRootConfig(rootConfig: WorkspaceConfig, registry: Registry): WorkspaceConfig {
  return {
    $schema: rootConfig.$schema || 'https://ailib.dev/schema/config.schema.json',
    registry_ref: rootConfig.registry_ref || registry.version,
    on_conflict: rootConfig.on_conflict || 'merge',
    language: rootConfig.language,
    modules: rootConfig.modules || [],
    targets: rootConfig.targets || Object.keys(registry.targets),
    docs_path: rootConfig.docs_path || 'docs/',
    workspaces: rootConfig.workspaces
  };
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

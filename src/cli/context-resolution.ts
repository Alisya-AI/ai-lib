import path from 'node:path';
import { exists, readJson, toPosix } from './utils.ts';
import type { WorkspaceConfig } from './types.ts';

const CONFIG_FILE = 'ailib.config.json';

export interface ResolvedContext {
  rootDir: string;
  workspaceDir: string;
}

export async function resolveContext(cwd: string): Promise<ResolvedContext> {
  const workspaceDir = await findNearestWorkspace(path.resolve(cwd));
  if (!workspaceDir) {
    const rootDir = await detectProjectRoot(cwd);
    return { rootDir, workspaceDir: rootDir };
  }

  const rootDir = (await findNearestMonorepoRoot(path.resolve(cwd))) || workspaceDir;
  return { rootDir, workspaceDir };
}

export function resolveDefaultWorkspaceForMutation(context: ResolvedContext, workspaceFlag?: string) {
  if (workspaceFlag) return resolveWorkspacePath(context.rootDir, workspaceFlag);
  if (path.resolve(context.workspaceDir) !== path.resolve(context.rootDir)) return context.workspaceDir;
  return context.rootDir;
}

export function resolveWorkspacePath(rootDir: string, value: string) {
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value);
  return resolved;
}

export function isRootWorkspaceConfig(config: WorkspaceConfig | null | undefined) {
  return Boolean(config?.workspaces);
}

export function workspaceLabelFor(rootDir: string, workspaceDir: string) {
  const rel = toPosix(path.relative(rootDir, workspaceDir));
  return rel || '.';
}

export function relativePathForPointers(fromDir: string, toDir: string) {
  const rel = toPosix(path.relative(fromDir, toDir));
  return rel || '.';
}

export async function findNearestMonorepoRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  let found = null;
  while (true) {
    const cfgPath = path.join(current, CONFIG_FILE);
    if (await exists(cfgPath)) {
      const cfg = await readJson<WorkspaceConfig>(cfgPath);
      if (cfg.workspaces) found = current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return found;
}

export async function detectProjectRoot(startDir: string): Promise<string> {
  let current = path.resolve(startDir);
  while (true) {
    if (
      (await exists(path.join(current, '.git'))) ||
      (await exists(path.join(current, 'package.json'))) ||
      (await exists(path.join(current, 'pyproject.toml')))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Could not detect project root');
}

async function findNearestWorkspace(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    if (await exists(path.join(current, CONFIG_FILE))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

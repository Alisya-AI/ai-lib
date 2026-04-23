import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type { WorkspaceConfig } from './types.ts';

const CONFIG_FILE = 'ailib.config.json';
const AUTO_DISCOVERY_MAX_DEPTH = 4;
const GLOB_DISCOVERY_MAX_DEPTH = 32;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.venv']);

export async function listWorkspaceDirs({
  rootDir,
  rootConfig,
  workspaceOverride
}: {
  rootDir: string;
  rootConfig: WorkspaceConfig;
  workspaceOverride?: string;
}) {
  if (workspaceOverride) {
    const abs = resolveWorkspacePath(rootDir, workspaceOverride);
    ensure(await exists(path.join(abs, CONFIG_FILE)), `Workspace has no ${CONFIG_FILE}: ${workspaceOverride}`);
    return [abs];
  }

  const dirs = [path.resolve(rootDir)];
  const discovered = await discoverServiceWorkspaces({ rootDir, rootConfig });
  for (const dir of discovered) {
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

async function discoverServiceWorkspaces({ rootDir, rootConfig }: { rootDir: string; rootConfig: WorkspaceConfig }) {
  const hasPatterns = Array.isArray(rootConfig.workspaces) && rootConfig.workspaces.length > 0;
  const allConfigs = await walkForWorkspaceConfigs({
    rootDir,
    maxDepth: hasPatterns ? GLOB_DISCOVERY_MAX_DEPTH : AUTO_DISCOVERY_MAX_DEPTH,
    applyGitignore: !hasPatterns
  });
  const out = [];

  for (const dir of allConfigs) {
    if (path.resolve(dir) === path.resolve(rootDir)) continue;
    if (!hasPatterns) {
      out.push(dir);
      continue;
    }

    const rel = toPosix(path.relative(rootDir, dir));
    if (rootConfig.workspaces?.some((pattern) => globMatch(rel, pattern))) {
      out.push(dir);
    }
  }

  out.sort();
  return out;
}

async function walkForWorkspaceConfigs({
  rootDir,
  maxDepth,
  applyGitignore
}: {
  rootDir: string;
  maxDepth: number;
  applyGitignore: boolean;
}) {
  const matches: string[] = [];
  const ignoreMatchers = applyGitignore ? await loadGitignoreMatchers(rootDir) : [];

  async function walk(currentDir: string, depth: number) {
    if (depth > maxDepth) return;

    const relDir = toPosix(path.relative(rootDir, currentDir));
    const base = path.basename(currentDir);
    if (SKIP_DIRS.has(base)) return;
    if (relDir && ignoreMatchers.some((m) => m(relDir, base))) return;

    if (await exists(path.join(currentDir, CONFIG_FILE))) matches.push(path.resolve(currentDir));

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory()) return;
        const child = path.join(currentDir, entry.name);
        try {
          const stat = await fs.lstat(child);
          if (stat.isSymbolicLink()) return;
        } catch {
          return;
        }
        await walk(child, depth + 1);
      })
    );
  }

  await walk(path.resolve(rootDir), 0);
  return matches;
}

async function loadGitignoreMatchers(rootDir: string) {
  const ignorePath = path.join(rootDir, '.gitignore');
  if (!(await exists(ignorePath))) return [];
  const raw = await fs.readFile(ignorePath, 'utf8');
  const patterns = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'));

  return patterns.map((pattern) => {
    const normalized = toPosix(pattern.replace(/\/$/u, ''));
    return (relPath: string, baseName: string) => {
      if (normalized.includes('/')) {
        return globMatch(relPath, normalized) || relPath.startsWith(`${normalized}/`);
      }
      if (normalized.includes('*')) {
        return globMatch(baseName, normalized);
      }
      return baseName === normalized;
    };
  });
}

function globMatch(relPath: string, pattern: string) {
  const regex = globToRegex(pattern);
  return regex.test(toPosix(relPath));
}

function globToRegex(pattern: string) {
  const normalized = toPosix(pattern);
  let out = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const c = normalized[i];
    if (c === '*') {
      if (normalized[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if ('\\^$+?.()|{}[]'.includes(c)) out += `\\${c}`;
    else out += c;
  }
  out += '$';
  return new RegExp(out);
}

function resolveWorkspacePath(rootDir: string, value: string) {
  return path.resolve(rootDir, value);
}

function toPosix(value: string) {
  return value.split(path.sep).join('/');
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

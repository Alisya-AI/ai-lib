import fs from 'node:fs/promises';
import path from 'node:path';
import { copySourceFile } from './file-helpers.ts';
import { exists, rmIfExists } from './utils.ts';
import type { WorkspaceState } from './types.ts';

export async function ensureWorkspaceAssets({
  workspaceDir,
  packageRoot,
  state,
  rootDir
}: {
  workspaceDir: string;
  packageRoot: string;
  state: WorkspaceState;
  rootDir: string;
}) {
  const outRoot = path.join(workspaceDir, '.ailib');
  await fs.mkdir(path.join(outRoot, 'modules'), { recursive: true });

  if (path.resolve(workspaceDir) === path.resolve(rootDir)) {
    await copySourceFile({ packageRoot, sourceRel: 'core/behavior.md', target: path.join(outRoot, 'behavior.md') });
  }

  await copySourceFile({
    packageRoot,
    sourceRel: 'core/development-standards.md',
    target: path.join(outRoot, 'development-standards.md')
  });

  await copySourceFile({
    packageRoot,
    sourceRel: 'core/test-standards.md',
    target: path.join(outRoot, 'test-standards.md')
  });

  await copySourceFile({
    packageRoot,
    sourceRel: `languages/${state.effective.language}/core.md`,
    target: path.join(outRoot, 'standards.md')
  });

  const localModules = state.localModules;
  const localSet = new Set(localModules);
  for (const mod of localModules) {
    const sourceRel = `languages/${state.effective.language}/modules/${mod}.md`;
    const source = path.join(packageRoot, sourceRel);
    const target = path.join(outRoot, 'modules', `${mod}.md`);
    if (await exists(source)) {
      await copySourceFile({ packageRoot, sourceRel, target });
      continue;
    }

    const existing = path.join(outRoot, 'modules', `${mod}.md`);
    ensure(await exists(existing), `Missing module source: ${sourceRel}`);
  }

  const moduleDir = path.join(outRoot, 'modules');
  if (await exists(moduleDir)) {
    for (const entry of await fs.readdir(moduleDir)) {
      if (!entry.endsWith('.md')) continue;
      const id = entry.replace(/\.md$/u, '');
      if (!localSet.has(id)) await rmIfExists(path.join(moduleDir, entry));
    }
  }
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

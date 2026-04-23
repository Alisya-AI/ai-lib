import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { workspaceLabelFor } from './context-resolution.ts';
import type { WorkspaceState } from './types.ts';

export async function writeRootLock({
  rootDir,
  packageRoot,
  packageVersion,
  registryRef,
  allStates
}: {
  rootDir: string;
  packageRoot: string;
  packageVersion: string;
  registryRef: string;
  allStates: Map<string, WorkspaceState>;
}) {
  const registryText = await fs.readFile(path.join(packageRoot, 'registry.json'), 'utf8');
  const lock = {
    lockfile_version: 1,
    cli_version: packageVersion,
    registry_ref: registryRef,
    registry_sha256: sha256(registryText),
    workspaces: {} as Record<string, { files: Record<string, { source: string; sha256: string }> }>
  };

  for (const [workspaceDir, state] of allStates.entries()) {
    const relWorkspace = workspaceLabelFor(rootDir, workspaceDir);
    const files: Record<string, { source: string; sha256: string }> = {};

    if (path.resolve(workspaceDir) === path.resolve(rootDir)) {
      const rel = '.ailib/behavior.md';
      const text = await fs.readFile(path.join(workspaceDir, rel), 'utf8');
      files[rel] = { source: 'core/behavior.md', sha256: sha256(text) };
    }

    {
      const rel = '.ailib/development-standards.md';
      const text = await fs.readFile(path.join(workspaceDir, rel), 'utf8');
      files[rel] = { source: 'core/development-standards.md', sha256: sha256(text) };
    }

    {
      const rel = '.ailib/test-standards.md';
      const text = await fs.readFile(path.join(workspaceDir, rel), 'utf8');
      files[rel] = { source: 'core/test-standards.md', sha256: sha256(text) };
    }

    {
      const rel = '.ailib/standards.md';
      const text = await fs.readFile(path.join(workspaceDir, rel), 'utf8');
      files[rel] = { source: `languages/${state.effective.language}/core.md`, sha256: sha256(text) };
    }

    for (const mod of state.localModules) {
      const rel = `.ailib/modules/${mod}.md`;
      const full = path.join(workspaceDir, rel);
      const text = await fs.readFile(full, 'utf8');
      let source = `languages/${state.effective.language}/modules/${mod}.md`;
      if (!(await exists(path.join(packageRoot, source)))) source = 'local';
      files[rel] = { source, sha256: sha256(text) };
    }

    lock.workspaces[relWorkspace] = { files };
  }

  await fs.writeFile(path.join(rootDir, 'ailib.lock'), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

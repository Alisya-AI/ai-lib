import fs from 'node:fs/promises';
import path from 'node:path';
import { detectProjectRoot, findNearestMonorepoRoot } from './context-resolution.ts';
import { getStringFlag } from './flags.ts';
import { validateModuleSelection } from './module-validation.ts';
import { readJson, splitCsv, toPosix, uniqueList } from './utils.ts';
import type { CliFlags, Registry, WorkspaceConfig } from './types.ts';

export async function initCommand({
  cwd,
  packageRoot,
  flags,
  configFile,
  canonicalSlot,
  applyWorkspaceUpdate
}: {
  cwd: string;
  packageRoot: string;
  flags: CliFlags;
  configFile: string;
  canonicalSlot: (registry: Registry, slot: string | undefined) => string | null;
  applyWorkspaceUpdate: (args: {
    packageRoot: string;
    rootDir: string;
    workspaceOverride?: string;
    forceOnConflict?: string;
  }) => Promise<void>;
}) {
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const nearestRoot = await findNearestMonorepoRoot(path.resolve(cwd));
  const inServiceContext = Boolean(nearestRoot && path.resolve(cwd) !== nearestRoot);

  const language = getStringFlag(flags, 'language') || Object.keys(registry.languages)[0];
  ensure(registry.languages[language], `Unsupported language: ${language}`);

  const modules = uniqueList(splitCsv(flags.modules));
  const targets = uniqueList(splitCsv(flags.targets).length ? splitCsv(flags.targets) : Object.keys(registry.targets));
  const onConflict = getStringFlag(flags, 'on-conflict') || 'merge';

  validateModuleSelection({
    registry,
    language,
    modules,
    canonicalSlot: (slot) => canonicalSlot(registry, slot)
  });

  if (inServiceContext && flags['no-inherit'] !== true) {
    const projectRoot = path.resolve(cwd);
    const rel = toPosix(path.relative(projectRoot, path.join(nearestRoot, configFile)));
    const config: WorkspaceConfig = {
      $schema: 'https://ailib.dev/schema/config.schema.json',
      extends: rel,
      language,
      modules,
      docs_path: './docs/'
    };
    if (targets.length) config.targets = targets;

    await fs.writeFile(path.join(projectRoot, configFile), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await applyWorkspaceUpdate({
      packageRoot,
      rootDir: nearestRoot,
      workspaceOverride: projectRoot,
      forceOnConflict: onConflict
    });
    process.stdout.write('ailib initialized\n');
    return;
  }

  const projectRoot = await detectProjectRoot(cwd);
  const config: WorkspaceConfig = {
    $schema: 'https://ailib.dev/schema/config.schema.json',
    registry_ref: registry.version,
    language,
    modules,
    targets,
    docs_path: 'docs/',
    on_conflict: onConflict
  };

  const workspacePatterns = splitCsv(flags.workspaces);
  if (flags.bare !== true) {
    config.workspaces = workspacePatterns.length ? workspacePatterns : ['apps/*', 'services/*'];
  }

  await fs.writeFile(path.join(projectRoot, configFile), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await applyWorkspaceUpdate({ packageRoot, rootDir: projectRoot, forceOnConflict: onConflict });
  process.stdout.write('ailib initialized\n');
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

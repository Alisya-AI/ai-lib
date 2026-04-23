import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { executeCommand } from './cli/dispatch.ts';
import { getStringFlag, parseFlags } from './cli/flags.ts';
import { printHelp } from './cli/help.ts';
import { modulesCommand as runModulesCommand, slotsCommand as runSlotsCommand } from './cli/introspection.ts';
import { detectProjectRoot, findNearestMonorepoRoot, resolveContext } from './cli/context-resolution.ts';
import { doctorCommand as runDoctorCommand } from './cli/doctor.ts';
import {
  addCommand as runAddCommand,
  removeCommand as runRemoveCommand,
  updateCommand as runUpdateCommand
} from './cli/module-mutations.ts';
import { validateModuleSelection } from './cli/module-validation.ts';
import { uninstallCommand as runUninstallCommand } from './cli/uninstall.ts';
import { applyWorkspaceUpdate as applyWorkspaceUpdateCore } from './cli/workspace-update.ts';
import { canonicalSlot, exists, readJson, splitCsv, toPosix, uniqueList } from './cli/utils.ts';
import type { CommandContext, Registry, RunOptions, WorkspaceConfig } from './cli/types.ts';

const CONFIG_FILE = 'ailib.config.json';
const LOCAL_OVERRIDE_FILE = 'ailib.local.json';
const LOCK_FILE = 'ailib.lock';
const WARNED_SLOT_ALIASES = new Set<string>();

function resolveCanonicalSlot(registry: Registry, slot: string | undefined) {
  return canonicalSlot({ registry, slot, warnedSlotAliases: WARNED_SLOT_ALIASES });
}

export async function run(argv: string[], options: RunOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const packageRoot = options.packageRoot ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const context: CommandContext = { cwd, packageRoot, flags };

  await executeCommand({
    command,
    context,
    handlers: createCommandHandlers(),
    printHelp
  });
}

function createCommandHandlers() {
  return {
    init: async (context: CommandContext) => initCommand(context),
    update: async (context: CommandContext) => updateCommand(context),
    add: async (context: CommandContext) => addCommand(context),
    remove: async (context: CommandContext) => removeCommand(context),
    doctor: async (context: CommandContext) => doctorCommand(context),
    uninstall: async (context: CommandContext) => uninstallCommand(context),
    slots: async (context: CommandContext) => slotsCommand(context),
    modules: async (context: CommandContext) => modulesCommand(context)
  };
}

async function slotsCommand({ packageRoot, flags }: Pick<CommandContext, 'packageRoot' | 'flags'>) {
  await runSlotsCommand({ packageRoot, flags });
}

async function modulesCommand({ packageRoot, flags }: Pick<CommandContext, 'packageRoot' | 'flags'>) {
  await runModulesCommand({ packageRoot, flags });
}

async function initCommand({ cwd, packageRoot, flags }: CommandContext) {
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
    canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot)
  });

  if (inServiceContext && flags['no-inherit'] !== true) {
    const projectRoot = path.resolve(cwd);
    const rel = toPosix(path.relative(projectRoot, path.join(nearestRoot, CONFIG_FILE)));
    const config: WorkspaceConfig = {
      $schema: 'https://ailib.dev/schema/config.schema.json',
      extends: rel,
      language,
      modules,
      docs_path: './docs/'
    };
    if (targets.length) config.targets = targets;

    await fs.writeFile(path.join(projectRoot, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
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

  await fs.writeFile(path.join(projectRoot, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await applyWorkspaceUpdate({ packageRoot, rootDir: projectRoot, forceOnConflict: onConflict });
  process.stdout.write('ailib initialized\n');
}

async function updateCommand({ cwd, packageRoot, flags }: CommandContext) {
  await runUpdateCommand({
    cwd,
    packageRoot,
    flags,
    configFile: CONFIG_FILE,
    localOverrideFile: LOCAL_OVERRIDE_FILE,
    canonicalSlot: (registry, slot) => resolveCanonicalSlot(registry, slot),
    applyWorkspaceUpdate: async ({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict }) =>
      applyWorkspaceUpdate({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict })
  });
}

async function addCommand({ cwd, packageRoot, flags }: CommandContext) {
  await runAddCommand({
    cwd,
    packageRoot,
    flags,
    configFile: CONFIG_FILE,
    localOverrideFile: LOCAL_OVERRIDE_FILE,
    canonicalSlot: (registry, slot) => resolveCanonicalSlot(registry, slot),
    applyWorkspaceUpdate: async ({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict }) =>
      applyWorkspaceUpdate({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict })
  });
}

async function removeCommand({ cwd, packageRoot, flags }: CommandContext) {
  await runRemoveCommand({
    cwd,
    packageRoot,
    flags,
    configFile: CONFIG_FILE,
    applyWorkspaceUpdate: async ({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict }) =>
      applyWorkspaceUpdate({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict })
  });
}

async function doctorCommand({ cwd, packageRoot, flags }: CommandContext) {
  await runDoctorCommand({
    cwd,
    packageRoot,
    flags,
    configFile: CONFIG_FILE,
    localOverrideFile: LOCAL_OVERRIDE_FILE,
    canonicalSlot: (registry, slot) => resolveCanonicalSlot(registry, slot)
  });
}

async function uninstallCommand({ cwd, packageRoot, flags }: CommandContext) {
  await runUninstallCommand({
    cwd,
    packageRoot,
    flags,
    configFile: CONFIG_FILE,
    lockFile: LOCK_FILE,
    applyWorkspaceUpdate: async ({ packageRoot: rootPackage, rootDir, forceOnConflict }) =>
      applyWorkspaceUpdate({ packageRoot: rootPackage, rootDir, forceOnConflict })
  });
}

async function applyWorkspaceUpdate({
  packageRoot,
  rootDir,
  workspaceOverride,
  forceOnConflict
}: {
  packageRoot: string;
  rootDir: string;
  workspaceOverride?: string;
  forceOnConflict?: string;
}) {
  await applyWorkspaceUpdateCore({
    packageRoot,
    rootDir,
    workspaceOverride,
    forceOnConflict,
    configFile: CONFIG_FILE,
    localOverrideFile: LOCAL_OVERRIDE_FILE,
    canonicalSlot: (registry, slot) => resolveCanonicalSlot(registry, slot)
  });
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

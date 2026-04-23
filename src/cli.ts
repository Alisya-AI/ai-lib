import path from 'node:path';
import process from 'node:process';
import { executeCommand } from './cli/dispatch.ts';
import { parseFlags } from './cli/flags.ts';
import { printHelp } from './cli/help.ts';
import { initCommand as runInitCommand } from './cli/init.ts';
import { modulesCommand as runModulesCommand, slotsCommand as runSlotsCommand } from './cli/introspection.ts';
import { resolveContext } from './cli/context-resolution.ts';
import { doctorCommand as runDoctorCommand } from './cli/doctor.ts';
import {
  addCommand as runAddCommand,
  removeCommand as runRemoveCommand,
  updateCommand as runUpdateCommand
} from './cli/module-mutations.ts';
import { uninstallCommand as runUninstallCommand } from './cli/uninstall.ts';
import { applyWorkspaceUpdate as applyWorkspaceUpdateCore } from './cli/workspace-update.ts';
import { canonicalSlot } from './cli/utils.ts';
import type { CommandContext, Registry, RunOptions } from './cli/types.ts';

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
  await runInitCommand({
    cwd,
    packageRoot,
    flags,
    configFile: CONFIG_FILE,
    canonicalSlot: (registry, slot) => resolveCanonicalSlot(registry, slot),
    applyWorkspaceUpdate: async ({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict }) =>
      applyWorkspaceUpdate({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict })
  });
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

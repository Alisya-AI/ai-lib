import path from 'node:path';
import process from 'node:process';
import { createCommandHandlers } from './cli/command-handlers.ts';
import { executeCommand } from './cli/dispatch.ts';
import { parseFlags } from './cli/flags.ts';
import { printHelp } from './cli/help.ts';
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
    handlers: createCommandHandlers({
      configFile: CONFIG_FILE,
      localOverrideFile: LOCAL_OVERRIDE_FILE,
      lockFile: LOCK_FILE,
      resolveCanonicalSlot: (registry, slot) => resolveCanonicalSlot(registry, slot),
      applyWorkspaceUpdate: async ({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict }) =>
        applyWorkspaceUpdate({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict })
    }),
    printHelp
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

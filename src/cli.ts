import path from 'node:path';
import process from 'node:process';
import { createCommandHandlers } from './cli/command-handlers.ts';
import { executeCommand } from './cli/dispatch.ts';
import { parseFlags } from './cli/flags.ts';
import { printHelp } from './cli/help.ts';
import { createCanonicalSlotResolver } from './cli/slot-resolver.ts';
import { readJson } from './cli/utils.ts';
import { createWorkspaceUpdateRunner } from './cli/workspace-update-runner.ts';
import type { CommandContext, RunOptions } from './cli/types.ts';

const CONFIG_FILE = 'ailib.config.json';
const LOCAL_OVERRIDE_FILE = 'ailib.local.json';
const LOCK_FILE = 'ailib.lock';
const RESOLVE_CANONICAL_SLOT = createCanonicalSlotResolver();
const APPLY_WORKSPACE_UPDATE = createWorkspaceUpdateRunner({
  configFile: CONFIG_FILE,
  localOverrideFile: LOCAL_OVERRIDE_FILE,
  canonicalSlot: (registry, slot) => RESOLVE_CANONICAL_SLOT(registry, slot)
});

export async function run(argv: string[], options: RunOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const packageRoot = options.packageRoot ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const packageJson = await readJson<{ version?: string }>(path.join(packageRoot, 'package.json'));
  const cliVersion = packageJson.version;
  if (typeof cliVersion !== 'string' || !cliVersion.trim()) {
    throw new Error(`Invalid package.json: missing version in ${path.join(packageRoot, 'package.json')}`);
  }

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
      resolveCanonicalSlot: (registry, slot) => RESOLVE_CANONICAL_SLOT(registry, slot),
      applyWorkspaceUpdate: async ({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict }) =>
        APPLY_WORKSPACE_UPDATE({ packageRoot: rootPackage, rootDir, workspaceOverride, forceOnConflict })
    }),
    printHelp,
    printVersion: () => {
      process.stdout.write(`${cliVersion}\n`);
    }
  });
}

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { executeCommand } from './cli/dispatch.ts';
import { getStringFlag, parseFlags } from './cli/flags.ts';
import { printHelp } from './cli/help.ts';
import {
  detectProjectRoot,
  findNearestMonorepoRoot,
  resolveDefaultWorkspaceForMutation,
  resolveWorkspacePath,
  resolveContext
} from './cli/context-resolution.ts';
import { doctorCommand as runDoctorCommand } from './cli/doctor.ts';
import { validateModuleSelection } from './cli/module-validation.ts';
import { uninstallCommand as runUninstallCommand } from './cli/uninstall.ts';
import { getEffectiveWorkspaceConfig } from './cli/workspace-state.ts';
import { applyWorkspaceUpdate as applyWorkspaceUpdateCore } from './cli/workspace-update.ts';
import { canonicalSlot, exists, readJson, splitCsv, toPosix, uniqueList } from './cli/utils.ts';
import type { CommandContext, LanguageDefinition, Registry, RunOptions, WorkspaceConfig } from './cli/types.ts';

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
  const sub = flags._[0] || 'list';
  ensure(sub === 'list', `Usage: ailib slots list`);

  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const slotDefs = registry.slot_defs || {};

  const lines = ['slots:'];
  for (const slot of registry.slots || []) {
    const def = slotDefs[slot] || {};
    const kind = def.kind ? ` (${def.kind})` : '';
    const description = def.description ? ` - ${def.description}` : '';
    lines.push(`- ${slot}${kind}${description}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function modulesCommand({ packageRoot, flags }: Pick<CommandContext, 'packageRoot' | 'flags'>) {
  const sub = flags._[0];
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));

  if (sub === 'list') {
    const language = getStringFlag(flags, 'language') || Object.keys(registry.languages)[0];
    const lang = registry.languages[language];
    ensure(lang, `Unsupported language: ${language}`);

    const lines = [`modules (${language}):`];
    const modules = Object.entries(lang.modules || {}).sort(([a], [b]) => a.localeCompare(b));
    for (const [moduleId, moduleDef] of modules) {
      lines.push(`- ${moduleId} (slot: ${moduleDef.slot})`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  if (sub === 'explain') {
    const moduleId = flags._[1];
    ensure(moduleId, 'Usage: ailib modules explain <module> [--language=<lang>]');

    const requestedLanguage = getStringFlag(flags, 'language');
    const candidates: Array<[string, LanguageDefinition | undefined]> = requestedLanguage
      ? [[requestedLanguage, registry.languages[requestedLanguage]]]
      : Object.entries(registry.languages || {});

    if (requestedLanguage) {
      ensure(registry.languages[requestedLanguage], `Unsupported language: ${requestedLanguage}`);
    }

    for (const [language, lang] of candidates) {
      const moduleDef = lang?.modules?.[moduleId];
      if (!moduleDef) continue;
      const lines = [
        `module: ${moduleId}`,
        `language: ${language}`,
        `slot: ${moduleDef.slot}`,
        `requires: ${(moduleDef.requires || []).join(', ') || '(none)'}`,
        `conflicts_with: ${(moduleDef.conflicts_with || []).join(', ') || '(none)'}`,
        `doc: languages/${language}/modules/${moduleId}.md`
      ];
      process.stdout.write(`${lines.join('\n')}\n`);
      return;
    }

    const scope = requestedLanguage ? ` for ${requestedLanguage}` : '';
    throw new Error(`Unknown module${scope}: ${moduleId}`);
  }

  throw new Error('Usage: ailib modules list [--language=<lang>] | ailib modules explain <module> [--language=<lang>]');
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
  const context = await resolveContext(cwd);
  const workspaceFlag = getStringFlag(flags, 'workspace');
  const workspaceOverride = workspaceFlag ? resolveWorkspacePath(context.rootDir, workspaceFlag) : undefined;
  await applyWorkspaceUpdate({
    packageRoot,
    rootDir: context.rootDir,
    workspaceOverride,
    forceOnConflict: 'overwrite'
  });
  process.stdout.write('ailib updated\n');
}

async function addCommand({ cwd, packageRoot, flags }: CommandContext) {
  const moduleId = flags._[0];
  ensure(moduleId, 'Usage: ailib add <module>');
  const context = await resolveContext(cwd);
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));

  const targetWorkspace = resolveDefaultWorkspaceForMutation(context, getStringFlag(flags, 'workspace'));
  const configPath = path.join(targetWorkspace, CONFIG_FILE);
  ensure(await exists(configPath), `Missing ${CONFIG_FILE} in workspace: ${targetWorkspace}`);

  const config = await readJson<WorkspaceConfig>(configPath);
  const effective = await getEffectiveWorkspaceConfig({
    workspaceDir: targetWorkspace,
    rootDir: context.rootDir,
    rootConfig: await readJson<WorkspaceConfig>(path.join(context.rootDir, CONFIG_FILE)),
    registry,
    canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot),
    configFile: CONFIG_FILE,
    localOverrideFile: LOCAL_OVERRIDE_FILE
  });
  validateModuleSelection({
    registry,
    language: effective.language,
    modules: uniqueList([...(config.modules || []), moduleId]),
    canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot)
  });

  config.modules = uniqueList([...(config.modules || []), moduleId]);
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const isRootMutation = path.resolve(targetWorkspace) === path.resolve(context.rootDir);
  await applyWorkspaceUpdate({
    packageRoot,
    rootDir: context.rootDir,
    workspaceOverride: isRootMutation ? undefined : targetWorkspace,
    forceOnConflict: 'overwrite'
  });

  process.stdout.write(`module added: ${moduleId}\n`);
}

async function removeCommand({ cwd, packageRoot, flags }: CommandContext) {
  const moduleId = flags._[0];
  ensure(moduleId, 'Usage: ailib remove <module>');
  const context = await resolveContext(cwd);
  const targetWorkspace = resolveDefaultWorkspaceForMutation(context, getStringFlag(flags, 'workspace'));

  const configPath = path.join(targetWorkspace, CONFIG_FILE);
  ensure(await exists(configPath), `Missing ${CONFIG_FILE} in workspace: ${targetWorkspace}`);
  const config = await readJson<WorkspaceConfig>(configPath);
  config.modules = (config.modules || []).filter((m) => m !== moduleId);
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const isRootMutation = path.resolve(targetWorkspace) === path.resolve(context.rootDir);
  await applyWorkspaceUpdate({
    packageRoot,
    rootDir: context.rootDir,
    workspaceOverride: isRootMutation ? undefined : targetWorkspace,
    forceOnConflict: 'overwrite'
  });

  process.stdout.write(`module removed: ${moduleId}\n`);
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

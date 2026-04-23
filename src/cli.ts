import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { executeCommand } from './cli/dispatch.ts';
import { getStringFlag, parseFlags } from './cli/flags.ts';
import { printHelp } from './cli/help.ts';
import {
  detectProjectRoot,
  findNearestMonorepoRoot,
  isRootWorkspaceConfig,
  resolveContext,
  resolveDefaultWorkspaceForMutation,
  resolveWorkspacePath,
  workspaceLabelFor
} from './cli/context-resolution.ts';
import { parseFrontmatter } from './cli/file-helpers.ts';
import { writeRootLock } from './cli/lockfile.ts';
import { assertLocalOverridesValid } from './cli/local-override-config.ts';
import { diffSlots } from './cli/module-selection.ts';
import { validateModuleSelection } from './cli/module-validation.ts';
import { generateWorkspaceRouters } from './cli/router-generation.ts';
import { ensureWorkspaceAssets } from './cli/workspace-assets.ts';
import { buildWorkspaceState, getEffectiveWorkspaceConfig } from './cli/workspace-state.ts';
import { canonicalSlot, exists, readJson, rmIfExists, splitCsv, toPosix, uniqueList } from './cli/utils.ts';
import { listWorkspaceDirs } from './cli/workspace-discovery.ts';
import type {
  CliFlags,
  CommandContext,
  LanguageDefinition,
  ListOverrideScope,
  ModuleDefinition,
  Registry,
  RunOptions,
  SlotAliasMeta,
  SlotDefinition,
  SlotOverrideRule,
  TargetDefinition,
  WorkspaceConfig,
  WorkspaceOverrideConfig,
  WorkspaceState
} from './cli/types.ts';

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
  const context = await resolveContext(cwd);
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const rootConfig = await readJson<WorkspaceConfig>(path.join(context.rootDir, CONFIG_FILE));
  const workspaceDirs = await listWorkspaceDirs({
    rootDir: context.rootDir,
    rootConfig,
    workspaceOverride: getStringFlag(flags, 'workspace')
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    await assertLocalOverridesValid({
      rootDir: context.rootDir,
      rootConfig,
      registry,
      canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot),
      localOverrideFile: LOCAL_OVERRIDE_FILE
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
  }
  if (errors.length) {
    process.stdout.write(`doctor failed:\n- ${errors.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }

  const rootEffective = await getEffectiveWorkspaceConfig({
    workspaceDir: context.rootDir,
    rootDir: context.rootDir,
    rootConfig,
    registry,
    canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot),
    configFile: CONFIG_FILE,
    localOverrideFile: LOCAL_OVERRIDE_FILE
  });
  for (const workspaceDir of workspaceDirs) {
    const workspaceLabel = workspaceLabelFor(context.rootDir, workspaceDir);
    const configPath = path.join(workspaceDir, CONFIG_FILE);
    if (!(await exists(configPath))) {
      errors.push(`[${workspaceLabel}] Missing ${CONFIG_FILE}`);
      continue;
    }

    let state: WorkspaceState;
    try {
      state = await buildWorkspaceState({
        workspaceDir,
        rootDir: context.rootDir,
        rootConfig,
        registry,
        canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot),
        configFile: CONFIG_FILE,
        localOverrideFile: LOCAL_OVERRIDE_FILE
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`[${workspaceLabel}] ${message}`);
      continue;
    }

    for (const rel of state.requiredFiles) {
      if (!(await exists(path.join(workspaceDir, rel)))) {
        errors.push(`[${workspaceLabel}] Missing pointer file: ${rel}`);
      }
    }

    for (const rel of state.requiredFiles) {
      const full = path.join(workspaceDir, rel);
      if (!(await exists(full))) continue;
      const text = await fs.readFile(full, 'utf8');
      const frontmatter = parseFrontmatter(text);
      if (!frontmatter) {
        errors.push(`[${workspaceLabel}] Missing frontmatter: ${rel}`);
        continue;
      }
      for (const key of ['id', 'version', 'updated']) {
        if (!(key in frontmatter)) {
          errors.push(`[${workspaceLabel}] Frontmatter missing '${key}': ${rel}`);
        }
      }
      if (!('language' in frontmatter) && !('core' in frontmatter)) {
        errors.push(`[${workspaceLabel}] Frontmatter missing 'language' or 'core': ${rel}`);
      }
      if (rel.includes('/modules/') && !('slot' in frontmatter)) {
        errors.push(`[${workspaceLabel}] Frontmatter missing 'slot': ${rel}`);
      }
    }

    if (path.resolve(workspaceDir) !== path.resolve(context.rootDir)) {
      const slotDiffs = diffSlots({
        rootModules: rootEffective.modules,
        workspaceModules: state.effective.modules,
        registry,
        language: state.effective.language,
        canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot)
      });
      for (const msg of slotDiffs) warnings.push(`[${workspaceLabel}] ${msg}`);
    }
  }

  if (warnings.length) process.stdout.write(`doctor warnings:\n- ${warnings.join('\n- ')}\n`);

  if (errors.length) {
    process.stdout.write(`doctor failed:\n- ${errors.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write('doctor ok\n');
}

async function uninstallCommand({ cwd, packageRoot, flags }: CommandContext) {
  const context = await resolveContext(cwd);
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));

  const rootConfigPath = path.join(context.rootDir, CONFIG_FILE);
  const rootConfig = (await exists(rootConfigPath)) ? await readJson<WorkspaceConfig>(rootConfigPath) : null;
  const atRoot = path.resolve(context.workspaceDir) === path.resolve(context.rootDir);
  const monorepo = Boolean(rootConfig?.workspaces);

  if (atRoot && monorepo && flags.all !== true) {
    await uninstallWorkspace(context.rootDir, rootConfig, registry);
    process.stdout.write('ailib uninstalled\n');
    return;
  }

  if (atRoot && monorepo && flags.all === true) {
    const workspaceDirs = await listWorkspaceDirs({ rootDir: context.rootDir, rootConfig });
    for (const workspaceDir of workspaceDirs) {
      const cfgPath = path.join(workspaceDir, CONFIG_FILE);
      const cfg = (await exists(cfgPath)) ? await readJson<WorkspaceConfig>(cfgPath) : rootConfig;
      await uninstallWorkspace(workspaceDir, cfg, registry);
    }
    await rmIfExists(path.join(context.rootDir, LOCK_FILE));
    process.stdout.write('ailib uninstalled\n');
    return;
  }

  const targetDir = context.workspaceDir;
  const cfgPath = path.join(targetDir, CONFIG_FILE);
  const cfg = (await exists(cfgPath)) ? await readJson<WorkspaceConfig>(cfgPath) : null;
  await uninstallWorkspace(targetDir, cfg, registry);

  if (path.resolve(targetDir) === path.resolve(context.rootDir)) {
    await rmIfExists(path.join(context.rootDir, LOCK_FILE));
  } else if (await exists(rootConfigPath)) {
    await applyWorkspaceUpdate({ packageRoot, rootDir: context.rootDir, forceOnConflict: 'overwrite' });
  }

  process.stdout.write('ailib uninstalled\n');
}

async function uninstallWorkspace(workspaceDir: string, config: WorkspaceConfig | null, registry: Registry) {
  await rmIfExists(path.join(workspaceDir, '.ailib'));
  await rmIfExists(path.join(workspaceDir, CONFIG_FILE));
  if (config?.targets) {
    for (const target of config.targets) {
      const targetDef = registry.targets[target];
      if (!targetDef) continue;
      await rmIfExists(path.join(workspaceDir, targetDef.output));
      if (targetDef.root_output && isRootWorkspaceConfig(config))
        await rmIfExists(path.join(workspaceDir, targetDef.root_output));
      if (target === 'copilot' && isRootWorkspaceConfig(config)) {
        await rmIfExists(path.join(workspaceDir, '.github/instructions'));
      }
    }
  }
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
  const rootConfigPath = path.join(rootDir, CONFIG_FILE);
  ensure(await exists(rootConfigPath), `Missing ${CONFIG_FILE} at root: ${rootDir}`);

  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const packageJson = await readJson<{ version: string }>(path.join(packageRoot, 'package.json'));
  const rootConfig = await readJson<WorkspaceConfig>(rootConfigPath);
  await assertLocalOverridesValid({
    rootDir,
    rootConfig,
    registry,
    canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot),
    localOverrideFile: LOCAL_OVERRIDE_FILE
  });

  const workspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig, workspaceOverride });
  const allWorkspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig });

  const stateMap = new Map<string, WorkspaceState>();
  for (const workspaceDir of allWorkspaceDirs) {
    stateMap.set(
      workspaceDir,
      await buildWorkspaceState({
        workspaceDir,
        rootDir,
        rootConfig,
        registry,
        canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot),
        configFile: CONFIG_FILE,
        localOverrideFile: LOCAL_OVERRIDE_FILE
      })
    );
  }

  for (const workspaceDir of workspaceDirs) {
    const state = stateMap.get(workspaceDir);
    await ensureWorkspaceAssets({ workspaceDir, packageRoot, state, rootDir });
  }

  for (const workspaceDir of workspaceDirs) {
    const state = stateMap.get(workspaceDir);
    const onConflict = forceOnConflict || state.effective.on_conflict || 'merge';
    await generateWorkspaceRouters({ workspaceDir, rootDir, state, onConflict, allStates: stateMap, registry });
  }

  await writeRootLock({
    rootDir,
    packageRoot,
    packageVersion: packageJson.version,
    registryRef: rootConfig.registry_ref || registry.version,
    allStates: stateMap
  });
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

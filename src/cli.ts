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
  relativePathForPointers,
  resolveContext,
  resolveDefaultWorkspaceForMutation,
  resolveWorkspacePath,
  workspaceLabelFor
} from './cli/context-resolution.ts';
import { copySourceFile, parseFrontmatter, writeManagedFile } from './cli/file-helpers.ts';
import { writeRootLock } from './cli/lockfile.ts';
import { applyListOverride, applySlotOverrides, mergeWorkspaceOverrides } from './cli/local-overrides.ts';
import { diffSlots, mergeModules, mergeTargets } from './cli/module-selection.ts';
import { validateModuleSelection } from './cli/module-validation.ts';
import { isRecord, validateWorkspaceOverride } from './cli/override-validation.ts';
import {
  canonicalSlot,
  exists,
  readJson,
  rmIfExists,
  sanitizeForFilename,
  splitCsv,
  toPosix,
  uniqueList
} from './cli/utils.ts';
import { resolveExtendsBase } from './cli/workspace-config.ts';
import { listWorkspaceDirs } from './cli/workspace-discovery.ts';
import type {
  CliFlags,
  CommandContext,
  EffectiveWorkspaceConfig,
  LanguageDefinition,
  ListOverrideScope,
  LocalOverrideConfig,
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
    registry
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
    await assertLocalOverridesValid({ rootDir: context.rootDir, rootConfig, registry });
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
    registry
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
      state = await buildWorkspaceState({ workspaceDir, rootDir: context.rootDir, rootConfig, registry });
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
  await assertLocalOverridesValid({ rootDir, rootConfig, registry });

  const workspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig, workspaceOverride });
  const allWorkspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig });

  const stateMap = new Map<string, WorkspaceState>();
  for (const workspaceDir of allWorkspaceDirs) {
    stateMap.set(workspaceDir, await buildWorkspaceState({ workspaceDir, rootDir, rootConfig, registry }));
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

async function ensureWorkspaceAssets({
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

async function generateWorkspaceRouters({
  workspaceDir,
  rootDir,
  state,
  onConflict,
  allStates,
  registry
}: {
  workspaceDir: string;
  rootDir: string;
  state: WorkspaceState;
  onConflict: string;
  allStates: Map<string, WorkspaceState>;
  registry: Registry;
}) {
  const targetSet = new Set<string>(state.effective.targets || []);
  const atRoot = path.resolve(workspaceDir) === path.resolve(rootDir);

  for (const targetId of targetSet) {
    const targetDef = registry.targets[targetId];
    if (!targetDef || targetDef.mode === 'copilot') continue;

    const label = targetDef.display || targetId;
    const frontmatter = targetDef.frontmatter
      ? atRoot
        ? targetDef.frontmatter.root
        : targetDef.frontmatter.workspace
      : '';
    const rendered = `${frontmatter || ''}${renderRouterDoc({ label, workspaceDir, rootDir, state })}`;
    await writeManagedFile({ outPath: path.join(workspaceDir, targetDef.output), rendered, onConflict });

    if (atRoot && targetDef.root_output) {
      await writeManagedFile({ outPath: path.join(workspaceDir, targetDef.root_output), rendered, onConflict });
    }
  }

  if (atRoot && targetSet.has('copilot')) {
    const scopedStates = [...allStates.entries()].filter(([, s]) => (s.effective.targets || []).includes('copilot'));
    const sections = scopedStates
      .map(([dir, s]) => {
        const label = workspaceLabelFor(rootDir, dir);
        return `## Workspace: ${label}\n\n${renderRouterDoc({ label: registry.targets.copilot?.display || 'GitHub Copilot', workspaceDir: dir, rootDir, state: s }).trim()}\n`;
      })
      .join('\n');

    await writeManagedFile({
      outPath: path.join(rootDir, registry.targets.copilot?.output || '.github/copilot-instructions.md'),
      rendered: `# ailib Router (${registry.targets.copilot?.display || 'GitHub Copilot'})\n\n${sections}`,
      onConflict
    });

    for (const [dir, s] of scopedStates) {
      const rel = workspaceLabelFor(rootDir, dir);
      const applyTo = rel === '.' ? '**' : `${toPosix(rel)}/**`;
      const fileName = rel === '.' ? 'root.instructions.md' : `${sanitizeForFilename(rel)}.instructions.md`;
      const content = `---\napplyTo: "${applyTo}"\n---\n\n${renderRouterDoc({ label: registry.targets.copilot?.display || 'GitHub Copilot', workspaceDir: dir, rootDir, state: s })}`;
      await writeManagedFile({
        outPath: path.join(rootDir, '.github/instructions', fileName),
        rendered: content,
        onConflict
      });
    }
  }
}

function renderRouterDoc({
  label,
  workspaceDir,
  rootDir,
  state
}: {
  label: string;
  workspaceDir: string;
  rootDir: string;
  state: WorkspaceState;
}) {
  const relToRoot = relativePathForPointers(workspaceDir, rootDir);
  const behaviorRef =
    path.resolve(workspaceDir) === path.resolve(rootDir)
      ? '@.ailib/behavior.md'
      : `@${toPosix(path.join(relToRoot, '.ailib/behavior.md'))}`;

  const inheritedModuleLines = state.inheritedModules.map((mod) => {
    const modPath = `@${toPosix(path.join(relToRoot, '.ailib/modules', `${mod}.md`))}`;
    return `- ${modPath}`;
  });

  const localModuleLines = state.localModules.map((mod) => `- @.ailib/modules/${mod}.md`);
  const moduleLines = [...inheritedModuleLines, ...localModuleLines];
  const docsBlock =
    path.resolve(workspaceDir) === path.resolve(rootDir)
      ? '# PROJECT-SPECIFIC CONTEXT\nPrioritize project context in @./docs/.\n'
      : `# PROJECT-SPECIFIC CONTEXT\nPrioritize service-local business logic in @./docs/.\nFor cross-service context, consult @${toPosix(path.join(relToRoot, 'docs/'))}.\nIf guidance conflicts, service-local docs win for service-scoped work.\n`;

  const modulesText = moduleLines.length ? moduleLines.join('\n') : '- (none)';
  return `# ailib Router (${label})\n\n# AILIB SYSTEM PROMPT\nAct as the AI Agent defined in ${behaviorRef}.\nAdhere to the coding standards in @.ailib/standards.md.\nApply development workflow rules in @.ailib/development-standards.md.\nApply test and coverage rules in @.ailib/test-standards.md.\n\n# MODULES & EXTENSIONS\n${modulesText}\n\n${docsBlock}`;
}

async function buildWorkspaceState({
  workspaceDir,
  rootDir,
  rootConfig,
  registry
}: {
  workspaceDir: string;
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
}): Promise<WorkspaceState> {
  const effective = await getEffectiveWorkspaceConfig({ workspaceDir, rootDir, rootConfig, registry });
  validateModuleSelection({
    registry,
    language: effective.language,
    modules: effective.modules,
    canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot)
  });

  const requiredFiles = [
    '.ailib/development-standards.md',
    '.ailib/test-standards.md',
    '.ailib/standards.md',
    ...effective.localModules.map((m) => `.ailib/modules/${m}.md`)
  ];
  if (path.resolve(workspaceDir) === path.resolve(rootDir)) requiredFiles.unshift('.ailib/behavior.md');

  return {
    effective,
    inheritedModules: effective.inheritedModules,
    localModules: effective.localModules,
    requiredFiles,
    warnings: effective.warnings
  };
}

async function getEffectiveWorkspaceConfig({
  workspaceDir,
  rootDir,
  rootConfig,
  registry
}: {
  workspaceDir: string;
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
}): Promise<EffectiveWorkspaceConfig> {
  const workspaceRaw = await readJson<WorkspaceConfig>(path.join(workspaceDir, CONFIG_FILE));
  const isRootWorkspace = path.resolve(workspaceDir) === path.resolve(rootDir);

  const base = await resolveExtendsBase({ workspaceDir, rootDir, rootConfig, registry });
  const language = workspaceRaw.language || base.language;
  ensure(language, `Missing language in ${CONFIG_FILE}: ${workspaceDir}`);
  ensure(registry.languages[language], `Unsupported language: ${language}`);

  const mergedModules = mergeModules({
    registry,
    language,
    parentModules: isRootWorkspace ? [] : base.modules || [],
    localModules: workspaceRaw.modules || (isRootWorkspace ? base.modules || [] : []),
    canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot)
  });

  const targets = mergeTargets({
    parentTargets: base.targets || [],
    localTargets: workspaceRaw.targets || [],
    targetsRemoved: workspaceRaw.targets_removed || []
  });

  const overrideResult = await applyLocalOverrides({
    rootDir,
    workspaceDir,
    rootConfig,
    registry,
    language,
    modules: mergedModules.modules,
    targets
  });
  const inheritedModuleSet = new Set(mergedModules.inheritedModules || []);
  const inheritedModules = overrideResult.modules.filter((mod) => inheritedModuleSet.has(mod));
  const localModules = overrideResult.modules.filter((mod) => !inheritedModuleSet.has(mod));

  return {
    $schema: workspaceRaw.$schema || base.$schema || 'https://ailib.dev/schema/config.schema.json',
    registry_ref: workspaceRaw.registry_ref || base.registry_ref,
    on_conflict: workspaceRaw.on_conflict || base.on_conflict || 'merge',
    language,
    modules: overrideResult.modules,
    targets: overrideResult.targets,
    docs_path: workspaceRaw.docs_path || (path.resolve(workspaceDir) === path.resolve(rootDir) ? 'docs/' : './docs/'),
    inheritedModules,
    localModules,
    warnings: [...mergedModules.warnings, ...overrideResult.warnings]
  };
}

async function applyLocalOverrides({
  rootDir,
  workspaceDir,
  rootConfig,
  registry,
  language,
  modules,
  targets
}: {
  rootDir: string;
  workspaceDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
  language: string;
  modules: string[];
  targets: string[];
}): Promise<{ modules: string[]; targets: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const config = await loadLocalOverrideConfig({ rootDir, rootConfig, registry });
  if (!config) {
    return { modules, targets, warnings };
  }

  const workspaceKey =
    path.resolve(workspaceDir) === path.resolve(rootDir) ? '.' : toPosix(path.relative(rootDir, workspaceDir));
  const override = mergeWorkspaceOverrides(config.default_override, (config.workspace_overrides || {})[workspaceKey]);

  const validTargets = new Set(Object.keys(registry.targets || {}));
  const validModules = new Set(Object.keys(registry.languages[language]?.modules || {}));

  const targetResult = applyListOverride({
    values: targets,
    scope: override.targets,
    validSet: validTargets,
    label: 'targets',
    localOverrideFile: LOCAL_OVERRIDE_FILE
  });

  const moduleResult = applyListOverride({
    values: modules,
    scope: override.modules,
    validSet: validModules,
    label: 'modules',
    localOverrideFile: LOCAL_OVERRIDE_FILE
  });
  warnings.push(...moduleResult.warnings);

  const slotResult = applySlotOverrides({
    registry,
    language,
    modules: moduleResult.values,
    slots: override.slots || {},
    localOverrideFile: LOCAL_OVERRIDE_FILE,
    canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot)
  });

  return {
    modules: slotResult.modules,
    targets: targetResult.values,
    warnings
  };
}

async function loadLocalOverrideConfig({
  rootDir,
  rootConfig,
  registry
}: {
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
}): Promise<LocalOverrideConfig | null> {
  const overridePath = path.join(rootDir, LOCAL_OVERRIDE_FILE);
  if (!(await exists(overridePath))) {
    return null;
  }

  const prefix = `Invalid ${LOCAL_OVERRIDE_FILE}`;
  let config: LocalOverrideConfig;
  try {
    config = await readJson<LocalOverrideConfig>(overridePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${prefix}: invalid JSON (${message})`);
  }

  const errors = await validateLocalOverrideConfig({ rootDir, rootConfig, registry, config });
  if (errors.length) {
    throw new Error(`${prefix}:\n- ${errors.join('\n- ')}`);
  }

  return config;
}

async function validateLocalOverrideConfig({
  rootDir,
  rootConfig,
  registry,
  config
}: {
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
  config: LocalOverrideConfig;
}): Promise<string[]> {
  const errors: string[] = [];
  if (!isRecord(config)) {
    return ['expected object at root'];
  }

  const allowedRootKeys = new Set(['version', 'default_override', 'workspace_overrides']);
  for (const key of Object.keys(config)) {
    if (!allowedRootKeys.has(key)) {
      errors.push(`unexpected root key '${key}'`);
    }
  }

  if (typeof config.version !== 'string' || !config.version.trim()) {
    errors.push(`missing required string 'version'`);
  }

  const workspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig });
  const workspaceKeys = new Set([
    '.',
    ...workspaceDirs
      .filter((workspaceDir) => path.resolve(workspaceDir) !== path.resolve(rootDir))
      .map((workspaceDir) => toPosix(path.relative(rootDir, workspaceDir)))
  ]);

  if (config.default_override !== undefined) {
    errors.push(
      ...validateWorkspaceOverride({
        override: config.default_override,
        label: 'default_override',
        registry,
        canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot)
      })
    );
  }

  if (config.workspace_overrides !== undefined) {
    if (!isRecord(config.workspace_overrides)) {
      errors.push(`'workspace_overrides' must be an object`);
    } else {
      for (const [workspaceKey, override] of Object.entries(config.workspace_overrides)) {
        if (typeof workspaceKey !== 'string' || !workspaceKey.trim()) {
          errors.push(`workspace override key must be a non-empty string`);
          continue;
        }
        if (!workspaceKeys.has(workspaceKey)) {
          errors.push(`unknown workspace override key '${workspaceKey}'`);
        }
        errors.push(
          ...validateWorkspaceOverride({
            override,
            label: `workspace_overrides.${workspaceKey}`,
            registry,
            canonicalSlot: (slot) => resolveCanonicalSlot(registry, slot)
          })
        );
      }
    }
  }

  return errors;
}

async function assertLocalOverridesValid({
  rootDir,
  rootConfig,
  registry
}: {
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
}) {
  await loadLocalOverrideConfig({ rootDir, rootConfig, registry });
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

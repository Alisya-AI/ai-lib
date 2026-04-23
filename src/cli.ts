import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { executeCommand } from './cli/dispatch.ts';
import { getStringFlag, parseFlags } from './cli/flags.ts';
import { printHelp } from './cli/help.ts';
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

const AILIB_BLOCK_START = '<!-- ailib:start -->';
const AILIB_BLOCK_END = '<!-- ailib:end -->';
const CONFIG_FILE = 'ailib.config.json';
const LOCAL_OVERRIDE_FILE = 'ailib.local.json';
const LOCK_FILE = 'ailib.lock';
const AUTO_DISCOVERY_MAX_DEPTH = 4;
const GLOB_DISCOVERY_MAX_DEPTH = 32;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.venv']);
const WARNED_SLOT_ALIASES = new Set();

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

  validateModuleSelection({ registry, language, modules });

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
    modules: uniqueList([...(config.modules || []), moduleId])
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
      const slotDiffs = diffSlots(rootEffective.modules, state.effective.modules, registry, state.effective.language);
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
  validateModuleSelection({ registry, language: effective.language, modules: effective.modules });

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
    localModules: workspaceRaw.modules || (isRootWorkspace ? base.modules || [] : [])
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
    label: 'target'
  });

  const moduleResult = applyListOverride({
    values: modules,
    scope: override.modules,
    validSet: validModules,
    label: 'module'
  });
  warnings.push(...moduleResult.warnings);

  const slotResult = applySlotOverrides({
    registry,
    language,
    modules: moduleResult.values,
    slots: override.slots || {}
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
        registry
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
            registry
          })
        );
      }
    }
  }

  return errors;
}

function validateWorkspaceOverride({
  override,
  label,
  registry
}: {
  override: unknown;
  label: string;
  registry: Registry;
}): string[] {
  const errors: string[] = [];
  if (!isRecord(override)) {
    return [`'${label}' must be an object`];
  }

  const allowed = new Set(['targets', 'modules', 'slots']);
  for (const key of Object.keys(override)) {
    if (!allowed.has(key)) {
      errors.push(`'${label}' has unsupported key '${key}'`);
    }
  }

  if (override.targets !== undefined) {
    errors.push(
      ...validateListOverrideScope({
        scope: override.targets,
        label: `${label}.targets`,
        validSet: new Set(Object.keys(registry.targets || {})),
        valueLabel: 'target'
      })
    );
  }

  if (override.modules !== undefined) {
    errors.push(
      ...validateListOverrideScope({
        scope: override.modules,
        label: `${label}.modules`,
        valueLabel: 'module'
      })
    );
  }

  if (override.slots !== undefined) {
    if (!isRecord(override.slots)) {
      errors.push(`'${label}.slots' must be an object`);
    } else {
      const knownSlots = new Set(registry.slots || []);
      for (const [slotKey, rule] of Object.entries(override.slots)) {
        const slot = canonicalSlot(registry, slotKey);
        if (!slot || !knownSlots.has(slot)) {
          errors.push(`'${label}.slots.${slotKey}' references unknown slot`);
        }
        if (!isRecord(rule)) {
          errors.push(`'${label}.slots.${slotKey}' must be an object`);
          continue;
        }
        for (const key of Object.keys(rule)) {
          if (key !== 'set' && key !== 'remove') {
            errors.push(`'${label}.slots.${slotKey}' has unsupported key '${key}'`);
          }
        }
        if (rule.set !== undefined && typeof rule.set !== 'string') {
          errors.push(`'${label}.slots.${slotKey}.set' must be a string`);
        }
        if (rule.remove !== undefined && typeof rule.remove !== 'boolean') {
          errors.push(`'${label}.slots.${slotKey}.remove' must be a boolean`);
        }
      }
    }
  }

  return errors;
}

function validateListOverrideScope({
  scope,
  label,
  validSet,
  valueLabel
}: {
  scope: unknown;
  label: string;
  validSet?: Set<string>;
  valueLabel: string;
}): string[] {
  const errors: string[] = [];
  if (!isRecord(scope)) {
    return [`'${label}' must be an object`];
  }

  const allowed = new Set(['set', 'add', 'remove']);
  for (const key of Object.keys(scope)) {
    if (!allowed.has(key)) {
      errors.push(`'${label}' has unsupported key '${key}'`);
    }
  }

  const validateList = (value: unknown, key: string) => {
    if (!Array.isArray(value)) {
      errors.push(`'${label}.${key}' must be an array`);
      return;
    }
    for (const item of value) {
      if (typeof item !== 'string' || !item.trim()) {
        errors.push(`'${label}.${key}' must contain non-empty strings`);
        continue;
      }
      if (validSet && !validSet.has(item)) {
        errors.push(`'${label}.${key}' contains unknown ${valueLabel} '${item}'`);
      }
    }
  };

  if (scope.set !== undefined) validateList(scope.set, 'set');
  if (scope.add !== undefined) validateList(scope.add, 'add');
  if (scope.remove !== undefined) validateList(scope.remove, 'remove');
  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function ensureValidItems({ list, validSet, label }: { list: string[]; validSet: Set<string>; label: string }) {
  const invalid = list.filter((value) => !validSet.has(value));
  if (invalid.length) {
    throw new Error(`Invalid ${LOCAL_OVERRIDE_FILE}: ${label} contains unknown value(s): ${invalid.join(', ')}`);
  }
}

function mergeWorkspaceOverrides(
  base?: WorkspaceOverrideConfig,
  workspace?: WorkspaceOverrideConfig
): WorkspaceOverrideConfig {
  return {
    targets: mergeListOverrideScope(base?.targets, workspace?.targets),
    modules: mergeListOverrideScope(base?.modules, workspace?.modules),
    slots: {
      ...(base?.slots || {}),
      ...(workspace?.slots || {})
    }
  };
}

function mergeListOverrideScope(base?: ListOverrideScope, workspace?: ListOverrideScope): ListOverrideScope {
  return {
    set: workspace?.set ?? base?.set,
    add: uniqueList([...(base?.add || []), ...(workspace?.add || [])]),
    remove: uniqueList([...(base?.remove || []), ...(workspace?.remove || [])])
  };
}

function applyListOverride({
  values,
  scope,
  validSet,
  label
}: {
  values: string[];
  scope?: ListOverrideScope;
  validSet?: Set<string>;
  label: string;
}): { values: string[]; warnings: string[] } {
  const warnings: string[] = [];
  let out = uniqueList(values || []);
  if (!scope) return { values: out, warnings };
  const normalize = (input: string[] | undefined, source: string): string[] => uniqueList(input || []);

  if (scope.set && scope.set.length) {
    const setValues = normalize(scope.set, `${label}.set`);
    if (validSet) ensureValidItems({ list: setValues, validSet, label: `${label}.set` });
    out = setValues;
  }

  const addValues = normalize(scope.add, `${label}.add`);
  if (validSet) ensureValidItems({ list: addValues, validSet, label: `${label}.add` });
  for (const item of addValues) {
    if (!out.includes(item)) out.push(item);
  }

  const removeValues = normalize(scope.remove, `${label}.remove`);
  if (validSet) ensureValidItems({ list: removeValues, validSet, label: `${label}.remove` });
  const removed = new Set(removeValues);
  if (removed.size) {
    out = out.filter((value) => !removed.has(value));
  }

  return { values: out, warnings };
}

function applySlotOverrides({
  registry,
  language,
  modules,
  slots
}: {
  registry: Registry;
  language: string;
  modules: string[];
  slots: Record<string, SlotOverrideRule>;
}): { modules: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const lang = registry.languages[language];
  if (!lang) return { modules, warnings };

  const out = uniqueList(modules || []);
  const knownSlots = new Set(registry.slots || []);

  const moduleSlot = (moduleId: string): string | null => {
    const slot = lang.modules[moduleId]?.slot;
    return canonicalSlot(registry, slot);
  };

  const findBySlot = (slot: string): number => out.findIndex((moduleId) => moduleSlot(moduleId) === slot);

  for (const [rawSlot, rule] of Object.entries(slots || {})) {
    const slot = canonicalSlot(registry, rawSlot);
    if (!slot || !knownSlots.has(slot)) {
      throw new Error(`Invalid ${LOCAL_OVERRIDE_FILE}: slots.${rawSlot} references unknown slot`);
    }

    if (rule.remove) {
      const idx = findBySlot(slot);
      if (idx >= 0) out.splice(idx, 1);
    }

    if (rule.set) {
      const moduleId = rule.set;
      const def = lang.modules[moduleId];
      if (!def) {
        throw new Error(`Invalid ${LOCAL_OVERRIDE_FILE}: slots.${slot}.set references unknown module '${moduleId}'`);
      }
      const moduleCanonicalSlot = canonicalSlot(registry, def.slot);
      if (moduleCanonicalSlot !== slot) {
        throw new Error(
          `Invalid ${LOCAL_OVERRIDE_FILE}: slots.${slot}.set module '${moduleId}' belongs to '${moduleCanonicalSlot || '(none)'}'`
        );
      }

      const idx = findBySlot(slot);
      if (idx >= 0) out[idx] = moduleId;
      else out.push(moduleId);
    }
  }

  return { modules: uniqueList(out), warnings };
}

async function resolveExtendsBase({
  workspaceDir,
  rootDir,
  rootConfig,
  registry
}: {
  workspaceDir: string;
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
}): Promise<WorkspaceConfig> {
  const raw = await readJson<WorkspaceConfig>(path.join(workspaceDir, CONFIG_FILE));
  if (path.resolve(workspaceDir) === path.resolve(rootDir)) {
    return normalizeRootConfig(rootConfig, registry);
  }

  if (raw.extends) {
    const seen = new Set([path.resolve(path.join(workspaceDir, CONFIG_FILE))]);
    const resolved = await resolveConfigByExtends(path.resolve(workspaceDir), raw.extends, seen);
    return normalizeRootConfig(resolved, registry);
  }

  return normalizeRootConfig(rootConfig, registry);
}

async function resolveConfigByExtends(
  workspaceDir: string,
  extendsValue: string,
  seen: Set<string>
): Promise<WorkspaceConfig> {
  const targetPath = extendsValue.endsWith('.json')
    ? path.resolve(workspaceDir, extendsValue)
    : path.join(path.resolve(workspaceDir, extendsValue), CONFIG_FILE);
  const absTarget = path.resolve(targetPath);
  ensure(await exists(absTarget), `Invalid extends path: ${extendsValue}`);
  if (seen.has(absTarget)) throw new Error('Circular extends detected');
  seen.add(absTarget);

  const raw = await readJson<WorkspaceConfig>(absTarget);
  if (!raw.extends) return raw;
  return resolveConfigByExtends(path.dirname(absTarget), raw.extends, seen);
}

function normalizeRootConfig(rootConfig: WorkspaceConfig, registry: Registry): WorkspaceConfig {
  return {
    $schema: rootConfig.$schema || 'https://ailib.dev/schema/config.schema.json',
    registry_ref: rootConfig.registry_ref || registry.version,
    on_conflict: rootConfig.on_conflict || 'merge',
    language: rootConfig.language,
    modules: rootConfig.modules || [],
    targets: rootConfig.targets || Object.keys(registry.targets),
    docs_path: rootConfig.docs_path || 'docs/',
    workspaces: rootConfig.workspaces
  };
}

function mergeModules({
  registry,
  language,
  parentModules,
  localModules
}: {
  registry: Registry;
  language: string;
  parentModules: string[];
  localModules: string[];
}): {
  modules: string[];
  inheritedModules: string[];
  localModules: string[];
  warnings: string[];
} {
  const lang = registry.languages[language];
  const result: string[] = [];
  const owners: Array<'inherited' | 'local'> = [];
  const warnings: string[] = [];

  for (const mod of uniqueList(parentModules)) {
    if (!lang.modules[mod]) continue;
    result.push(mod);
    owners.push('inherited');
  }

  for (const mod of uniqueList(localModules)) {
    const localDef = lang.modules[mod];
    if (!localDef) {
      result.push(mod);
      owners.push('local');
      continue;
    }

    const existingIdx = result.indexOf(mod);
    if (existingIdx >= 0) {
      continue;
    }

    const localSlot = canonicalSlot(registry, localDef.slot);
    if (localSlot) {
      const slotIdx = result.findIndex((existingMod) => {
        const def = lang.modules[existingMod];
        const existingSlot = canonicalSlot(registry, def?.slot);
        return existingSlot && existingSlot === localSlot;
      });

      if (slotIdx >= 0) {
        warnings.push(`Slot override '${localSlot}': ${result[slotIdx]} -> ${mod}`);
        result[slotIdx] = mod;
        owners[slotIdx] = 'local';
        continue;
      }
    }

    result.push(mod);
    owners.push('local');
  }

  const inheritedModules: string[] = [];
  const localOut: string[] = [];
  for (let i = 0; i < result.length; i += 1) {
    if (owners[i] === 'inherited') inheritedModules.push(result[i]);
    else localOut.push(result[i]);
  }

  return {
    modules: result,
    inheritedModules,
    localModules: localOut,
    warnings
  };
}

function mergeTargets({
  parentTargets,
  localTargets,
  targetsRemoved
}: {
  parentTargets: string[];
  localTargets: string[];
  targetsRemoved: string[];
}) {
  const parent = uniqueList(parentTargets || []);
  const removed = new Set(targetsRemoved || []);
  const local = uniqueList(localTargets || []);
  const merged = new Set(parent);
  for (const target of local) merged.add(target);
  for (const rem of removed) merged.delete(rem);
  return [...merged];
}

function diffSlots(rootModules: string[], workspaceModules: string[], registry: Registry, language: string) {
  const lang = registry.languages[language];
  if (!lang) return [];

  const slotOf = (mod) => canonicalSlot(registry, lang.modules[mod]?.slot);
  const rootBySlot = new Map();
  const wsBySlot = new Map();

  for (const mod of rootModules) {
    const slot = slotOf(mod);
    if (slot) rootBySlot.set(slot, mod);
  }
  for (const mod of workspaceModules) {
    const slot = slotOf(mod);
    if (slot) wsBySlot.set(slot, mod);
  }

  const diffs = [];
  for (const [slot, rootMod] of rootBySlot.entries()) {
    const wsMod = wsBySlot.get(slot);
    if (wsMod && wsMod !== rootMod) {
      diffs.push(`slot '${slot}' differs from root (${rootMod} -> ${wsMod})`);
    }
  }
  return diffs;
}

function validateModuleSelection({
  registry,
  language,
  modules
}: {
  registry: Registry;
  language: string;
  modules: string[];
}) {
  const lang = registry.languages[language];
  ensure(lang, `Unsupported language: ${language}`);

  const slotMap = new Map();
  const validSlots = new Set(registry.slots || []);
  for (const moduleId of modules) {
    const moduleDef = lang.modules[moduleId];
    ensure(moduleDef, `Unsupported module for ${language}: ${moduleId}`);

    const slot = canonicalSlot(registry, moduleDef.slot);
    if (slot) {
      ensure(validSlots.has(slot), `Unknown slot '${slot}' for module '${moduleId}'`);
      const existing = slotMap.get(slot);
      ensure(!existing, `Slot conflict '${slot}': ${existing} vs ${moduleId}`);
      slotMap.set(slot, moduleId);
    }
  }

  for (const moduleId of modules) {
    const conflicts = new Set(lang.modules[moduleId].conflicts_with || []);
    for (const other of modules) {
      if (other !== moduleId && conflicts.has(other)) {
        throw new Error(`Module conflict: ${moduleId} conflicts with ${other}`);
      }
    }
  }
}

async function writeRootLock({
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
    workspaces: {}
  };

  for (const [workspaceDir, state] of allStates.entries()) {
    const relWorkspace = workspaceLabelFor(rootDir, workspaceDir);
    const files = {};

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

  await fs.writeFile(path.join(rootDir, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

async function listWorkspaceDirs({
  rootDir,
  rootConfig,
  workspaceOverride
}: {
  rootDir: string;
  rootConfig: WorkspaceConfig;
  workspaceOverride?: string;
}) {
  if (workspaceOverride) {
    const abs = resolveWorkspacePath(rootDir, workspaceOverride);
    ensure(await exists(path.join(abs, CONFIG_FILE)), `Workspace has no ${CONFIG_FILE}: ${workspaceOverride}`);
    return [abs];
  }

  const dirs = [path.resolve(rootDir)];
  const discovered = await discoverServiceWorkspaces({ rootDir, rootConfig });
  for (const dir of discovered) {
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

async function discoverServiceWorkspaces({ rootDir, rootConfig }: { rootDir: string; rootConfig: WorkspaceConfig }) {
  const hasPatterns = Array.isArray(rootConfig.workspaces) && rootConfig.workspaces.length > 0;
  const allConfigs = await walkForWorkspaceConfigs({
    rootDir,
    maxDepth: hasPatterns ? GLOB_DISCOVERY_MAX_DEPTH : AUTO_DISCOVERY_MAX_DEPTH,
    applyGitignore: !hasPatterns
  });
  const out = [];

  for (const dir of allConfigs) {
    if (path.resolve(dir) === path.resolve(rootDir)) continue;
    if (!hasPatterns) {
      out.push(dir);
      continue;
    }

    const rel = toPosix(path.relative(rootDir, dir));
    if (rootConfig.workspaces.some((pattern) => globMatch(rel, pattern))) {
      out.push(dir);
    }
  }

  out.sort();
  return out;
}

async function walkForWorkspaceConfigs({
  rootDir,
  maxDepth,
  applyGitignore
}: {
  rootDir: string;
  maxDepth: number;
  applyGitignore: boolean;
}) {
  const matches = [];
  const ignoreMatchers = applyGitignore ? await loadGitignoreMatchers(rootDir) : [];

  async function walk(currentDir, depth) {
    if (depth > maxDepth) return;

    const relDir = toPosix(path.relative(rootDir, currentDir));
    const base = path.basename(currentDir);
    if (SKIP_DIRS.has(base)) return;
    if (relDir && ignoreMatchers.some((m) => m(relDir, base))) return;

    if (await exists(path.join(currentDir, CONFIG_FILE))) matches.push(path.resolve(currentDir));

    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory()) return;
        const child = path.join(currentDir, entry.name);
        try {
          const stat = await fs.lstat(child);
          if (stat.isSymbolicLink()) return;
        } catch {
          return;
        }
        await walk(child, depth + 1);
      })
    );
  }

  await walk(path.resolve(rootDir), 0);
  return matches;
}

async function loadGitignoreMatchers(rootDir: string) {
  const ignorePath = path.join(rootDir, '.gitignore');
  if (!(await exists(ignorePath))) return [];
  const raw = await fs.readFile(ignorePath, 'utf8');
  const patterns = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'));

  return patterns.map((pattern) => {
    const normalized = toPosix(pattern.replace(/\/$/u, ''));
    return (relPath, baseName) => {
      if (normalized.includes('/')) {
        return globMatch(relPath, normalized) || relPath.startsWith(`${normalized}/`);
      }
      if (normalized.includes('*')) {
        return globMatch(baseName, normalized);
      }
      return baseName === normalized;
    };
  });
}

function globMatch(relPath, pattern) {
  const regex = globToRegex(pattern);
  return regex.test(toPosix(relPath));
}

function globToRegex(pattern) {
  const normalized = toPosix(pattern);
  let out = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const c = normalized[i];
    if (c === '*') {
      if (normalized[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if ('\\^$+?.()|{}[]'.includes(c)) out += `\\${c}`;
    else out += c;
  }
  out += '$';
  return new RegExp(out);
}

async function resolveContext(cwd: string): Promise<{ rootDir: string; workspaceDir: string }> {
  const workspaceDir = await findNearestWorkspace(path.resolve(cwd));
  if (!workspaceDir) {
    const rootDir = await detectProjectRoot(cwd);
    return { rootDir, workspaceDir: rootDir };
  }

  const rootDir = (await findNearestMonorepoRoot(path.resolve(cwd))) || workspaceDir;
  return { rootDir, workspaceDir };
}

async function findNearestWorkspace(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    if (await exists(path.join(current, CONFIG_FILE))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function findNearestMonorepoRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  let found = null;
  while (true) {
    const cfgPath = path.join(current, CONFIG_FILE);
    if (await exists(cfgPath)) {
      const cfg = await readJson<WorkspaceConfig>(cfgPath);
      if (cfg.workspaces) found = current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return found;
}

function resolveDefaultWorkspaceForMutation(
  context: { rootDir: string; workspaceDir: string },
  workspaceFlag?: string
) {
  if (workspaceFlag) return resolveWorkspacePath(context.rootDir, workspaceFlag);
  if (path.resolve(context.workspaceDir) !== path.resolve(context.rootDir)) return context.workspaceDir;
  return context.rootDir;
}

function resolveWorkspacePath(rootDir: string, value: string) {
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value);
  return resolved;
}

function isRootWorkspaceConfig(config: WorkspaceConfig | null | undefined) {
  return Boolean(config?.workspaces);
}

function workspaceLabelFor(rootDir: string, workspaceDir: string) {
  const rel = toPosix(path.relative(rootDir, workspaceDir));
  return rel || '.';
}

function relativePathForPointers(fromDir: string, toDir: string) {
  const rel = toPosix(path.relative(fromDir, toDir));
  return rel || '.';
}

async function writeManagedFile({
  outPath,
  rendered,
  onConflict
}: {
  outPath: string;
  rendered: string;
  onConflict: string;
}) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  if (await exists(outPath)) {
    if (onConflict === 'skip') return;
    if (onConflict === 'abort') {
      throw new Error(`Conflict detected for ${outPath}; rerun with --on-conflict=overwrite|merge|skip`);
    }
    if (onConflict === 'merge') {
      const existing = await fs.readFile(outPath, 'utf8');
      const withoutOld = existing.includes(AILIB_BLOCK_START)
        ? `${existing.slice(0, existing.indexOf(AILIB_BLOCK_START)).trimEnd()}\n`
        : `${existing.trimEnd()}\n`;
      const merged = `${withoutOld}\n${AILIB_BLOCK_START}\n${rendered.trim()}\n${AILIB_BLOCK_END}\n`;
      await fs.copyFile(outPath, `${outPath}.bak`);
      await fs.writeFile(outPath, merged, 'utf8');
      return;
    }
    await fs.copyFile(outPath, `${outPath}.bak`);
  }

  await fs.writeFile(outPath, `${rendered.trim()}\n`, 'utf8');
}

async function copySourceFile({
  packageRoot,
  sourceRel,
  target
}: {
  packageRoot: string;
  sourceRel: string;
  target: string;
}) {
  const source = path.join(packageRoot, sourceRel);
  ensure(await exists(source), `Missing module source: ${sourceRel}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

function parseFrontmatter(markdown: string): Record<string, string | string[]> | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) return null;
  const fields: Record<string, string | string[]> = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value: string | string[] = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    fields[key] = value;
  }
  return fields;
}

async function detectProjectRoot(startDir: string): Promise<string> {
  let current = path.resolve(startDir);
  while (true) {
    if (
      (await exists(path.join(current, '.git'))) ||
      (await exists(path.join(current, 'package.json'))) ||
      (await exists(path.join(current, 'pyproject.toml')))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Could not detect project root');
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeForFilename(input: string) {
  return toPosix(input).replaceAll('/', '__').replaceAll(':', '_');
}

function toPosix(value: string) {
  return value.split(path.sep).join('/');
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function rmIfExists(filePath: string) {
  if (!(await exists(filePath))) return;
  await fs.rm(filePath, { recursive: true, force: true });
}

async function readJson<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function splitCsv(value: string | boolean | string[] | undefined) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function uniqueList(items: string[]) {
  return [...new Set(items)];
}

function canonicalSlot(registry: Registry, slot: string | undefined) {
  if (!slot) return null;
  const aliases = registry.slot_aliases || {};
  const resolved = aliases[slot] || slot;
  if (resolved !== slot && !WARNED_SLOT_ALIASES.has(slot)) {
    const aliasMeta = registry.slot_alias_meta?.[slot];
    const removeIn = aliasMeta?.remove_in ? ` and is planned for removal in ${aliasMeta.remove_in}` : '';
    process.stderr.write(`warning: slot alias '${slot}' is deprecated; use '${resolved}'${removeIn}\n`);
    WARNED_SLOT_ALIASES.add(slot);
  }
  return resolved;
}

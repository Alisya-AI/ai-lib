import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const AILIB_BLOCK_START = '<!-- ailib:start -->';
const AILIB_BLOCK_END = '<!-- ailib:end -->';
const CONFIG_FILE = 'ailib.config.json';
const LOCK_FILE = 'ailib.lock';
const AUTO_DISCOVERY_MAX_DEPTH = 4;
const GLOB_DISCOVERY_MAX_DEPTH = 32;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.venv']);

export async function run(argv, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const packageRoot = options.packageRoot ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const flags = parseFlags(rest);
  switch (command) {
    case 'init':
      await initCommand({ cwd, packageRoot, flags });
      break;
    case 'update':
      await updateCommand({ cwd, packageRoot, flags });
      break;
    case 'add':
      await addCommand({ cwd, packageRoot, flags, moduleId: flags._[0] });
      break;
    case 'remove':
      await removeCommand({ cwd, packageRoot, flags, moduleId: flags._[0] });
      break;
    case 'doctor':
      await doctorCommand({ cwd, packageRoot, flags });
      break;
    case 'uninstall':
      await uninstallCommand({ cwd, packageRoot, flags });
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp() {
  process.stdout.write(
    'ailib commands:\n' +
    '  ailib init [--language=<lang>] [--targets=a,b] [--modules=m1,m2] [--workspaces=a/*,b/*] [--bare] [--no-inherit] [--on-conflict=overwrite|merge|skip|abort]\n' +
    '  ailib update [--workspace=<path>]\n' +
    '  ailib add <module> [--workspace=<path>]\n' +
    '  ailib remove <module> [--workspace=<path>]\n' +
    '  ailib doctor [--workspace=<path>]\n' +
    '  ailib uninstall [--all]\n'
  );
}

function parseFlags(args) {
  const flags = { _: [] };
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      flags._.push(arg);
      continue;
    }
    const eqIndex = arg.indexOf('=');
    if (eqIndex < 0) {
      flags[arg.slice(2)] = true;
      continue;
    }
    const k = arg.slice(2, eqIndex);
    const raw = arg.slice(eqIndex + 1);
    if (raw === 'true') flags[k] = true;
    else if (raw === 'false') flags[k] = false;
    else flags[k] = raw;
  }
  return flags;
}

async function initCommand({ cwd, packageRoot, flags }) {
  const registry = await readJson(path.join(packageRoot, 'registry.json'));
  const nearestRoot = await findNearestMonorepoRoot(path.resolve(cwd));
  const inServiceContext = Boolean(nearestRoot && path.resolve(cwd) !== nearestRoot);

  const language = flags.language || Object.keys(registry.languages)[0];
  ensure(registry.languages[language], `Unsupported language: ${language}`);

  const modules = uniqueList(splitCsv(flags.modules));
  const targets = uniqueList(splitCsv(flags.targets).length ? splitCsv(flags.targets) : Object.keys(registry.targets));
  const onConflict = flags['on-conflict'] || 'merge';

  validateModuleSelection({ registry, language, modules });

  if (inServiceContext && flags['no-inherit'] !== true) {
    const projectRoot = path.resolve(cwd);
    const rel = toPosix(path.relative(projectRoot, path.join(nearestRoot, CONFIG_FILE)));
    const config = {
      $schema: 'https://ailib.dev/schema/config.schema.json',
      extends: rel,
      language,
      modules,
      docs_path: './docs/'
    };
    if (targets.length) config.targets = targets;

    await fs.writeFile(path.join(projectRoot, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await applyWorkspaceUpdate({ packageRoot, rootDir: nearestRoot, workspaceOverride: projectRoot, forceOnConflict: onConflict });
    process.stdout.write('ailib initialized\n');
    return;
  }

  const projectRoot = await detectProjectRoot(cwd);
  const config = {
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

async function updateCommand({ cwd, packageRoot, flags }) {
  const context = await resolveContext(cwd);
  const workspaceOverride = flags.workspace ? resolveWorkspacePath(context.rootDir, flags.workspace) : undefined;
  await applyWorkspaceUpdate({ packageRoot, rootDir: context.rootDir, workspaceOverride, forceOnConflict: 'overwrite' });
  process.stdout.write('ailib updated\n');
}

async function addCommand({ cwd, packageRoot, flags, moduleId }) {
  ensure(moduleId, 'Usage: ailib add <module>');
  const context = await resolveContext(cwd);
  const registry = await readJson(path.join(packageRoot, 'registry.json'));

  const targetWorkspace = resolveDefaultWorkspaceForMutation(context, flags.workspace);
  const configPath = path.join(targetWorkspace, CONFIG_FILE);
  ensure(await exists(configPath), `Missing ${CONFIG_FILE} in workspace: ${targetWorkspace}`);

  const config = await readJson(configPath);
  const effective = await getEffectiveWorkspaceConfig({
    workspaceDir: targetWorkspace,
    rootDir: context.rootDir,
    rootConfig: await readJson(path.join(context.rootDir, CONFIG_FILE)),
    registry
  });
  validateModuleSelection({ registry, language: effective.language, modules: uniqueList([...(config.modules || []), moduleId]) });

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

async function removeCommand({ cwd, packageRoot, flags, moduleId }) {
  ensure(moduleId, 'Usage: ailib remove <module>');
  const context = await resolveContext(cwd);
  const targetWorkspace = resolveDefaultWorkspaceForMutation(context, flags.workspace);

  const configPath = path.join(targetWorkspace, CONFIG_FILE);
  ensure(await exists(configPath), `Missing ${CONFIG_FILE} in workspace: ${targetWorkspace}`);
  const config = await readJson(configPath);
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

async function doctorCommand({ cwd, packageRoot, flags }) {
  const context = await resolveContext(cwd);
  const registry = await readJson(path.join(packageRoot, 'registry.json'));
  const rootConfig = await readJson(path.join(context.rootDir, CONFIG_FILE));
  const workspaceDirs = await listWorkspaceDirs({ rootDir: context.rootDir, rootConfig, workspaceOverride: flags.workspace });

  const errors = [];
  const warnings = [];

  const rootEffective = await getEffectiveWorkspaceConfig({ workspaceDir: context.rootDir, rootDir: context.rootDir, rootConfig, registry });
  for (const workspaceDir of workspaceDirs) {
    const workspaceLabel = workspaceLabelFor(context.rootDir, workspaceDir);
    const configPath = path.join(workspaceDir, CONFIG_FILE);
    if (!(await exists(configPath))) {
      errors.push(`[${workspaceLabel}] Missing ${CONFIG_FILE}`);
      continue;
    }

    let state;
    try {
      state = await buildWorkspaceState({ workspaceDir, rootDir: context.rootDir, rootConfig, registry });
    } catch (err) {
      errors.push(`[${workspaceLabel}] ${err.message}`);
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

async function uninstallCommand({ cwd, packageRoot, flags }) {
  const context = await resolveContext(cwd);
  const registry = await readJson(path.join(packageRoot, 'registry.json'));

  const rootConfigPath = path.join(context.rootDir, CONFIG_FILE);
  const rootConfig = (await exists(rootConfigPath)) ? await readJson(rootConfigPath) : null;
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
      const cfg = (await exists(cfgPath)) ? await readJson(cfgPath) : rootConfig;
      await uninstallWorkspace(workspaceDir, cfg, registry);
    }
    await rmIfExists(path.join(context.rootDir, LOCK_FILE));
    process.stdout.write('ailib uninstalled\n');
    return;
  }

  const targetDir = context.workspaceDir;
  const cfgPath = path.join(targetDir, CONFIG_FILE);
  const cfg = (await exists(cfgPath)) ? await readJson(cfgPath) : null;
  await uninstallWorkspace(targetDir, cfg, registry);

  if (path.resolve(targetDir) === path.resolve(context.rootDir)) {
    await rmIfExists(path.join(context.rootDir, LOCK_FILE));
  } else if (await exists(rootConfigPath)) {
    await applyWorkspaceUpdate({ packageRoot, rootDir: context.rootDir, forceOnConflict: 'overwrite' });
  }

  process.stdout.write('ailib uninstalled\n');
}

async function uninstallWorkspace(workspaceDir, config, registry) {
  await rmIfExists(path.join(workspaceDir, '.ailib'));
  await rmIfExists(path.join(workspaceDir, CONFIG_FILE));
  if (config?.targets) {
    for (const target of config.targets) {
      const targetDef = registry.targets[target];
      if (!targetDef) continue;
      await rmIfExists(path.join(workspaceDir, targetDef.output));
      if (targetDef.root_output && isRootWorkspaceConfig(config)) await rmIfExists(path.join(workspaceDir, targetDef.root_output));
      if (target === 'copilot' && isRootWorkspaceConfig(config)) {
        await rmIfExists(path.join(workspaceDir, '.github/instructions'));
      }
    }
  }
}

async function applyWorkspaceUpdate({ packageRoot, rootDir, workspaceOverride, forceOnConflict }) {
  const rootConfigPath = path.join(rootDir, CONFIG_FILE);
  ensure(await exists(rootConfigPath), `Missing ${CONFIG_FILE} at root: ${rootDir}`);

  const registry = await readJson(path.join(packageRoot, 'registry.json'));
  const packageJson = await readJson(path.join(packageRoot, 'package.json'));
  const rootConfig = await readJson(rootConfigPath);

  const workspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig, workspaceOverride });
  const allWorkspaceDirs = await listWorkspaceDirs({ rootDir, rootConfig });

  const stateMap = new Map();
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

  await writeRootLock({ rootDir, packageRoot, packageVersion: packageJson.version, registryRef: rootConfig.registry_ref || registry.version, allStates: stateMap });
}

async function ensureWorkspaceAssets({ workspaceDir, packageRoot, state, rootDir }) {
  const outRoot = path.join(workspaceDir, '.ailib');
  await fs.mkdir(path.join(outRoot, 'modules'), { recursive: true });

  if (path.resolve(workspaceDir) === path.resolve(rootDir)) {
    await copySourceFile({ packageRoot, sourceRel: 'core/behavior.md', target: path.join(outRoot, 'behavior.md') });
  }

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

async function generateWorkspaceRouters({ workspaceDir, rootDir, state, onConflict, allStates, registry }) {
  const targetSet = new Set(state.effective.targets || []);
  const atRoot = path.resolve(workspaceDir) === path.resolve(rootDir);

  for (const targetId of targetSet) {
    const targetDef = registry.targets[targetId];
    if (!targetDef || targetDef.mode === 'copilot') continue;

    const label = targetDef.display || targetId;
    const frontmatter = targetDef.frontmatter
      ? (atRoot ? targetDef.frontmatter.root : targetDef.frontmatter.workspace)
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
      await writeManagedFile({ outPath: path.join(rootDir, '.github/instructions', fileName), rendered: content, onConflict });
    }
  }
}

function renderRouterDoc({ label, workspaceDir, rootDir, state }) {
  const relToRoot = relativePathForPointers(workspaceDir, rootDir);
  const behaviorRef = path.resolve(workspaceDir) === path.resolve(rootDir)
    ? '@.ailib/behavior.md'
    : `@${toPosix(path.join(relToRoot, '.ailib/behavior.md'))}`;

  const inheritedModuleLines = state.inheritedModules.map((mod) => {
    const modPath = `@${toPosix(path.join(relToRoot, '.ailib/modules', `${mod}.md`))}`;
    return `- ${modPath}`;
  });

  const localModuleLines = state.localModules.map((mod) => `- @.ailib/modules/${mod}.md`);
  const moduleLines = [...inheritedModuleLines, ...localModuleLines];
  const docsBlock = path.resolve(workspaceDir) === path.resolve(rootDir)
    ? '# PROJECT-SPECIFIC CONTEXT\nPrioritize project context in @./docs/.\n'
    : `# PROJECT-SPECIFIC CONTEXT\nPrioritize service-local business logic in @./docs/.\nFor cross-service context, consult @${toPosix(path.join(relToRoot, 'docs/'))}.\nIf guidance conflicts, service-local docs win for service-scoped work.\n`;

  const modulesText = moduleLines.length ? moduleLines.join('\n') : '- (none)';
  return `# ailib Router (${label})\n\n# AILIB SYSTEM PROMPT\nAct as the AI Agent defined in ${behaviorRef}.\nAdhere to the coding standards in @.ailib/standards.md.\n\n# MODULES & EXTENSIONS\n${modulesText}\n\n${docsBlock}`;
}

async function buildWorkspaceState({ workspaceDir, rootDir, rootConfig, registry }) {
  const effective = await getEffectiveWorkspaceConfig({ workspaceDir, rootDir, rootConfig, registry });
  validateModuleSelection({ registry, language: effective.language, modules: effective.modules });

  const requiredFiles = [
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

async function getEffectiveWorkspaceConfig({ workspaceDir, rootDir, rootConfig, registry }) {
  const workspaceRaw = await readJson(path.join(workspaceDir, CONFIG_FILE));
  const isRootWorkspace = path.resolve(workspaceDir) === path.resolve(rootDir);

  const base = await resolveExtendsBase({ workspaceDir, rootDir, rootConfig, registry });
  const language = workspaceRaw.language || base.language;
  ensure(language, `Missing language in ${CONFIG_FILE}: ${workspaceDir}`);
  ensure(registry.languages[language], `Unsupported language: ${language}`);

  const mergedModules = mergeModules({
    registry,
    language,
    parentModules: isRootWorkspace ? [] : (base.modules || []),
    localModules: workspaceRaw.modules || (isRootWorkspace ? (base.modules || []) : [])
  });

  const targets = mergeTargets({
    parentTargets: base.targets || [],
    localTargets: workspaceRaw.targets || [],
    targetsRemoved: workspaceRaw.targets_removed || []
  });

  return {
    $schema: workspaceRaw.$schema || base.$schema || 'https://ailib.dev/schema/config.schema.json',
    registry_ref: workspaceRaw.registry_ref || base.registry_ref,
    on_conflict: workspaceRaw.on_conflict || base.on_conflict || 'merge',
    language,
    modules: mergedModules.modules,
    targets,
    docs_path: workspaceRaw.docs_path || (path.resolve(workspaceDir) === path.resolve(rootDir) ? 'docs/' : './docs/'),
    inheritedModules: mergedModules.inheritedModules,
    localModules: mergedModules.localModules,
    warnings: mergedModules.warnings
  };
}

async function resolveExtendsBase({ workspaceDir, rootDir, rootConfig, registry }) {
  const raw = await readJson(path.join(workspaceDir, CONFIG_FILE));
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

async function resolveConfigByExtends(workspaceDir, extendsValue, seen) {
  const targetPath = extendsValue.endsWith('.json')
    ? path.resolve(workspaceDir, extendsValue)
    : path.join(path.resolve(workspaceDir, extendsValue), CONFIG_FILE);
  const absTarget = path.resolve(targetPath);
  ensure(await exists(absTarget), `Invalid extends path: ${extendsValue}`);
  if (seen.has(absTarget)) throw new Error('Circular extends detected');
  seen.add(absTarget);

  const raw = await readJson(absTarget);
  if (!raw.extends) return raw;
  return resolveConfigByExtends(path.dirname(absTarget), raw.extends, seen);
}

function normalizeRootConfig(rootConfig, registry) {
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

function mergeModules({ registry, language, parentModules, localModules }) {
  const lang = registry.languages[language];
  const result = [];
  const owners = [];
  const warnings = [];

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

  const inheritedModules = [];
  const localOut = [];
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

function mergeTargets({ parentTargets, localTargets, targetsRemoved }) {
  const parent = uniqueList(parentTargets || []);
  const removed = new Set(targetsRemoved || []);
  const local = uniqueList(localTargets || []);
  const merged = new Set(parent);
  for (const target of local) merged.add(target);
  for (const rem of removed) merged.delete(rem);
  return [...merged];
}

function diffSlots(rootModules, workspaceModules, registry, language) {
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

function validateModuleSelection({ registry, language, modules }) {
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

async function writeRootLock({ rootDir, packageRoot, packageVersion, registryRef, allStates }) {
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

async function listWorkspaceDirs({ rootDir, rootConfig, workspaceOverride }) {
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

async function discoverServiceWorkspaces({ rootDir, rootConfig }) {
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

async function walkForWorkspaceConfigs({ rootDir, maxDepth, applyGitignore }) {
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

    await Promise.all(entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      const child = path.join(currentDir, entry.name);
      try {
        const stat = await fs.lstat(child);
        if (stat.isSymbolicLink()) return;
      } catch {
        return;
      }
      await walk(child, depth + 1);
    }));
  }

  await walk(path.resolve(rootDir), 0);
  return matches;
}

async function loadGitignoreMatchers(rootDir) {
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
      if (normalized.includes('/')) return relPath === normalized || relPath.startsWith(`${normalized}/`);
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

async function resolveContext(cwd) {
  const workspaceDir = await findNearestWorkspace(path.resolve(cwd));
  if (!workspaceDir) {
    const rootDir = await detectProjectRoot(cwd);
    return { rootDir, workspaceDir: rootDir };
  }

  const rootDir = (await findNearestMonorepoRoot(path.resolve(cwd))) || workspaceDir;
  return { rootDir, workspaceDir };
}

async function findNearestWorkspace(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (await exists(path.join(current, CONFIG_FILE))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function findNearestMonorepoRoot(startDir) {
  let current = path.resolve(startDir);
  let found = null;
  while (true) {
    const cfgPath = path.join(current, CONFIG_FILE);
    if (await exists(cfgPath)) {
      const cfg = await readJson(cfgPath);
      if (cfg.workspaces) found = current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return found;
}

function resolveDefaultWorkspaceForMutation(context, workspaceFlag) {
  if (workspaceFlag) return resolveWorkspacePath(context.rootDir, workspaceFlag);
  if (path.resolve(context.workspaceDir) !== path.resolve(context.rootDir)) return context.workspaceDir;
  return context.rootDir;
}

function resolveWorkspacePath(rootDir, value) {
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value);
  return resolved;
}

function isRootWorkspaceConfig(config) {
  return Boolean(config?.workspaces);
}

function workspaceLabelFor(rootDir, workspaceDir) {
  const rel = toPosix(path.relative(rootDir, workspaceDir));
  return rel || '.';
}

function relativePathForPointers(fromDir, toDir) {
  const rel = toPosix(path.relative(fromDir, toDir));
  return rel || '.';
}

async function writeManagedFile({ outPath, rendered, onConflict }) {
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

async function copySourceFile({ packageRoot, sourceRel, target }) {
  const source = path.join(packageRoot, sourceRel);
  ensure(await exists(source), `Missing module source: ${sourceRel}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
    }
    fields[key] = value;
  }
  return fields;
}

async function detectProjectRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (
      await exists(path.join(current, '.git')) ||
      await exists(path.join(current, 'package.json')) ||
      await exists(path.join(current, 'pyproject.toml'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Could not detect project root');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeForFilename(input) {
  return toPosix(input).replaceAll('/', '__').replaceAll(':', '_');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

async function exists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function rmIfExists(filePath) {
  if (!(await exists(filePath))) return;
  await fs.rm(filePath, { recursive: true, force: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function splitCsv(value) {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function uniqueList(items) {
  return [...new Set(items)];
}

function canonicalSlot(registry, slot) {
  if (!slot) return null;
  const aliases = registry.slot_aliases || {};
  return aliases[slot] || slot;
}

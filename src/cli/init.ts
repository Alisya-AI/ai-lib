import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ensure } from './assertions.ts';
import { detectProjectRoot, findNearestMonorepoRoot } from './context-resolution.ts';
import { getStringFlag } from './flags.ts';
import { resolveGuidedInitSelections } from './init-guided.ts';
import { validateModuleSelection } from './module-validation.ts';
import { validateSkillSelection } from './skill-validation.ts';
import { bindRegistryCanonicalSlot } from './slot-resolver.ts';
import { exists, readJson, splitCsv, toPosix, uniqueList } from './utils.ts';
import type { CliFlags, Registry, WorkspaceConfig } from './types.ts';
import type { InitPromptIO } from './init-guided.ts';

export async function initCommand({
  cwd,
  packageRoot,
  flags,
  configFile,
  canonicalSlot,
  applyWorkspaceUpdate,
  promptIO
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
  promptIO?: InitPromptIO;
}) {
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const nearestRoot = await findNearestMonorepoRoot(path.resolve(cwd));
  const inServiceContext = Boolean(nearestRoot && path.resolve(cwd) !== nearestRoot);
  const projectRoot = inServiceContext ? path.resolve(cwd) : await detectProjectRoot(cwd);

  const requestedLanguage = getStringFlag(flags, 'language');
  const requestedModules = uniqueList(splitCsv(flags.modules));
  const requestedTargets = splitCsv(flags.targets);
  const requestedSkills = uniqueList(splitCsv(flags.skills));
  const hasSelectionFlags =
    requestedLanguage !== undefined ||
    flags.modules !== undefined ||
    flags.targets !== undefined ||
    flags.skills !== undefined;
  const defaultLanguage = requestedLanguage || Object.keys(registry.languages)[0];
  ensure(registry.languages[defaultLanguage], `Unsupported language: ${defaultLanguage}`);

  let language = defaultLanguage;
  let modules = requestedModules;
  let targets = uniqueList(requestedTargets.length ? requestedTargets : Object.keys(registry.targets));
  let skills = requestedSkills;
  let workspaceLanguageOverrides: Record<string, string> = {};

  if (!hasSelectionFlags) {
    const defaultWorkspacePatterns = flags.bare === true ? [] : splitCsv(flags.workspaces);
    const workspacePatterns =
      flags.bare === true ? [] : defaultWorkspacePatterns.length ? defaultWorkspacePatterns : ['apps/*', 'services/*'];
    const guidedPromptIO = promptIO || createDefaultPromptIO();
    const guided = await resolveGuidedInitSelections({
      registry,
      rootDir: projectRoot,
      configFile,
      bare: flags.bare === true,
      workspacePatterns,
      defaults: {
        language: defaultLanguage,
        modules: requestedModules,
        targets,
        skills
      },
      promptIO: guidedPromptIO
    });
    language = guided.language;
    modules = guided.modules;
    targets = guided.targets;
    skills = guided.skills;
    workspaceLanguageOverrides = guided.workspaceLanguageOverrides;
  }

  for (const target of targets) {
    ensure(registry.targets[target], `Unsupported target: ${target}`);
  }
  const onConflict = getStringFlag(flags, 'on-conflict') || 'merge';
  const canonicalSlotForRegistry = bindRegistryCanonicalSlot(registry, canonicalSlot);

  validateModuleSelection({
    registry,
    language,
    modules,
    canonicalSlot: canonicalSlotForRegistry
  });
  validateSkillSelection({
    registry,
    skills,
    language,
    modules,
    targets
  });

  if (inServiceContext && flags['no-inherit'] !== true) {
    ensure(nearestRoot, 'Could not resolve monorepo root for service initialization');
    const rel = toPosix(path.relative(projectRoot, path.join(nearestRoot, configFile)));
    const config: WorkspaceConfig = {
      $schema: 'https://ailib.dev/schema/config.schema.json',
      extends: rel,
      language,
      modules,
      docs_path: './docs/'
    };
    if (targets.length) config.targets = targets;
    if (skills.length) config.skills = skills;

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

  const config: WorkspaceConfig = {
    $schema: 'https://ailib.dev/schema/config.schema.json',
    registry_ref: registry.version,
    language,
    modules,
    targets,
    skills,
    docs_path: 'docs/',
    on_conflict: onConflict
  };

  const workspacePatterns = splitCsv(flags.workspaces);
  if (flags.bare !== true) {
    config.workspaces = workspacePatterns.length ? workspacePatterns : ['apps/*', 'services/*'];
  }

  await fs.writeFile(path.join(projectRoot, configFile), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await upsertWorkspaceLanguageOverrides({
    rootDir: projectRoot,
    configFile,
    defaultLanguage: language,
    workspaceLanguageOverrides
  });
  await applyWorkspaceUpdate({ packageRoot, rootDir: projectRoot, forceOnConflict: onConflict });
  process.stdout.write('ailib initialized\n');
}

function createDefaultPromptIO(): InitPromptIO {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return {
    ask: rl.question.bind(rl),
    write: process.stdout.write.bind(process.stdout),
    close: rl.close.bind(rl)
  };
}

export async function upsertWorkspaceLanguageOverrides({
  rootDir,
  configFile,
  defaultLanguage,
  workspaceLanguageOverrides
}: {
  rootDir: string;
  configFile: string;
  defaultLanguage: string;
  workspaceLanguageOverrides: Record<string, string>;
}) {
  for (const [workspaceRel, language] of Object.entries(workspaceLanguageOverrides)) {
    if (language === defaultLanguage) continue;
    const workspaceDir = path.resolve(rootDir, workspaceRel);
    await fs.mkdir(workspaceDir, { recursive: true });
    const configPath = path.join(workspaceDir, configFile);
    const extendsPath = toPosix(path.relative(workspaceDir, path.join(rootDir, configFile)));

    let config: WorkspaceConfig;
    if (await exists(configPath)) {
      config = (await readJson<WorkspaceConfig>(configPath)) || {};
    } else {
      config = { $schema: 'https://ailib.dev/schema/config.schema.json', docs_path: './docs/' };
    }
    config.extends = config.extends || extendsPath;
    config.language = language;
    if (!config.docs_path && !config.workspaces) config.docs_path = './docs/';

    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }
}

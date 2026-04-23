import path from 'node:path';
import { loadLocalOverrideConfig } from './local-override-config.ts';
import { applyListOverride, applySlotOverrides, mergeWorkspaceOverrides } from './local-overrides.ts';
import { mergeModules, mergeTargets } from './module-selection.ts';
import { validateModuleSelection } from './module-validation.ts';
import { readJson, toPosix } from './utils.ts';
import { resolveExtendsBase } from './workspace-config.ts';
import type { EffectiveWorkspaceConfig, Registry, WorkspaceConfig, WorkspaceState } from './types.ts';

export async function buildWorkspaceState({
  workspaceDir,
  rootDir,
  rootConfig,
  registry,
  canonicalSlot,
  configFile,
  localOverrideFile
}: {
  workspaceDir: string;
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
  canonicalSlot: (slot: string | undefined) => string | null;
  configFile: string;
  localOverrideFile: string;
}): Promise<WorkspaceState> {
  const effective = await getEffectiveWorkspaceConfig({
    workspaceDir,
    rootDir,
    rootConfig,
    registry,
    canonicalSlot,
    configFile,
    localOverrideFile
  });
  validateModuleSelection({
    registry,
    language: effective.language,
    modules: effective.modules,
    canonicalSlot
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

export async function getEffectiveWorkspaceConfig({
  workspaceDir,
  rootDir,
  rootConfig,
  registry,
  canonicalSlot,
  configFile,
  localOverrideFile
}: {
  workspaceDir: string;
  rootDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
  canonicalSlot: (slot: string | undefined) => string | null;
  configFile: string;
  localOverrideFile: string;
}): Promise<EffectiveWorkspaceConfig> {
  const workspaceRaw = await readJson<WorkspaceConfig>(path.join(workspaceDir, configFile));
  const isRootWorkspace = path.resolve(workspaceDir) === path.resolve(rootDir);

  const base = await resolveExtendsBase({ workspaceDir, rootDir, rootConfig, registry });
  const language = workspaceRaw.language || base.language;
  ensure(language, `Missing language in ${configFile}: ${workspaceDir}`);
  ensure(registry.languages[language], `Unsupported language: ${language}`);

  const mergedModules = mergeModules({
    registry,
    language,
    parentModules: isRootWorkspace ? [] : base.modules || [],
    localModules: workspaceRaw.modules || (isRootWorkspace ? base.modules || [] : []),
    canonicalSlot
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
    targets,
    canonicalSlot,
    localOverrideFile
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
    docs_path: workspaceRaw.docs_path || (isRootWorkspace ? 'docs/' : './docs/'),
    inheritedModules,
    localModules,
    warnings: [...mergedModules.warnings, ...overrideResult.warnings]
  };
}

export async function applyLocalOverrides({
  rootDir,
  workspaceDir,
  rootConfig,
  registry,
  language,
  modules,
  targets,
  canonicalSlot,
  localOverrideFile
}: {
  rootDir: string;
  workspaceDir: string;
  rootConfig: WorkspaceConfig;
  registry: Registry;
  language: string;
  modules: string[];
  targets: string[];
  canonicalSlot: (slot: string | undefined) => string | null;
  localOverrideFile: string;
}): Promise<{ modules: string[]; targets: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const config = await loadLocalOverrideConfig({
    rootDir,
    rootConfig,
    registry,
    canonicalSlot,
    localOverrideFile
  });
  if (!config) return { modules, targets, warnings };

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
    localOverrideFile
  });

  const moduleResult = applyListOverride({
    values: modules,
    scope: override.modules,
    validSet: validModules,
    label: 'modules',
    localOverrideFile
  });
  warnings.push(...moduleResult.warnings);

  const slotResult = applySlotOverrides({
    registry,
    language,
    modules: moduleResult.values,
    slots: override.slots || {},
    localOverrideFile,
    canonicalSlot
  });

  return {
    modules: slotResult.modules,
    targets: targetResult.values,
    warnings
  };
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

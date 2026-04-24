import path from 'node:path';
import { loadLocalOverrideConfig } from './local-override-config.ts';
import { applyListOverride, applySlotOverrides, mergeWorkspaceOverrides } from './local-overrides.ts';
import { mergeModules, mergeTargets } from './module-selection.ts';
import { validateModuleSelection } from './module-validation.ts';
import { validateSkillSelection } from './skill-validation.ts';
import { readJson, toPosix } from './utils.ts';
import { resolveExtendsBase } from './workspace-config.ts';
import {
  buildEffectiveWorkspaceConfig,
  resolveWorkspaceLanguage,
  splitListOwnership,
  splitModuleOwnership
} from './workspace-state-pipeline.ts';
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
  validateSkillSelection({
    registry,
    skills: effective.skills,
    language: effective.language,
    modules: effective.modules,
    targets: effective.targets
  });

  const requiredFiles = [
    '.ailib/development-standards.md',
    '.ailib/test-standards.md',
    '.ailib/standards.md',
    ...effective.localModules.map((m) => `.ailib/modules/${m}.md`),
    ...effective.localSkills.map((s) => `.ailib/skills/${s}.md`)
  ];
  if (path.resolve(workspaceDir) === path.resolve(rootDir)) requiredFiles.unshift('.ailib/behavior.md');

  return {
    effective,
    inheritedModules: effective.inheritedModules,
    localModules: effective.localModules,
    inheritedSkills: effective.inheritedSkills,
    localSkills: effective.localSkills,
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
  const language = resolveWorkspaceLanguage({
    workspaceRaw,
    base,
    registry,
    configFile,
    workspaceDir
  });

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
  const skills = mergeSelectedSkills({
    parentSkills: isRootWorkspace ? [] : base.skills || [],
    localSkills: workspaceRaw.skills || (isRootWorkspace ? base.skills || [] : [])
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
  const ownership = splitModuleOwnership({
    modules: overrideResult.modules,
    inheritedModules: mergedModules.inheritedModules || []
  });
  const skillOwnership = splitListOwnership({
    values: skills,
    inheritedValues: isRootWorkspace ? [] : base.skills || []
  });

  return buildEffectiveWorkspaceConfig({
    workspaceRaw,
    base,
    isRootWorkspace,
    language,
    modules: overrideResult.modules,
    targets: overrideResult.targets,
    skills,
    inheritedModules: ownership.inherited,
    localModules: ownership.local,
    inheritedSkills: skillOwnership.inherited,
    localSkills: skillOwnership.local,
    warnings: [...mergedModules.warnings, ...overrideResult.warnings]
  });
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

function mergeSelectedSkills({ parentSkills, localSkills }: { parentSkills: string[]; localSkills: string[] }) {
  const merged = new Set(parentSkills || []);
  for (const skill of localSkills || []) merged.add(skill);
  return [...merged];
}

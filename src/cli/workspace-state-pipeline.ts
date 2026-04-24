import type { EffectiveWorkspaceConfig, Registry, WorkspaceConfig } from './types.ts';

export function resolveWorkspaceLanguage({
  workspaceRaw,
  base,
  registry,
  configFile,
  workspaceDir
}: {
  workspaceRaw: WorkspaceConfig;
  base: WorkspaceConfig;
  registry: Registry;
  configFile: string;
  workspaceDir: string;
}) {
  const language = workspaceRaw.language || base.language;
  ensure(language, `Missing language in ${configFile}: ${workspaceDir}`);
  ensure(registry.languages[language], `Unsupported language: ${language}`);
  return language;
}

export function splitModuleOwnership({ modules, inheritedModules }: { modules: string[]; inheritedModules: string[] }) {
  return splitListOwnership({ values: modules, inheritedValues: inheritedModules });
}

export function buildEffectiveWorkspaceConfig({
  workspaceRaw,
  base,
  isRootWorkspace,
  language,
  modules,
  targets,
  skills,
  inheritedModules,
  localModules,
  inheritedSkills,
  localSkills,
  warnings
}: {
  workspaceRaw: WorkspaceConfig;
  base: WorkspaceConfig;
  isRootWorkspace: boolean;
  language: string;
  modules: string[];
  targets: string[];
  skills: string[];
  inheritedModules: string[];
  localModules: string[];
  inheritedSkills: string[];
  localSkills: string[];
  warnings: string[];
}): EffectiveWorkspaceConfig {
  return {
    $schema: workspaceRaw.$schema || base.$schema || 'https://ailib.dev/schema/config.schema.json',
    registry_ref: workspaceRaw.registry_ref || base.registry_ref,
    on_conflict: workspaceRaw.on_conflict || base.on_conflict || 'merge',
    language,
    modules,
    targets,
    skills,
    docs_path: workspaceRaw.docs_path || (isRootWorkspace ? 'docs/' : './docs/'),
    inheritedModules,
    localModules,
    inheritedSkills,
    localSkills,
    warnings
  };
}

export function splitListOwnership({ values, inheritedValues }: { values: string[]; inheritedValues: string[] }) {
  const inheritedSet = new Set(inheritedValues);
  const inherited = values.filter((value) => inheritedSet.has(value));
  const local = values.filter((value) => !inheritedSet.has(value));
  return { inherited, local };
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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
  const inheritedModuleSet = new Set(inheritedModules);
  const inherited = modules.filter((mod) => inheritedModuleSet.has(mod));
  const local = modules.filter((mod) => !inheritedModuleSet.has(mod));
  return { inherited, local };
}

export function buildEffectiveWorkspaceConfig({
  workspaceRaw,
  base,
  isRootWorkspace,
  language,
  modules,
  targets,
  inheritedModules,
  localModules,
  warnings
}: {
  workspaceRaw: WorkspaceConfig;
  base: WorkspaceConfig;
  isRootWorkspace: boolean;
  language: string;
  modules: string[];
  targets: string[];
  inheritedModules: string[];
  localModules: string[];
  warnings: string[];
}): EffectiveWorkspaceConfig {
  const skills = workspaceRaw.skills || base.skills || [];
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
    warnings
  };
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

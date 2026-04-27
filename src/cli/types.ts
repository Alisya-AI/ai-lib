export type CliFlags = { _: string[] } & Record<string, string | boolean | string[] | undefined>;

export interface RunOptions {
  cwd?: string;
  packageRoot?: string;
}

export interface ModuleDefinition {
  slot: string;
  requires?: string[];
  conflicts_with?: string[];
}

export interface LanguageDefinition {
  modules: Record<string, ModuleDefinition>;
}

export interface TargetDefinition {
  output: string;
  template?: string;
  root_output?: string;
  mode?: string;
  display?: string;
  skill_profile?: TargetSkillProfile;
  frontmatter?: {
    root?: string;
    workspace?: string;
  };
}

export interface TargetSkillProfile {
  format: 'cursor' | 'claude-code';
  required_sections?: string[];
  section_mapping?: Record<string, string>;
}

export interface SkillCompatibility {
  languages?: string[];
  modules?: string[];
  targets?: string[];
  llms?: string[];
}

export interface SkillDefinition {
  display: string;
  path: string;
  description?: string;
  skill_type?: string;
  requires?: string[];
  conflicts_with?: string[];
  compatible?: SkillCompatibility;
}

export interface SlotDefinition {
  kind?: 'exclusive' | 'composable';
  description?: string;
}

export interface SlotAliasMeta {
  replacement: string;
  deprecated_since?: string;
  remove_in?: string;
}

export interface Registry {
  version: string;
  slots?: string[];
  slot_defs?: Record<string, SlotDefinition>;
  slot_aliases?: Record<string, string>;
  slot_alias_meta?: Record<string, SlotAliasMeta>;
  languages: Record<string, LanguageDefinition>;
  targets: Record<string, TargetDefinition>;
  skills?: Record<string, SkillDefinition>;
}

export interface WorkspaceConfig {
  $schema?: string;
  extends?: string;
  registry_ref?: string;
  on_conflict?: string;
  language?: string;
  modules?: string[];
  targets?: string[];
  skills?: string[];
  targets_removed?: string[];
  docs_path?: string;
  workspaces?: string[];
}

export interface ListOverrideScope {
  add?: string[];
  remove?: string[];
  set?: string[];
}

export interface SlotOverrideRule {
  set?: string;
  remove?: boolean;
}

export interface WorkspaceOverrideConfig {
  targets?: ListOverrideScope;
  modules?: ListOverrideScope;
  skills?: ListOverrideScope;
  slots?: Record<string, SlotOverrideRule>;
}

export interface LocalOverrideConfig {
  version: string;
  default_override?: WorkspaceOverrideConfig;
  workspace_overrides?: Record<string, WorkspaceOverrideConfig>;
}

export interface EffectiveWorkspaceConfig extends WorkspaceConfig {
  language: string;
  modules: string[];
  targets: string[];
  skills: string[];
  docs_path: string;
  inheritedModules: string[];
  localModules: string[];
  inheritedSkills: string[];
  localSkills: string[];
  warnings: string[];
}

export interface WorkspaceState {
  effective: EffectiveWorkspaceConfig;
  inheritedModules: string[];
  localModules: string[];
  inheritedSkills: string[];
  localSkills: string[];
  requiredFiles: string[];
  warnings: string[];
}

export interface CommandContext {
  cwd: string;
  packageRoot: string;
  flags: CliFlags;
}

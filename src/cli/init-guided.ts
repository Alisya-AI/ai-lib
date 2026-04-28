import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { exists, toPosix, uniqueList } from './utils.ts';
import type { Registry, SkillDefinition } from './types.ts';

type Choice = {
  id: string;
  label: string;
  description?: string;
};

type GroupedChoice = {
  heading: string;
  choices: Choice[];
};

type PromptSession = {
  write: (line: string) => void;
  ask: (question: string) => Promise<string>;
  selectOne?: (args: { title: string; choices: Choice[]; defaultId?: string }) => Promise<string>;
  selectMany?: (args: {
    title: string;
    groups: GroupedChoice[];
    defaultIds: string[];
    allowEmpty: boolean;
    emptyLabel: string;
  }) => Promise<string[]>;
  confirm?: (args: { question: string; defaultValue: boolean; requireExplicit?: boolean }) => Promise<boolean>;
  close?: () => void;
};

export type InitPromptIO = {
  interactive?: boolean;
  ask?: (question: string) => Promise<string>;
  write?: (line: string) => void;
  selectOne?: (args: { title: string; choices: Choice[]; defaultId?: string }) => Promise<string>;
  selectMany?: (args: {
    title: string;
    groups: GroupedChoice[];
    defaultIds: string[];
    allowEmpty: boolean;
    emptyLabel: string;
  }) => Promise<string[]>;
  confirm?: (args: { question: string; defaultValue: boolean; requireExplicit?: boolean }) => Promise<boolean>;
  close?: () => void;
};

export type GuidedInitSelections = {
  language: string;
  modules: string[];
  targets: string[];
  skills: string[];
  workspaceLanguageOverrides: Record<string, string>;
};

type InitPresetStore = {
  version: 1;
  presets: Record<string, GuidedInitSelections>;
};

export async function resolveGuidedInitSelections({
  registry,
  rootDir,
  configFile,
  bare,
  workspacePatterns,
  defaults,
  promptIO
}: {
  registry: Registry;
  rootDir: string;
  configFile: string;
  bare: boolean;
  workspacePatterns: string[];
  defaults: {
    language: string;
    modules: string[];
    targets: string[];
    skills: string[];
  };
  promptIO?: InitPromptIO;
}): Promise<GuidedInitSelections> {
  const session = createPromptSession(promptIO);
  if (!session) {
    return {
      language: defaults.language,
      modules: defaults.modules,
      targets: defaults.targets,
      skills: defaults.skills,
      workspaceLanguageOverrides: {}
    };
  }

  const presetsPath = path.join(rootDir, '.ailib', 'init-presets.json');
  const presetStore = await readPresetStore(presetsPath);
  const availableLanguageChoices = Object.entries(registry.languages)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id]) => ({ id, label: id }));
  const hasPresets = Object.keys(presetStore.presets).length > 0;
  let selectedDefaults: GuidedInitSelections = {
    language: defaults.language,
    modules: defaults.modules,
    targets: defaults.targets,
    skills: defaults.skills,
    workspaceLanguageOverrides: {}
  };

  try {
    session.write('\nWelcome to ailib init onboarding\n');
    session.write('This guided setup helps you choose targets, language, modules, and skills.\n');
    session.write('You can restart before applying, and nothing is written until apply is confirmed.\n');
    session.write('Use numbers or IDs in text mode. For multi-select prompts, use comma-separated values.\n');

    if (hasPresets) {
      session.write('\nStep 0/6: Presets (optional)\n');
      const usePreset = await promptYesNo({
        question: 'Load a saved preset first? [y/N]: ',
        defaultValue: false,
        session
      });
      if (usePreset) {
        const presetChoices = Object.keys(presetStore.presets)
          .sort((left, right) => left.localeCompare(right))
          .map((name) => ({ id: name, label: name }));
        const presetName = await promptSingleChoice({
          title: 'Saved presets',
          choices: presetChoices,
          defaultId: presetChoices[0]?.id,
          session
        });
        const preset = presetStore.presets[presetName];
        if (preset) {
          selectedDefaults = {
            language: preset.language,
            modules: preset.modules,
            targets: preset.targets,
            skills: preset.skills,
            workspaceLanguageOverrides: preset.workspaceLanguageOverrides
          };
          session.write(`Loaded preset '${presetName}'.\n`);
        }
      }
    }

    for (;;) {
      session.write('\nStep 1/5: Choose targets\n');
      const targets = await promptMultiChoice({
        title: 'Targets',
        groups: [
          {
            heading: 'Available targets',
            choices: Object.entries(registry.targets)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([id, def]) => ({
                id,
                label: id,
                description: def.display || def.output
              }))
          }
        ],
        defaultIds: selectedDefaults.targets,
        allowEmpty: false,
        emptyLabel: 'none',
        session
      });

      session.write('\nStep 2/5: Choose default language\n');
      const language = await promptSingleChoice({
        title: 'Default language',
        choices: availableLanguageChoices,
        defaultId: selectedDefaults.language,
        session
      });

      session.write('\nStep 3/5: Choose modules\n');
      const modules = await promptMultiChoice({
        title: `Modules (${language})`,
        groups: [
          {
            heading: 'Available modules',
            choices: Object.entries(registry.languages[language]?.modules || {})
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([id, def]) => ({
                id,
                label: id,
                description: `slot: ${def.slot}`
              }))
          }
        ],
        defaultIds: selectedDefaults.modules,
        allowEmpty: true,
        emptyLabel: 'none',
        session
      });

      session.write('\nStep 4/5: Choose skills\n');
      const compatibleSkills = resolveCompatibleSkills({
        registry,
        language,
        modules,
        targets
      });
      const groupedSkillChoices = groupSkillChoices(compatibleSkills);
      const skills = await promptMultiChoice({
        title: 'Skills',
        groups: groupedSkillChoices,
        defaultIds: selectedDefaults.skills.filter((id) => compatibleSkills.some((skill) => skill.id === id)),
        allowEmpty: true,
        emptyLabel: 'none',
        session
      });
      const expandedSkills = expandRequiredSkills(skills, registry.skills || {});
      const addedDependencies = expandedSkills.filter((id) => !skills.includes(id));
      if (addedDependencies.length) {
        session.write(`Auto-selected required skills: ${addedDependencies.join(', ')}\n`);
      }

      let workspaceLanguageOverrides: Record<string, string> = {};
      if (!bare && workspacePatterns.length) {
        session.write('\nStep 5/5: Workspace language overrides (optional)\n');
        const candidates = await discoverWorkspaceCandidates(rootDir, workspacePatterns);
        if (candidates.length) {
          const hasPresetWorkspaceOverrides = Object.keys(selectedDefaults.workspaceLanguageOverrides).length > 0;
          const configureOverrides = await promptYesNo({
            question: hasPresetWorkspaceOverrides
              ? 'Configure workspace-specific language overrides? [Y/n]: '
              : 'Configure workspace-specific language overrides? [y/N]: ',
            defaultValue: hasPresetWorkspaceOverrides,
            session
          });
          if (configureOverrides) {
            workspaceLanguageOverrides = await promptWorkspaceLanguageOverrides({
              rootDir,
              configFile,
              candidates,
              defaultLanguage: language,
              languageChoices: availableLanguageChoices,
              initialOverrides: selectedDefaults.workspaceLanguageOverrides,
              session
            });
          }
        } else {
          session.write('No workspace candidates detected from current workspace patterns.\n');
        }
      }

      renderOnboardingSummary({
        language,
        modules,
        targets,
        skills: expandedSkills,
        workspaceLanguageOverrides,
        session
      });
      renderPlannedFileChangesPreview({
        configFile,
        registry,
        targets,
        workspaceLanguageOverrides,
        session
      });
      session.write('No files will be created or updated until you confirm apply.\n');

      const confirmSelection = await promptYesNo({
        question: 'Apply this setup? [y/n]: ',
        defaultValue: false,
        requireExplicit: true,
        session
      });
      if (confirmSelection) {
        const savePreset = await promptYesNo({
          question: 'Save these selections as a preset for future init runs? [y/N]: ',
          defaultValue: false,
          session
        });
        if (savePreset) {
          const presetName = await promptPresetName({
            session,
            existingPresetNames: Object.keys(presetStore.presets)
          });
          presetStore.presets[presetName] = {
            language,
            modules,
            targets,
            skills: expandedSkills,
            workspaceLanguageOverrides
          };
          await writePresetStore(presetsPath, presetStore);
          session.write(`Saved preset '${presetName}' to .ailib/init-presets.json.\n`);
        }
        session.write('\n');
        return {
          language,
          modules,
          targets,
          skills: expandedSkills,
          workspaceLanguageOverrides
        };
      }

      const restart = await promptYesNo({
        question: 'Restart onboarding from the beginning? [Y/n]: ',
        defaultValue: true,
        session
      });
      if (!restart) {
        throw new Error('Guided init cancelled by user');
      }
      session.write('\nRestarting guided onboarding...\n');
    }
  } finally {
    session.close?.();
  }
}

function renderOnboardingSummary({
  language,
  modules,
  targets,
  skills,
  workspaceLanguageOverrides,
  session
}: GuidedInitSelections & {
  session: PromptSession;
}) {
  const workspaceOverrideLines = Object.entries(workspaceLanguageOverrides)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([workspace, selectedLanguage]) => `  - ${workspace}: ${selectedLanguage}`);
  const summaryLines = [
    '\nReview your onboarding selections',
    `  language: ${language}`,
    `  targets: ${targets.length ? targets.join(', ') : 'none'}`,
    `  modules: ${modules.length ? modules.join(', ') : 'none'}`,
    `  skills: ${skills.length ? skills.join(', ') : 'none'}`,
    '  workspace language overrides:'
  ];
  if (workspaceOverrideLines.length) {
    summaryLines.push(...workspaceOverrideLines);
  } else {
    summaryLines.push('  - none');
  }
  session.write(`${summaryLines.join('\n')}\n`);
}

function renderPlannedFileChangesPreview({
  configFile,
  registry,
  targets,
  workspaceLanguageOverrides,
  session
}: {
  configFile: string;
  registry: Registry;
  targets: string[];
  workspaceLanguageOverrides: Record<string, string>;
  session: PromptSession;
}) {
  const previewPaths = new Set<string>([configFile, '.ailib/**']);
  for (const targetId of targets) {
    const target = registry.targets[targetId];
    if (!target) continue;
    previewPaths.add(target.output);
    if (target.root_output) {
      previewPaths.add(target.root_output);
    }
  }
  for (const workspace of Object.keys(workspaceLanguageOverrides)) {
    previewPaths.add(toPosix(path.join(workspace, configFile)));
  }
  const previewLines = ['\nPlanned file changes after apply:'];
  for (const previewPath of [...previewPaths].sort((left, right) => left.localeCompare(right))) {
    previewLines.push(`  - ${previewPath}`);
  }
  session.write(`${previewLines.join('\n')}\n`);
}

function createPromptSession(promptIO?: InitPromptIO): PromptSession | null {
  const interactive = promptIO?.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) return null;

  if (!promptIO?.ask) {
    throw new Error('Interactive guided init requires prompt ask handler');
  }

  const write = promptIO.write ?? ((line: string) => process.stdout.write(line));
  return {
    write,
    ask: promptIO.ask,
    selectOne: promptIO.selectOne,
    selectMany: promptIO.selectMany,
    confirm: promptIO.confirm,
    close: promptIO.close
  };
}

async function promptSingleChoice({
  title,
  choices,
  defaultId,
  session
}: {
  title: string;
  choices: Choice[];
  defaultId?: string;
  session: PromptSession;
}) {
  if (!choices.length) {
    throw new Error(`No available choices for ${title}`);
  }
  const fallback = defaultId && choices.some((choice) => choice.id === defaultId) ? defaultId : choices[0].id;
  if (session.selectOne) {
    const selectedId = await session.selectOne({
      title,
      choices,
      defaultId: fallback
    });
    if (!choices.some((choice) => choice.id === selectedId)) {
      throw new Error(`Invalid selection '${selectedId}' for ${title}`);
    }
    return selectedId;
  }
  const indexMap = renderChoices([{ heading: title, choices }], session);
  let selectedId = fallback;
  for (;;) {
    const defaultIndex = indexMap.findIndex((entry) => entry.id === fallback) + 1;
    const answer = (await session.ask(`Select one [default: ${String(defaultIndex)}]: `)).trim();
    if (!answer) break;
    const selected = resolveChoiceToken(answer, indexMap);
    if (selected) {
      selectedId = selected.id;
      break;
    }
    session.write(`Invalid selection '${answer}'. Try again.\n`);
  }
  return selectedId;
}

async function promptMultiChoice({
  title,
  groups,
  defaultIds,
  allowEmpty,
  emptyLabel,
  session
}: {
  title: string;
  groups: GroupedChoice[];
  defaultIds: string[];
  allowEmpty: boolean;
  emptyLabel: string;
  session: PromptSession;
}) {
  const availableChoices = groups.flatMap((group) => group.choices);
  const availableSet = new Set(availableChoices.map((choice) => choice.id));
  const defaults = uniqueList(defaultIds.filter((id) => availableSet.has(id)));
  if (session.selectMany) {
    const selectedIds = await session.selectMany({
      title,
      groups,
      defaultIds: defaults,
      allowEmpty,
      emptyLabel
    });
    const deduped = uniqueList(selectedIds);
    const invalid = deduped.find((id) => !availableSet.has(id));
    if (invalid) {
      throw new Error(`Invalid selection '${invalid}' for ${title}`);
    }
    if (!allowEmpty && !deduped.length) {
      throw new Error(`At least one selection is required for ${title}`);
    }
    return deduped;
  }
  const indexMap = renderChoices(groups.length ? groups : [{ heading: title, choices: [] }], session);
  if (!indexMap.length) {
    session.write(`${title}: no compatible options.\n`);
    return [];
  }

  let selectedIds: string[] = defaults;
  for (;;) {
    const defaultIndexes = defaults
      .map((id) => indexMap.findIndex((entry) => entry.id === id) + 1)
      .filter((idx) => idx > 0);
    const defaultText = defaultIndexes.length ? defaultIndexes.join(',') : emptyLabel;
    const answer = (
      await session.ask(`Select one or more [default: ${defaultText}; use comma-separated values]: `)
    ).trim();
    if (!answer) {
      selectedIds = defaults;
      break;
    }
    if (allowEmpty && /^none$/iu.test(answer)) {
      selectedIds = [];
      break;
    }

    const tokens = answer
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
    if (!tokens.length) {
      if (allowEmpty) {
        selectedIds = [];
        break;
      }
      session.write('At least one selection is required.\n');
      continue;
    }

    const resolved: string[] = [];
    let invalidToken: string | null = null;
    for (const token of tokens) {
      const selected = resolveChoiceToken(token, indexMap);
      if (!selected) {
        invalidToken = token;
        break;
      }
      resolved.push(selected.id);
    }

    if (invalidToken) {
      session.write(`Invalid selection '${invalidToken}'. Try again.\n`);
      continue;
    }

    const deduped = uniqueList(resolved);
    selectedIds = deduped;
    break;
  }
  return selectedIds;
}

async function promptYesNo({
  question,
  defaultValue,
  requireExplicit,
  session
}: {
  question: string;
  defaultValue: boolean;
  requireExplicit?: boolean;
  session: PromptSession;
}) {
  if (session.confirm) {
    return await session.confirm({ question, defaultValue, requireExplicit });
  }
  let selected = defaultValue;
  for (;;) {
    const answer = (await session.ask(question)).trim().toLowerCase();
    if (!answer) {
      if (requireExplicit) {
        session.write('Please answer yes or no.\n');
        continue;
      }
      break;
    }
    if (['y', 'yes'].includes(answer)) {
      selected = true;
      break;
    }
    if (['n', 'no'].includes(answer)) {
      selected = false;
      break;
    }
    session.write(`Please answer yes or no.\n`);
  }
  return selected;
}

async function promptWorkspaceLanguageOverrides({
  rootDir,
  configFile,
  candidates,
  defaultLanguage,
  languageChoices,
  initialOverrides,
  session
}: {
  rootDir: string;
  configFile: string;
  candidates: string[];
  defaultLanguage: string;
  languageChoices: Choice[];
  initialOverrides: Record<string, string>;
  session: PromptSession;
}) {
  const overrides: Record<string, string> = {};
  for (const workspaceDir of candidates) {
    const rel = toPosix(path.relative(rootDir, workspaceDir));
    const existingPath = path.join(workspaceDir, configFile);
    if (await exists(existingPath)) {
      session.write(`Workspace '${rel}' already has ${configFile}; keeping existing language.\n`);
      continue;
    }
    const selectedLanguage = await promptSingleChoice({
      title: `Language for workspace ${rel}`,
      choices: languageChoices,
      defaultId: initialOverrides[rel] || defaultLanguage,
      session
    });
    if (selectedLanguage !== defaultLanguage) {
      overrides[rel] = selectedLanguage;
    }
  }
  return overrides;
}

async function promptPresetName({
  session,
  existingPresetNames
}: {
  session: PromptSession;
  existingPresetNames: string[];
}) {
  const existing = new Set(existingPresetNames);
  for (;;) {
    const answer = (await session.ask('Preset name (letters, numbers, "-", "_" or "."): ')).trim();
    if (!answer) {
      session.write('Preset name cannot be empty.\n');
      continue;
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(answer)) {
      session.write('Invalid preset name. Use letters, numbers, "-", "_" or ".".\n');
      continue;
    }
    if (!existing.has(answer)) {
      return answer;
    }
    const overwrite = await promptYesNo({
      question: `Preset '${answer}' exists. Overwrite it? [y/N]: `,
      defaultValue: false,
      session
    });
    if (overwrite) {
      return answer;
    }
  }
}

async function readPresetStore(presetsPath: string): Promise<InitPresetStore> {
  if (!(await exists(presetsPath))) {
    return { version: 1, presets: {} };
  }
  let loaded: unknown = null;
  try {
    loaded = await readJsonSafe(presetsPath);
  } catch {
    return { version: 1, presets: {} };
  }
  const store = loaded as Partial<InitPresetStore>;
  const rawPresets = store?.presets;
  if (!rawPresets || typeof rawPresets !== 'object') {
    return { version: 1, presets: {} };
  }
  const presets: Record<string, GuidedInitSelections> = {};
  for (const [name, value] of Object.entries(rawPresets)) {
    if (!value || typeof value !== 'object') continue;
    const preset = value as Partial<GuidedInitSelections>;
    if (
      typeof preset.language !== 'string' ||
      !Array.isArray(preset.modules) ||
      !Array.isArray(preset.targets) ||
      !Array.isArray(preset.skills)
    ) {
      continue;
    }
    const rawWorkspaceOverrides = preset.workspaceLanguageOverrides;
    const workspaceLanguageOverrides: Record<string, string> = {};
    if (rawWorkspaceOverrides && typeof rawWorkspaceOverrides === 'object') {
      for (const [workspace, language] of Object.entries(rawWorkspaceOverrides)) {
        if (typeof language === 'string' && typeof workspace === 'string') {
          workspaceLanguageOverrides[workspace] = language;
        }
      }
    }
    presets[name] = {
      language: preset.language,
      modules: uniqueList(preset.modules.filter((entry): entry is string => typeof entry === 'string')),
      targets: uniqueList(preset.targets.filter((entry): entry is string => typeof entry === 'string')),
      skills: uniqueList(preset.skills.filter((entry): entry is string => typeof entry === 'string')),
      workspaceLanguageOverrides
    };
  }
  return {
    version: 1,
    presets
  };
}

async function writePresetStore(presetsPath: string, store: InitPresetStore) {
  await fs.mkdir(path.dirname(presetsPath), { recursive: true });
  await fs.writeFile(presetsPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

async function readJsonSafe(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

function resolveChoiceToken(token: string, indexMap: Array<{ id: string }>) {
  if (/^\d+$/u.test(token)) {
    const idx = Number.parseInt(token, 10) - 1;
    if (idx < 0 || idx >= indexMap.length) return null;
    return indexMap[idx];
  }
  return indexMap.find((entry) => entry.id === token) || null;
}

function renderChoices(groups: GroupedChoice[], session: PromptSession) {
  const indexMap: Array<{ id: string }> = [];
  for (const group of groups) {
    session.write(`\n${group.heading}\n`);
    if (!group.choices.length) {
      session.write('  (none)\n');
      continue;
    }
    for (const choice of group.choices) {
      indexMap.push({ id: choice.id });
      const index = indexMap.length;
      const description = choice.description ? ` - ${choice.description}` : '';
      session.write(`  ${String(index)}) ${choice.label}${description}\n`);
    }
  }
  return indexMap;
}

function resolveCompatibleSkills({
  registry,
  language,
  modules,
  targets
}: {
  registry: Registry;
  language: string;
  modules: string[];
  targets: string[];
}) {
  const selectedModules = new Set(modules);
  const selectedTargets = new Set(targets);
  const selectedSkills = Object.entries(registry.skills || {}).filter(([, def]) => {
    const compatible = def.compatible || {};
    if (compatible.languages?.length && !compatible.languages.includes(language)) return false;
    if (compatible.modules?.length && !compatible.modules.some((moduleId) => selectedModules.has(moduleId)))
      return false;
    if (compatible.targets?.length && !compatible.targets.some((targetId) => selectedTargets.has(targetId)))
      return false;
    return true;
  });
  return selectedSkills
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, def]) => ({
      id,
      def
    }));
}

function groupSkillChoices(skills: Array<{ id: string; def: SkillDefinition }>): GroupedChoice[] {
  const grouped = new Map<string, Choice[]>();
  for (const skill of skills) {
    const rawType = (skill.def.skill_type || 'other').trim();
    const type = rawType || 'other';
    const list = grouped.get(type) || [];
    list.push({
      id: skill.id,
      label: skill.id,
      description: skill.def.display
    });
    grouped.set(type, list);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, choices]) => ({
      heading: `Type: ${type
        .split(/[-_\s]+/u)
        .filter(Boolean)
        .map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
        .join(' ')}`,
      choices: choices.sort((left, right) => left.id.localeCompare(right.id))
    }));
}

function expandRequiredSkills(selectedSkills: string[], skills: Record<string, SkillDefinition>) {
  const expanded = new Set(selectedSkills);
  const queue = [...selectedSkills];
  while (queue.length) {
    const skillId = queue.shift();
    if (!skillId) continue;
    for (const dependency of skills[skillId]?.requires || []) {
      if (!expanded.has(dependency)) {
        expanded.add(dependency);
        queue.push(dependency);
      }
    }
  }
  return [...expanded];
}

async function discoverWorkspaceCandidates(rootDir: string, workspacePatterns: string[]) {
  const out = new Set<string>();
  for (const pattern of workspacePatterns) {
    const resolved = await resolvePatternDirs(rootDir, pattern);
    for (const dir of resolved) out.add(path.resolve(dir));
  }
  return [...out].sort();
}

async function resolvePatternDirs(rootDir: string, pattern: string) {
  const normalized = toPosix(pattern).replace(/^\.?\//u, '');
  if (!normalized) return [];
  const segments = normalized.split('/').filter(Boolean);
  const matches: string[] = [];

  async function walk(currentDir: string, idx: number): Promise<void> {
    if (idx >= segments.length) {
      if (await isDirectory(currentDir)) matches.push(currentDir);
      return;
    }

    const segment = segments[idx];
    if (segment === '**') {
      await walk(currentDir, idx + 1);
      const entries = await readDirectoryEntries(currentDir);
      for (const entry of entries) {
        await walk(path.join(currentDir, entry.name), idx);
      }
      return;
    }

    if (segment === '*') {
      const entries = await readDirectoryEntries(currentDir);
      for (const entry of entries) {
        await walk(path.join(currentDir, entry.name), idx + 1);
      }
      return;
    }

    await walk(path.join(currentDir, segment), idx + 1);
  }

  await walk(rootDir, 0);
  return matches;
}

async function readDirectoryEntries(dir: string) {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules');
}

async function isDirectory(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

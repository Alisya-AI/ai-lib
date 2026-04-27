import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
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
  close: () => void;
};

export type InitPromptIO = {
  interactive?: boolean;
  ask?: (question: string) => Promise<string>;
  write?: (line: string) => void;
};

export type GuidedInitSelections = {
  language: string;
  modules: string[];
  targets: string[];
  skills: string[];
  workspaceLanguageOverrides: Record<string, string>;
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

  try {
    session.write('\nailib init guided setup\n');
    session.write('Select options by number. Use comma-separated values for multi-select.\n\n');

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
      defaultIds: defaults.targets,
      allowEmpty: false,
      emptyLabel: 'none',
      session
    });

    const language = await promptSingleChoice({
      title: 'Default language',
      choices: Object.entries(registry.languages)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id]) => ({ id, label: id })),
      defaultId: defaults.language,
      session
    });

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
      defaultIds: defaults.modules,
      allowEmpty: true,
      emptyLabel: 'none',
      session
    });

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
      defaultIds: defaults.skills.filter((id) => compatibleSkills.some((skill) => skill.id === id)),
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
      const candidates = await discoverWorkspaceCandidates(rootDir, workspacePatterns);
      if (candidates.length) {
        const configureOverrides = await promptYesNo({
          question: 'Configure workspace-specific language overrides? [y/N]: ',
          defaultValue: false,
          session
        });
        if (configureOverrides) {
          workspaceLanguageOverrides = await promptWorkspaceLanguageOverrides({
            rootDir,
            configFile,
            candidates,
            defaultLanguage: language,
            languageChoices: Object.entries(registry.languages)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([id]) => ({ id, label: id })),
            session
          });
        }
      }
    }

    session.write('\n');
    return {
      language,
      modules,
      targets,
      skills: expandedSkills,
      workspaceLanguageOverrides
    };
  } finally {
    session.close();
  }
}

function createPromptSession(promptIO?: InitPromptIO): PromptSession | null {
  const interactive = promptIO?.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) return null;

  const write = promptIO?.write ?? ((line: string) => process.stdout.write(line));
  if (promptIO?.ask) {
    return {
      write,
      ask: promptIO.ask,
      close: () => {}
    };
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return {
    write,
    ask: (question: string) => rl.question(question),
    close: () => rl.close()
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
  const indexMap = renderChoices([{ heading: title, choices }], session);
  while (true) {
    const defaultIndex = indexMap.findIndex((entry) => entry.id === fallback) + 1;
    const answer = (await session.ask(`Select one [default: ${String(defaultIndex)}]: `)).trim();
    if (!answer) return fallback;
    const selected = resolveChoiceToken(answer, indexMap);
    if (selected) return selected.id;
    session.write(`Invalid selection '${answer}'. Try again.\n`);
  }
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
  const indexMap = renderChoices(groups.length ? groups : [{ heading: title, choices: [] }], session);
  if (!indexMap.length) {
    session.write(`${title}: no compatible options.\n`);
    return [];
  }

  while (true) {
    const defaultIndexes = defaults
      .map((id) => indexMap.findIndex((entry) => entry.id === id) + 1)
      .filter((idx) => idx > 0);
    const defaultText = defaultIndexes.length ? defaultIndexes.join(',') : emptyLabel;
    const answer = (
      await session.ask(`Select one or more [default: ${defaultText}; use comma-separated values]: `)
    ).trim();
    if (!answer) return defaults;
    if (allowEmpty && /^none$/iu.test(answer)) return [];

    const tokens = answer
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
    if (!tokens.length) {
      if (allowEmpty) return [];
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
    if (!allowEmpty && !deduped.length) {
      session.write('At least one selection is required.\n');
      continue;
    }
    return deduped;
  }
}

async function promptYesNo({
  question,
  defaultValue,
  session
}: {
  question: string;
  defaultValue: boolean;
  session: PromptSession;
}) {
  while (true) {
    const answer = (await session.ask(question)).trim().toLowerCase();
    if (!answer) return defaultValue;
    if (['y', 'yes'].includes(answer)) return true;
    if (['n', 'no'].includes(answer)) return false;
    session.write(`Please answer yes or no.\n`);
  }
}

async function promptWorkspaceLanguageOverrides({
  rootDir,
  configFile,
  candidates,
  defaultLanguage,
  languageChoices,
  session
}: {
  rootDir: string;
  configFile: string;
  candidates: string[];
  defaultLanguage: string;
  languageChoices: Choice[];
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
      defaultId: defaultLanguage,
      session
    });
    if (selectedLanguage !== defaultLanguage) {
      overrides[rel] = selectedLanguage;
    }
  }
  return overrides;
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
      heading: `Type: ${formatSkillType(type)}`,
      choices: choices.sort((left, right) => left.id.localeCompare(right.id))
    }));
}

function formatSkillType(type: string) {
  return type
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
    .join(' ');
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
  let entries: Array<{ name: string } & { isDirectory: () => boolean }> = [];
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

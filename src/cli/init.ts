import fs from 'node:fs/promises';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
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

/* c8 ignore start - interactive TTY keyboard handling is not deterministic in unit tests */
function createDefaultPromptIO(): InitPromptIO {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const input = process.stdin as NodeJS.ReadStream;
  const output = process.stdout as NodeJS.WriteStream;
  const clearRenderedLines = (lineCount: number) => {
    if (lineCount <= 0) return;
    output.write(`\x1b[${String(lineCount)}A`);
    output.write('\x1b[0J');
  };
  const readKeypress = () =>
    new Promise<{ name?: string; ctrl?: boolean }>((resolve) => {
      const onKeypress = (_chunk: string, key: { name?: string; ctrl?: boolean } = {}) => {
        input.off('keypress', onKeypress);
        resolve(key);
      };
      input.on('keypress', onKeypress);
    });
  const withRawInput = async <T>(fn: () => Promise<T>) => {
    const supportsRaw = Boolean(input.isTTY && typeof input.setRawMode === 'function');
    const previousRaw = (input as NodeJS.ReadStream & { isRaw?: boolean }).isRaw === true;
    emitKeypressEvents(input);
    if (supportsRaw) input.setRawMode(true);
    input.resume();
    try {
      return await fn();
    } finally {
      if (supportsRaw) input.setRawMode(previousRaw);
    }
  };
  const runInteractiveSelect = async ({
    title,
    groups,
    selectedIds,
    single,
    allowEmpty
  }: {
    title: string;
    groups: Array<{ heading: string; choices: Array<{ id: string; label: string; description?: string }> }>;
    selectedIds: string[];
    single: boolean;
    allowEmpty: boolean;
  }) => {
    const choices = groups.flatMap((group) => group.choices);
    if (!choices.length) {
      output.write(`${title}: no compatible options.\n`);
      return [];
    }

    const selected = new Set(single ? [selectedIds[0] || choices[0].id] : selectedIds.filter(Boolean));
    let cursor = Math.max(
      0,
      choices.findIndex((choice) => selected.has(choice.id))
    );
    let warning = '';
    let renderedLines = 0;

    const render = () => {
      clearRenderedLines(renderedLines);
      const lines = [
        '',
        title,
        single
          ? 'Use up/down arrows to move, space to select, enter to confirm.'
          : 'Use up/down arrows to move, space to toggle, enter to confirm.'
      ];
      if (warning) lines.push(warning);

      let index = 0;
      for (const group of groups) {
        lines.push('');
        lines.push(group.heading);
        if (!group.choices.length) {
          lines.push('  (none)');
          continue;
        }
        for (const choice of group.choices) {
          const cursorMark = index === cursor ? '>' : ' ';
          const selectedMark = single
            ? selected.has(choice.id)
              ? '(*)'
              : '( )'
            : selected.has(choice.id)
              ? '[x]'
              : '[ ]';
          const description = choice.description ? ` - ${choice.description}` : '';
          lines.push(` ${cursorMark} ${selectedMark} ${choice.label}${description}`);
          index += 1;
        }
      }
      output.write(`${lines.join('\n')}\n`);
      renderedLines = lines.length;
    };

    await withRawInput(async () => {
      render();
      for (;;) {
        const key = await readKeypress();
        if (key.ctrl && key.name === 'c') {
          throw new Error('Guided init cancelled by user');
        }
        if (key.name === 'up') {
          cursor = (cursor - 1 + choices.length) % choices.length;
          warning = '';
          render();
          continue;
        }
        if (key.name === 'down') {
          cursor = (cursor + 1) % choices.length;
          warning = '';
          render();
          continue;
        }
        if (key.name === 'space') {
          const current = choices[cursor];
          if (single) {
            selected.clear();
            selected.add(current.id);
            warning = '';
          } else if (selected.has(current.id)) {
            if (!allowEmpty && selected.size === 1) {
              warning = 'At least one selection is required.';
            } else {
              selected.delete(current.id);
              warning = '';
            }
          } else {
            selected.add(current.id);
            warning = '';
          }
          render();
          continue;
        }
        if (key.name === 'return' || key.name === 'enter') {
          if (!allowEmpty && selected.size === 0) {
            warning = 'At least one selection is required.';
            render();
            continue;
          }
          break;
        }
      }
    });

    clearRenderedLines(renderedLines);
    const ordered = choices.map((choice) => choice.id).filter((id) => selected.has(id));
    if (single) {
      const selectedLabel = choices.find((choice) => choice.id === ordered[0])?.label || ordered[0];
      output.write(`${title}: ${selectedLabel}\n`);
    } else {
      const selectedLabels = choices
        .filter((choice) => selected.has(choice.id))
        .map((choice) => choice.label)
        .join(', ');
      output.write(`${title}: ${selectedLabels || 'none'}\n`);
    }
    return ordered;
  };

  type SelectOneArgs = Parameters<NonNullable<InitPromptIO['selectOne']>>[0];
  type SelectManyArgs = Parameters<NonNullable<InitPromptIO['selectMany']>>[0];
  type ConfirmArgs = Parameters<NonNullable<InitPromptIO['confirm']>>[0];

  const selectOne = async (args: SelectOneArgs) => {
    const selected = await runInteractiveSelect({
      title: args.title,
      groups: [{ heading: args.title, choices: args.choices }],
      selectedIds: [args.defaultId || args.choices[0]?.id || ''],
      single: true,
      allowEmpty: false
    });
    return selected[0];
  };
  const selectMany = async (args: SelectManyArgs) => {
    return await runInteractiveSelect({
      title: args.title,
      groups: args.groups,
      selectedIds: args.defaultIds,
      single: false,
      allowEmpty: args.allowEmpty
    });
  };
  const confirm = async ({ question, defaultValue }: ConfirmArgs) => {
    const normalizedQuestion = question.replace(/\s*\[[^\]]+\]:?\s*$/u, '').trim() || 'Confirm';
    const selected = await runInteractiveSelect({
      title: normalizedQuestion,
      groups: [
        {
          heading: normalizedQuestion,
          choices: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' }
          ]
        }
      ],
      selectedIds: [defaultValue ? 'yes' : 'no'],
      single: true,
      allowEmpty: false
    });
    return selected[0] === 'yes';
  };
  return {
    ask: rl.question.bind(rl),
    write: process.stdout.write.bind(process.stdout),
    selectOne,
    selectMany,
    confirm,
    close: rl.close.bind(rl)
  };
}
/* c8 ignore stop */

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

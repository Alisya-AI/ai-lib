import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import type { InitPromptIO } from './init-guided.ts';

export function createDefaultPromptIO(): InitPromptIO {
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
    new Promise<{ name?: string; ctrl?: boolean; sequence?: string; chunk?: string }>((resolve) => {
      const onKeypress = (chunk: string, key: { name?: string; ctrl?: boolean; sequence?: string } = {}) => {
        input.off('keypress', onKeypress);
        resolve({
          ...key,
          chunk
        });
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
    allowEmpty,
    requireExplicitSingleSelection = false
  }: {
    title: string;
    groups: Array<{ heading: string; choices: Array<{ id: string; label: string; description?: string }> }>;
    selectedIds: string[];
    single: boolean;
    allowEmpty: boolean;
    requireExplicitSingleSelection?: boolean;
  }) => {
    const allChoices = groups.flatMap((group) => group.choices);
    if (!allChoices.length) {
      output.write(`${title}: no compatible options.\n`);
      return [];
    }

    const selected = new Set(
      single
        ? selectedIds[0]
          ? [selectedIds[0]]
          : requireExplicitSingleSelection
            ? []
            : [allChoices[0].id]
        : selectedIds.filter(Boolean)
    );
    let filterQuery = '';
    let showHelp = true;
    let cursor = Math.max(
      0,
      allChoices.findIndex((choice) => selected.has(choice.id))
    );
    if (cursor < 0) cursor = 0;
    let warning = '';
    let renderedLines = 0;
    const isPrintable = (chunk: string | undefined) => Boolean(chunk && /^[\x20-\x7E]$/u.test(chunk));
    const visibleGroups = () => {
      const query = filterQuery.trim().toLowerCase();
      const out: typeof groups = [];
      for (const group of groups) {
        const choices = group.choices.filter((choice) => {
          if (!query) return true;
          const searchText = `${choice.id} ${choice.label} ${choice.description || ''}`.toLowerCase();
          return searchText.includes(query);
        });
        if (choices.length) {
          out.push({
            heading: group.heading,
            choices
          });
        }
      }
      return out;
    };
    const visibleChoices = () => visibleGroups().flatMap((group) => group.choices);
    const normalizeCursor = () => {
      const visible = visibleChoices();
      if (!visible.length) {
        cursor = 0;
        return visible;
      }
      if (cursor >= visible.length) {
        cursor = visible.length - 1;
      }
      return visible;
    };

    const render = () => {
      clearRenderedLines(renderedLines);
      const groupsToRender = visibleGroups();
      const choicesToRender = normalizeCursor();
      const lines = ['', title, 'Use up/down to move and Enter to confirm.'];
      if (showHelp) {
        lines.push(
          single
            ? 'Space: select option, ?: hide help'
            : 'Space: toggle option, Ctrl+A: select all, Ctrl+U: clear all, ?: hide help'
        );
        lines.push('Type to filter, Backspace to edit, Esc to clear filter.');
      } else {
        lines.push('Press ? to show keyboard help.');
      }
      lines.push(`Filter: ${filterQuery || '(none)'}`);
      if (!single) {
        lines.push(`Selected: ${String(selected.size)}`);
      }
      if (warning) lines.push(`Warning: ${warning}`);
      if (!choicesToRender.length) lines.push('No matching options.');

      let index = 0;
      for (const group of groupsToRender) {
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
        const choices = normalizeCursor();
        if (key.ctrl && key.name === 'c') {
          throw new Error('Guided init cancelled by user');
        }
        if (key.chunk === '?') {
          showHelp = !showHelp;
          warning = '';
          render();
          continue;
        }
        if (!single && key.ctrl && key.name === 'a') {
          for (const choice of choices) {
            selected.add(choice.id);
          }
          warning = '';
          render();
          continue;
        }
        if (!single && key.ctrl && key.name === 'u') {
          if (!allowEmpty && selected.size > 0) {
            warning = 'At least one selection is required.';
          } else {
            selected.clear();
            warning = '';
          }
          render();
          continue;
        }
        if (key.name === 'backspace') {
          if (filterQuery.length) {
            filterQuery = filterQuery.slice(0, -1);
            warning = '';
            render();
          }
          continue;
        }
        if (key.name === 'escape') {
          if (filterQuery.length) {
            filterQuery = '';
            warning = '';
            render();
          }
          continue;
        }
        if (key.name === 'up') {
          if (choices.length) {
            cursor = (cursor - 1 + choices.length) % choices.length;
            warning = '';
            render();
          }
          continue;
        }
        if (key.name === 'down') {
          if (choices.length) {
            cursor = (cursor + 1) % choices.length;
            warning = '';
            render();
          }
          continue;
        }
        if (key.name === 'space') {
          if (!choices.length) {
            warning = 'No matching options for current filter.';
            render();
            continue;
          }
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
          if (single && selected.size === 0 && requireExplicitSingleSelection) {
            const current = choices[cursor];
            if (current) {
              selected.add(current.id);
            }
          }
          if (!allowEmpty && selected.size === 0) {
            warning = 'At least one selection is required.';
            render();
            continue;
          }
          break;
        }
        if (isPrintable(key.chunk)) {
          filterQuery += key.chunk || '';
          warning = '';
          render();
          continue;
        }
      }
    });

    clearRenderedLines(renderedLines);
    const ordered = allChoices.map((choice) => choice.id).filter((id) => selected.has(id));
    if (single) {
      const selectedLabel = allChoices.find((choice) => choice.id === ordered[0])?.label || ordered[0];
      output.write(`${title}: ${selectedLabel}\n`);
    } else {
      const selectedLabels = allChoices
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
  const confirm = async ({ question, defaultValue, requireExplicit = false }: ConfirmArgs) => {
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
      selectedIds: requireExplicit ? [] : [defaultValue ? 'yes' : 'no'],
      single: true,
      allowEmpty: false,
      requireExplicitSingleSelection: requireExplicit
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

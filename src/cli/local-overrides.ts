import type { ListOverrideScope, Registry, SlotOverrideRule, WorkspaceOverrideConfig } from './types.ts';

export function mergeWorkspaceOverrides(
  base?: WorkspaceOverrideConfig,
  workspace?: WorkspaceOverrideConfig
): WorkspaceOverrideConfig {
  return {
    targets: mergeListOverrideScope(base?.targets, workspace?.targets),
    modules: mergeListOverrideScope(base?.modules, workspace?.modules),
    skills: mergeListOverrideScope(base?.skills, workspace?.skills),
    slots: {
      ...(base?.slots || {}),
      ...(workspace?.slots || {})
    }
  };
}

export function mergeListOverrideScope(base?: ListOverrideScope, workspace?: ListOverrideScope): ListOverrideScope {
  return {
    set: workspace?.set ?? base?.set,
    add: uniqueList([...(base?.add || []), ...(workspace?.add || [])]),
    remove: uniqueList([...(base?.remove || []), ...(workspace?.remove || [])])
  };
}

export function applyListOverride({
  values,
  scope,
  validSet,
  label,
  localOverrideFile
}: {
  values: string[];
  scope?: ListOverrideScope;
  validSet?: Set<string>;
  label: string;
  localOverrideFile: string;
}): { values: string[]; warnings: string[] } {
  const warnings: string[] = [];
  let out = uniqueList(values || []);
  if (!scope) return { values: out, warnings };
  const normalize = (input: string[] | undefined): string[] => uniqueList(input || []);

  if (scope.set && scope.set.length) {
    const setValues = normalize(scope.set);
    if (validSet) ensureValidItems({ list: setValues, validSet, label: `${label}.set`, localOverrideFile });
    out = setValues;
  }

  const addValues = normalize(scope.add);
  if (validSet) ensureValidItems({ list: addValues, validSet, label: `${label}.add`, localOverrideFile });
  for (const item of addValues) {
    if (!out.includes(item)) out.push(item);
  }

  const removeValues = normalize(scope.remove);
  if (validSet) ensureValidItems({ list: removeValues, validSet, label: `${label}.remove`, localOverrideFile });
  const removed = new Set(removeValues);
  if (removed.size) {
    out = out.filter((value) => !removed.has(value));
  }

  return { values: out, warnings };
}

export function applySlotOverrides({
  registry,
  language,
  modules,
  slots,
  localOverrideFile,
  canonicalSlot
}: {
  registry: Registry;
  language: string;
  modules: string[];
  slots: Record<string, SlotOverrideRule>;
  localOverrideFile: string;
  canonicalSlot: (slot: string | undefined) => string | null;
}): { modules: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const lang = registry.languages[language];
  if (!lang) return { modules, warnings };

  const out = uniqueList(modules || []);
  const knownSlots = new Set(registry.slots || []);

  const moduleSlot = (moduleId: string): string | null => {
    const slot = lang.modules[moduleId]?.slot;
    return canonicalSlot(slot);
  };

  const findBySlot = (slot: string): number => out.findIndex((moduleId) => moduleSlot(moduleId) === slot);

  for (const [rawSlot, rule] of Object.entries(slots || {})) {
    const slot = canonicalSlot(rawSlot);
    if (!slot || !knownSlots.has(slot)) {
      throw new Error(`Invalid ${localOverrideFile}: slots.${rawSlot} references unknown slot`);
    }

    if (rule.remove) {
      const idx = findBySlot(slot);
      if (idx >= 0) out.splice(idx, 1);
    }

    if (rule.set) {
      const moduleId = rule.set;
      const def = lang.modules[moduleId];
      if (!def) {
        throw new Error(`Invalid ${localOverrideFile}: slots.${slot}.set references unknown module '${moduleId}'`);
      }
      const moduleCanonicalSlot = canonicalSlot(def.slot);
      if (moduleCanonicalSlot !== slot) {
        throw new Error(
          `Invalid ${localOverrideFile}: slots.${slot}.set module '${moduleId}' belongs to '${moduleCanonicalSlot || '(none)'}'`
        );
      }

      const idx = findBySlot(slot);
      if (idx >= 0) out[idx] = moduleId;
      else out.push(moduleId);
    }
  }

  return { modules: uniqueList(out), warnings };
}

function ensureValidItems({
  list,
  validSet,
  label,
  localOverrideFile
}: {
  list: string[];
  validSet: Set<string>;
  label: string;
  localOverrideFile: string;
}) {
  const invalid = list.filter((value) => !validSet.has(value));
  if (invalid.length) {
    throw new Error(`Invalid ${localOverrideFile}: ${label} contains unknown value(s): ${invalid.join(', ')}`);
  }
}

function uniqueList(items: string[]) {
  return [...new Set(items)];
}

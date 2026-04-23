import type { Registry } from './types.ts';

export function mergeModules({
  registry,
  language,
  parentModules,
  localModules,
  canonicalSlot
}: {
  registry: Registry;
  language: string;
  parentModules: string[];
  localModules: string[];
  canonicalSlot: (slot: string | undefined) => string | null;
}): {
  modules: string[];
  inheritedModules: string[];
  localModules: string[];
  warnings: string[];
} {
  const lang = registry.languages[language];
  const result: string[] = [];
  const owners: Array<'inherited' | 'local'> = [];
  const warnings: string[] = [];

  for (const mod of uniqueList(parentModules)) {
    if (!lang.modules[mod]) continue;
    result.push(mod);
    owners.push('inherited');
  }

  for (const mod of uniqueList(localModules)) {
    const localDef = lang.modules[mod];
    if (!localDef) {
      result.push(mod);
      owners.push('local');
      continue;
    }

    const existingIdx = result.indexOf(mod);
    if (existingIdx >= 0) {
      continue;
    }

    const localSlot = canonicalSlot(localDef.slot);
    if (localSlot) {
      const slotIdx = result.findIndex((existingMod) => {
        const def = lang.modules[existingMod];
        const existingSlot = canonicalSlot(def?.slot);
        return existingSlot && existingSlot === localSlot;
      });

      if (slotIdx >= 0) {
        warnings.push(`Slot override '${localSlot}': ${result[slotIdx]} -> ${mod}`);
        result[slotIdx] = mod;
        owners[slotIdx] = 'local';
        continue;
      }
    }

    result.push(mod);
    owners.push('local');
  }

  const inheritedModules: string[] = [];
  const localOut: string[] = [];
  for (let i = 0; i < result.length; i += 1) {
    if (owners[i] === 'inherited') inheritedModules.push(result[i]);
    else localOut.push(result[i]);
  }

  return {
    modules: result,
    inheritedModules,
    localModules: localOut,
    warnings
  };
}

export function mergeTargets({
  parentTargets,
  localTargets,
  targetsRemoved
}: {
  parentTargets: string[];
  localTargets: string[];
  targetsRemoved: string[];
}) {
  const parent = uniqueList(parentTargets || []);
  const removed = new Set(targetsRemoved || []);
  const local = uniqueList(localTargets || []);
  const merged = new Set(parent);
  for (const target of local) merged.add(target);
  for (const rem of removed) merged.delete(rem);
  return [...merged];
}

export function diffSlots({
  rootModules,
  workspaceModules,
  registry,
  language,
  canonicalSlot
}: {
  rootModules: string[];
  workspaceModules: string[];
  registry: Registry;
  language: string;
  canonicalSlot: (slot: string | undefined) => string | null;
}) {
  const lang = registry.languages[language];
  if (!lang) return [];

  const slotOf = (mod: string) => canonicalSlot(lang.modules[mod]?.slot);
  const rootBySlot = new Map<string, string>();
  const wsBySlot = new Map<string, string>();

  for (const mod of rootModules) {
    const slot = slotOf(mod);
    if (slot) rootBySlot.set(slot, mod);
  }
  for (const mod of workspaceModules) {
    const slot = slotOf(mod);
    if (slot) wsBySlot.set(slot, mod);
  }

  const diffs: string[] = [];
  for (const [slot, rootMod] of rootBySlot.entries()) {
    const wsMod = wsBySlot.get(slot);
    if (wsMod && wsMod !== rootMod) {
      diffs.push(`slot '${slot}' differs from root (${rootMod} -> ${wsMod})`);
    }
  }
  return diffs;
}

function uniqueList(items: string[]) {
  return [...new Set(items)];
}

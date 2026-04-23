import type { Registry } from './types.ts';

export function validateModuleSelection({
  registry,
  language,
  modules,
  canonicalSlot
}: {
  registry: Registry;
  language: string;
  modules: string[];
  canonicalSlot: (slot: string | undefined) => string | null;
}) {
  const lang = registry.languages[language];
  if (!lang) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const slotMap = new Map<string, string>();
  const validSlots = new Set(registry.slots || []);
  for (const moduleId of modules) {
    const moduleDef = lang.modules[moduleId];
    if (!moduleDef) {
      throw new Error(`Unsupported module for ${language}: ${moduleId}`);
    }

    const slot = canonicalSlot(moduleDef.slot);
    if (slot) {
      if (!validSlots.has(slot)) {
        throw new Error(`Unknown slot '${slot}' for module '${moduleId}'`);
      }
      const existing = slotMap.get(slot);
      if (existing) {
        throw new Error(`Slot conflict '${slot}': ${existing} vs ${moduleId}`);
      }
      slotMap.set(slot, moduleId);
    }
  }

  for (const moduleId of modules) {
    const conflicts = new Set(lang.modules[moduleId].conflicts_with || []);
    for (const other of modules) {
      if (other !== moduleId && conflicts.has(other)) {
        throw new Error(`Module conflict: ${moduleId} conflicts with ${other}`);
      }
    }
  }
}

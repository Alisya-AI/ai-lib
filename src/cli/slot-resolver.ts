import { resolveCanonicalSlotAlias } from './utils.ts';
import type { Registry } from './types.ts';

type WriteWarning = (message: string) => void;
export type CanonicalSlotResolver = (registry: Registry, slot: string | undefined) => string | null;
export type RegistryCanonicalSlotResolver = (slot: string | undefined) => string | null;

export function createCanonicalSlotResolver({
  writeWarning
}: {
  writeWarning?: WriteWarning;
} = {}) {
  const warnedSlotAliases = new Set<string>();
  return (registry: Registry, slot: string | undefined) =>
    resolveCanonicalSlotAlias({
      registry,
      slot,
      warnedSlotAliases,
      writeWarning
    });
}

export function bindRegistryCanonicalSlot(
  registry: Registry,
  canonicalSlotResolver: CanonicalSlotResolver
): RegistryCanonicalSlotResolver {
  return (slot) => canonicalSlotResolver(registry, slot);
}

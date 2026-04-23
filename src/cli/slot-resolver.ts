import { canonicalSlot } from './utils.ts';
import type { Registry } from './types.ts';

type WriteWarning = (message: string) => void;

export function createCanonicalSlotResolver({
  writeWarning
}: {
  writeWarning?: WriteWarning;
} = {}) {
  const warnedSlotAliases = new Set<string>();
  return (registry: Registry, slot: string | undefined) =>
    canonicalSlot({
      registry,
      slot,
      warnedSlotAliases,
      writeWarning
    });
}

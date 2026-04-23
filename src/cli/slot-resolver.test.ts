import assert from 'node:assert/strict';
import test from 'node:test';
import { bindRegistryCanonicalSlot, createCanonicalSlotResolver } from './slot-resolver.ts';
import type { Registry } from './types.ts';

function registryWithAlias(): Registry {
  return {
    version: '1',
    slot_aliases: {
      old_slot: 'new_slot'
    },
    languages: {
      ts: {
        modules: {}
      }
    },
    targets: {}
  };
}

test('createCanonicalSlotResolver resolves aliases', () => {
  const resolveCanonicalSlot = createCanonicalSlotResolver({
    writeWarning: () => {}
  });
  assert.equal(resolveCanonicalSlot(registryWithAlias(), 'old_slot'), 'new_slot');
});

test('createCanonicalSlotResolver warns once per alias', () => {
  const warnings: string[] = [];
  const resolveCanonicalSlot = createCanonicalSlotResolver({
    writeWarning: (message) => warnings.push(message)
  });
  const registry = registryWithAlias();

  assert.equal(resolveCanonicalSlot(registry, 'old_slot'), 'new_slot');
  assert.equal(resolveCanonicalSlot(registry, 'old_slot'), 'new_slot');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /is deprecated; use/);
});

test('bindRegistryCanonicalSlot binds resolver to registry', () => {
  const resolver = createCanonicalSlotResolver({ writeWarning: () => {} });
  const bound = bindRegistryCanonicalSlot(registryWithAlias(), resolver);
  assert.equal(bound('old_slot'), 'new_slot');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyListOverride,
  applySlotOverrides,
  mergeListOverrideScope,
  mergeWorkspaceOverrides
} from './local-overrides.ts';
import type { Registry } from './types.ts';

const registry: Registry = {
  version: '1.0.0',
  slots: ['frontend_framework', 'linter'],
  slot_aliases: { framework: 'frontend_framework' },
  languages: {
    typescript: {
      modules: {
        nextjs: { slot: 'frontend_framework' },
        react: { slot: 'frontend_framework' },
        eslint: { slot: 'linter' },
        biome: { slot: 'linter' }
      }
    }
  },
  targets: {
    'claude-code': { output: 'CLAUDE.md' },
    cursor: { output: '.cursor/rules/ailib.mdc' }
  }
};

test('mergeWorkspaceOverrides merges list scopes and slot overrides', () => {
  const merged = mergeWorkspaceOverrides(
    { targets: { add: ['claude-code'] }, slots: { linter: { set: 'eslint' } } },
    { targets: { remove: ['claude-code'] }, slots: { framework: { set: 'nextjs' } } }
  );

  assert.deepEqual(merged.targets, { set: undefined, add: ['claude-code'], remove: ['claude-code'] });
  assert.deepEqual(merged.slots, { linter: { set: 'eslint' }, framework: { set: 'nextjs' } });
});

test('mergeListOverrideScope keeps workspace set and uniques add/remove', () => {
  const merged = mergeListOverrideScope(
    { set: ['a'], add: ['a', 'b'], remove: ['x'] },
    { set: ['b'], add: ['b', 'c'], remove: ['x', 'y'] }
  );
  assert.deepEqual(merged, { set: ['b'], add: ['a', 'b', 'c'], remove: ['x', 'y'] });
});

test('applyListOverride applies set/add/remove and validates entries', () => {
  const result = applyListOverride({
    values: ['claude-code'],
    scope: { set: ['cursor'], add: ['claude-code'], remove: ['cursor'] },
    validSet: new Set(['claude-code', 'cursor']),
    label: 'targets',
    localOverrideFile: 'ailib.local.json'
  });
  assert.deepEqual(result.values, ['claude-code']);
  assert.deepEqual(result.warnings, []);

  assert.throws(
    () =>
      applyListOverride({
        values: [],
        scope: { add: ['unknown'] },
        validSet: new Set(['claude-code']),
        label: 'targets',
        localOverrideFile: 'ailib.local.json'
      }),
    /contains unknown value/
  );
});

test('applySlotOverrides applies slot replacement/removal and validates mismatches', () => {
  const replaced = applySlotOverrides({
    registry,
    language: 'typescript',
    modules: ['eslint', 'nextjs'],
    slots: { linter: { set: 'biome' } },
    localOverrideFile: 'ailib.local.json',
    canonicalSlot: (slot) => (slot ? registry.slot_aliases?.[slot] || slot : null)
  });
  assert.deepEqual(replaced.modules.sort(), ['biome', 'nextjs']);

  const removed = applySlotOverrides({
    registry,
    language: 'typescript',
    modules: ['eslint', 'nextjs'],
    slots: { linter: { remove: true } },
    localOverrideFile: 'ailib.local.json',
    canonicalSlot: (slot) => (slot ? registry.slot_aliases?.[slot] || slot : null)
  });
  assert.deepEqual(removed.modules, ['nextjs']);

  assert.throws(
    () =>
      applySlotOverrides({
        registry,
        language: 'typescript',
        modules: ['eslint'],
        slots: { framework: { set: 'eslint' } },
        localOverrideFile: 'ailib.local.json',
        canonicalSlot: (slot) => (slot ? registry.slot_aliases?.[slot] || slot : null)
      }),
    /belongs to 'linter'/
  );
});

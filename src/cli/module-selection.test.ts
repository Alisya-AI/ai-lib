import test from 'node:test';
import assert from 'node:assert/strict';
import { diffSlots, mergeModules, mergeTargets } from './module-selection.ts';
import type { Registry } from './types.ts';

const registry: Registry = {
  version: '1.0.0',
  slots: ['frontend_framework', 'linter'],
  languages: {
    typescript: {
      modules: {
        react: { slot: 'frontend_framework' },
        nextjs: { slot: 'frontend_framework' },
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

const canonicalSlot = (slot: string | undefined) => slot ?? null;

test('mergeModules replaces inherited module by slot with local override', () => {
  const result = mergeModules({
    registry,
    language: 'typescript',
    parentModules: ['react', 'eslint'],
    localModules: ['nextjs', 'biome'],
    canonicalSlot
  });

  assert.deepEqual(result.modules, ['nextjs', 'biome']);
  assert.deepEqual(result.inheritedModules, []);
  assert.deepEqual(result.localModules, ['nextjs', 'biome']);
  assert.match(result.warnings.join('\n'), /Slot override 'frontend_framework': react -> nextjs/);
  assert.match(result.warnings.join('\n'), /Slot override 'linter': eslint -> biome/);
});

test('mergeModules keeps unknown local modules for later validation', () => {
  const result = mergeModules({
    registry,
    language: 'typescript',
    parentModules: ['eslint'],
    localModules: ['custom-module'],
    canonicalSlot
  });

  assert.deepEqual(result.modules, ['eslint', 'custom-module']);
  assert.deepEqual(result.inheritedModules, ['eslint']);
  assert.deepEqual(result.localModules, ['custom-module']);
});

test('mergeTargets applies dedupe and removals', () => {
  const merged = mergeTargets({
    parentTargets: ['claude-code', 'cursor'],
    localTargets: ['cursor', 'claude-code'],
    targetsRemoved: ['cursor']
  });
  assert.deepEqual(merged, ['claude-code']);
});

test('diffSlots reports slot differences between root and workspace', () => {
  const diffs = diffSlots({
    rootModules: ['react', 'eslint'],
    workspaceModules: ['nextjs', 'eslint'],
    registry,
    language: 'typescript',
    canonicalSlot
  });

  assert.deepEqual(diffs, ["slot 'frontend_framework' differs from root (react -> nextjs)"]);
});

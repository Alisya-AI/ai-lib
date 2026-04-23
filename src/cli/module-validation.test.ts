import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModuleSelection } from './module-validation.ts';
import type { Registry } from './types.ts';

const registry: Registry = {
  version: '1.0.0',
  slots: ['frontend_framework', 'linter', 'runtime_platform', 'formatter'],
  languages: {
    typescript: {
      modules: {
        nextjs: { slot: 'frontend_framework' },
        react: { slot: 'frontend_framework' },
        eslint: { slot: 'linter' },
        biome: { slot: 'linter' },
        bun: { slot: 'runtime_platform', conflicts_with: ['nodejs'] },
        nodejs: { slot: 'runtime_platform' },
        prettier: { slot: 'formatter', conflicts_with: ['eslint'] }
      }
    }
  },
  targets: {
    'claude-code': { output: 'CLAUDE.md' }
  }
};

const canonicalSlot = (slot: string | undefined) => slot ?? null;

test('validateModuleSelection accepts valid non-conflicting module set', () => {
  assert.doesNotThrow(() => {
    validateModuleSelection({
      registry,
      language: 'typescript',
      modules: ['nextjs', 'eslint', 'bun'],
      canonicalSlot
    });
  });
});

test('validateModuleSelection rejects unsupported language and module', () => {
  assert.throws(
    () =>
      validateModuleSelection({
        registry,
        language: 'python',
        modules: ['pytest'],
        canonicalSlot
      }),
    /Unsupported language: python/
  );

  assert.throws(
    () =>
      validateModuleSelection({
        registry,
        language: 'typescript',
        modules: ['unknown-module'],
        canonicalSlot
      }),
    /Unsupported module for typescript: unknown-module/
  );
});

test('validateModuleSelection rejects slot conflicts and unknown slot mapping', () => {
  assert.throws(
    () =>
      validateModuleSelection({
        registry,
        language: 'typescript',
        modules: ['nextjs', 'react'],
        canonicalSlot
      }),
    /Slot conflict 'frontend_framework': nextjs vs react/
  );

  const badRegistry: Registry = {
    ...registry,
    languages: {
      ...registry.languages,
      typescript: {
        modules: {
          ...registry.languages.typescript.modules,
          badslot: { slot: 'missing_slot' }
        }
      }
    }
  };
  assert.throws(
    () =>
      validateModuleSelection({
        registry: badRegistry,
        language: 'typescript',
        modules: ['badslot'],
        canonicalSlot
      }),
    /Unknown slot 'missing_slot' for module 'badslot'/
  );
});

test('validateModuleSelection rejects explicit module conflicts', () => {
  assert.throws(
    () =>
      validateModuleSelection({
        registry,
        language: 'typescript',
        modules: ['eslint', 'prettier'],
        canonicalSlot
      }),
    /Module conflict: prettier conflicts with eslint/
  );
});

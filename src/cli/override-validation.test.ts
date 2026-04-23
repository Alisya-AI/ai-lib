import test from 'node:test';
import assert from 'node:assert/strict';

import { isRecord, validateListOverrideScope, validateWorkspaceOverride } from './override-validation.ts';
import type { Registry } from './types.ts';

const registry: Registry = {
  version: '1.0.0',
  slots: ['frontend_framework', 'linter'],
  slot_aliases: { framework: 'frontend_framework' },
  slot_alias_meta: {
    framework: {
      replacement: 'frontend_framework',
      deprecated_since: '1.0.0',
      remove_in: '2.0.0'
    }
  },
  languages: {
    typescript: {
      modules: {
        eslint: { slot: 'linter' },
        nextjs: { slot: 'frontend_framework' }
      }
    }
  },
  targets: {
    'claude-code': { output: 'CLAUDE.md' },
    cursor: { output: '.cursor/rules/ailib.mdc' }
  }
};

test('isRecord detects plain objects only', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord('text'), false);
});

test('validateListOverrideScope validates shape and unknown values', () => {
  const errors = validateListOverrideScope({
    scope: { set: ['claude-code', 'unknown'], add: 'invalid' },
    label: 'default_override.targets',
    validSet: new Set(['claude-code', 'cursor']),
    valueLabel: 'target'
  });

  assert.match(errors.join('\n'), /contains unknown target 'unknown'/);
  assert.match(errors.join('\n'), /'default_override\.targets\.add' must be an array/);
});

test('validateWorkspaceOverride validates non-object values and unsupported keys', () => {
  const nonObjectErrors = validateWorkspaceOverride({
    override: false,
    label: 'default_override',
    registry,
    canonicalSlot: (slot) => slot ?? null
  });
  assert.match(nonObjectErrors.join('\n'), /'default_override' must be an object/);

  const errors = validateWorkspaceOverride({
    override: { unknown: true },
    label: 'default_override',
    registry,
    canonicalSlot: (slot) => slot ?? null
  });

  assert.match(errors.join('\n'), /'default_override' has unsupported key 'unknown'/);
});

test('validateWorkspaceOverride validates slots and alias resolution', () => {
  const errors = validateWorkspaceOverride({
    override: {
      slots: {
        framework: { set: 123, remove: 'nope', extra: true },
        invalid_slot: { set: 'nextjs' }
      }
    },
    label: 'workspace_overrides.apps/web',
    registry,
    canonicalSlot: (slot) => {
      if (!slot) return null;
      return registry.slot_aliases?.[slot] || slot;
    }
  });

  const output = errors.join('\n');
  assert.match(output, /references unknown slot/);
  assert.match(output, /has unsupported key 'extra'/);
  assert.match(output, /\.set' must be a string/);
  assert.match(output, /\.remove' must be a boolean/);
});

test('validateWorkspaceOverride validates slot scopes and slot rule objects', () => {
  const errors = validateWorkspaceOverride({
    override: {
      slots: {
        linter: 'invalid'
      }
    },
    label: 'workspace_overrides.apps/web',
    registry,
    canonicalSlot: (slot) => slot ?? null
  });

  assert.match(errors.join('\n'), /'workspace_overrides\.apps\/web\.slots\.linter' must be an object/);

  const nonObjectSlotsErrors = validateWorkspaceOverride({
    override: { slots: true },
    label: 'workspace_overrides.apps/web',
    registry,
    canonicalSlot: (slot) => slot ?? null
  });
  assert.match(nonObjectSlotsErrors.join('\n'), /'workspace_overrides\.apps\/web\.slots' must be an object/);
});

test('validateListOverrideScope validates non-object and unsupported keys', () => {
  const nonObjectErrors = validateListOverrideScope({
    scope: null,
    label: 'workspace_overrides.apps/web.modules',
    valueLabel: 'module'
  });
  assert.match(nonObjectErrors.join('\n'), /must be an object/);

  const unsupportedErrors = validateListOverrideScope({
    scope: { invalid: ['eslint'], set: [''] },
    label: 'workspace_overrides.apps/web.modules',
    valueLabel: 'module'
  });
  assert.match(unsupportedErrors.join('\n'), /has unsupported key 'invalid'/);
  assert.match(unsupportedErrors.join('\n'), /must contain non-empty strings/);
});

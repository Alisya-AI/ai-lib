import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSkillSelection } from './skill-validation.ts';
import type { Registry } from './types.ts';

const registry: Registry = {
  version: '1.0.0',
  languages: {
    typescript: {
      modules: {}
    }
  },
  targets: {
    cursor: { output: '.cursor/rules/ailib.mdc' }
  },
  skills: {
    'task-driven-gh-flow': {
      display: 'Task-driven GH flow',
      path: '.cursor/skills/task-driven-gh-flow/SKILL.md'
    },
    'code-review': {
      display: 'Code review workflow',
      path: '.cursor/skills/code-review/SKILL.md',
      requires: ['task-driven-gh-flow'],
      compatible: {
        languages: ['typescript'],
        modules: ['eslint', 'biome'],
        targets: ['cursor']
      }
    },
    'release-manager': {
      display: 'Release manager workflow',
      path: '.cursor/skills/release-manager/SKILL.md',
      conflicts_with: ['code-review']
    }
  }
};

test('validateSkillSelection accepts valid dependency graph', () => {
  assert.doesNotThrow(() => {
    validateSkillSelection({
      registry,
      skills: ['task-driven-gh-flow', 'code-review'],
      language: 'typescript',
      modules: ['eslint'],
      targets: ['cursor']
    });
  });
});

test('validateSkillSelection rejects unknown skill id', () => {
  assert.throws(
    () =>
      validateSkillSelection({
        registry,
        skills: ['unknown-skill'],
        language: 'typescript',
        modules: ['eslint'],
        targets: ['cursor']
      }),
    /Unsupported skill: unknown-skill/
  );
});

test('validateSkillSelection rejects missing required skill', () => {
  assert.throws(
    () =>
      validateSkillSelection({
        registry,
        skills: ['code-review'],
        language: 'typescript',
        modules: ['eslint'],
        targets: ['cursor']
      }),
    /Skill dependency missing: code-review requires task-driven-gh-flow/
  );
});

test('validateSkillSelection rejects conflicting skill set', () => {
  assert.throws(
    () =>
      validateSkillSelection({
        registry,
        skills: ['task-driven-gh-flow', 'code-review', 'release-manager'],
        language: 'typescript',
        modules: ['eslint'],
        targets: ['cursor']
      }),
    /Skill conflict: release-manager conflicts with code-review/
  );
});

test('validateSkillSelection rejects incompatible language', () => {
  assert.throws(
    () =>
      validateSkillSelection({
        registry,
        skills: ['task-driven-gh-flow', 'code-review'],
        language: 'python',
        modules: ['eslint'],
        targets: ['cursor']
      }),
    /Skill compatibility mismatch: code-review supports languages \[typescript\], got python/
  );
});

test('validateSkillSelection rejects incompatible target selection', () => {
  assert.throws(
    () =>
      validateSkillSelection({
        registry,
        skills: ['task-driven-gh-flow', 'code-review'],
        language: 'typescript',
        modules: ['eslint'],
        targets: ['copilot']
      }),
    /Skill compatibility mismatch: code-review supports targets \[cursor\], got \[copilot\]/
  );
});

test('validateSkillSelection rejects incompatible module selection', () => {
  assert.throws(
    () =>
      validateSkillSelection({
        registry,
        skills: ['task-driven-gh-flow', 'code-review'],
        language: 'typescript',
        modules: ['nextjs'],
        targets: ['cursor']
      }),
    /Skill compatibility mismatch: code-review supports modules \[eslint, biome\], got \[nextjs\]/
  );
});

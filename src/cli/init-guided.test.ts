import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveGuidedInitSelections } from './init-guided.ts';
import type { Registry } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-init-guided-'));
}

const registry: Registry = {
  version: 'test',
  slots: ['linter'],
  languages: {
    typescript: { modules: { eslint: { slot: 'linter' } } },
    python: { modules: { ruff: { slot: 'linter' } } }
  },
  targets: {
    cursor: { output: '.cursor/rules/ailib.mdc' },
    'claude-code': { output: 'CLAUDE.md' }
  },
  skills: {
    'architecture-decision-flow': {
      display: 'Architecture decision flow',
      path: 'skills/architecture-decision-flow.md',
      skill_type: 'architecture',
      compatible: {
        languages: ['typescript'],
        targets: ['cursor', 'claude-code']
      }
    },
    'release-readiness': {
      display: 'Release readiness',
      path: 'skills/release-readiness.md',
      skill_type: 'reliability',
      requires: ['architecture-decision-flow'],
      compatible: {
        languages: ['typescript'],
        targets: ['cursor', 'claude-code']
      }
    }
  }
};

test('resolveGuidedInitSelections falls back to defaults when not interactive', async () => {
  const rootDir = await tempDir();
  const result = await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: true,
    workspacePatterns: [],
    defaults: {
      language: 'typescript',
      modules: ['eslint'],
      targets: ['cursor'],
      skills: ['architecture-decision-flow']
    },
    promptIO: { interactive: false }
  });

  assert.equal(result.language, 'typescript');
  assert.deepEqual(result.modules, ['eslint']);
  assert.deepEqual(result.targets, ['cursor']);
  assert.deepEqual(result.skills, ['architecture-decision-flow']);
  assert.deepEqual(result.workspaceLanguageOverrides, {});
});

test('resolveGuidedInitSelections retries invalid input and auto-adds required skills', async () => {
  const rootDir = await tempDir();
  await fs.mkdir(path.join(rootDir, 'apps', 'web'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'services', 'ml'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'apps', 'web', 'ailib.config.json'), '{"language":"typescript"}\n', 'utf8');

  const answers = [
    '9', // invalid target answer
    '1,2', // valid targets
    '2', // typescript
    '', // modules -> defaults (none)
    '2', // release-readiness (auto-add architecture dependency)
    'maybe', // invalid yes/no answer
    'y', // confirm workspace overrides
    '1' // services/ml language = python
  ];
  const writes: string[] = [];
  const result = await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: false,
    workspacePatterns: ['apps/*', 'services/*'],
    defaults: {
      language: 'typescript',
      modules: [],
      targets: ['cursor', 'claude-code'],
      skills: []
    },
    promptIO: {
      interactive: true,
      ask: async () => answers.shift() || '',
      write: (line: string) => writes.push(line)
    }
  });

  assert.deepEqual(result.targets, ['claude-code', 'cursor']);
  assert.equal(result.language, 'typescript');
  assert.deepEqual(result.modules, []);
  assert.deepEqual(result.skills, ['release-readiness', 'architecture-decision-flow']);
  assert.deepEqual(result.workspaceLanguageOverrides, { 'services/ml': 'python' });
  assert.match(writes.join(''), /Invalid selection/);
  assert.match(writes.join(''), /Please answer yes or no/);
  assert.match(writes.join(''), /Auto-selected required skills/);
  assert.match(writes.join(''), /already has ailib\.config\.json/);
});
